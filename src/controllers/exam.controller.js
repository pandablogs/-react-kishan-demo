import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import Question from "../models/Question.js";
import PublishedExam from "../models/PublishedExam.js";
import Attempt from "../models/Attempt.js";
import User from "../models/User.js";
import Badge from "../models/Badge.js";
import { extractTextFromFile } from "../utils/extractText.js";
import { generateQuestionsFromText } from "../utils/aiQuestionGenerator.js";
import { storeTextToVector } from "../utils/vectorStore.js";
import { generateExamPDF } from "../utils/pdfGenerator.js";
import llm from "../config/llm.js";
import { HumanMessage } from "@langchain/core/messages";
import path from "path";
import fs from "fs";

// Simple hourly cache for leaderboard
let leaderboardCache = {
  overall: { data: null, lastUpdated: 0 },
  weekly: { data: null, lastUpdated: 0 },
  monthly: { data: null, lastUpdated: 0 }
};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour


/* =========================
   CREATE EXAM
========================= */
export const createExam = async (req, res) => {
  try {
    const filesData = [];

    if (req.files?.length) {
      for (const file of req.files) {
        try {
          const text = await extractTextFromFile(file);
          filesData.push({
            originalName: file.originalname,
            extractedText: text || "Extraction empty",
          });
        } catch (err) {
          console.error(`Extraction failed for ${file.originalname}:`, err);
          filesData.push({
            originalName: file.originalname,
            extractedText: "Text extraction failed, using static flow fallback.",
          });
        }
      }
    }

    const exam = await Exam.create({
      ...req.body,
      duration: req.body.timeLimit || req.body.duration,
      timeLimitType: req.body.timeLimitType || "overall",
      subjects: typeof req.body.subjects === 'string' ? JSON.parse(req.body.subjects || "[]") : req.body.subjects,
      topics: typeof req.body.topics === 'string' ? JSON.parse(req.body.topics || "[]") : req.body.topics,
      files: filesData,
      createdBy: req.user._id,
    });

    // Store in vector database
    for (const fileData of filesData) {
      await storeTextToVector(fileData.extractedText, {
        examId: exam._id.toString(),
        originalName: fileData.originalName,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Exam created successfully",
      data: exam,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   UPDATE EXAM
========================= */
export const updateExam = async (req, res) => {
  try {
    const examId = req.params.examId;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const filesData = [...(exam.files || [])];

    // Append new uploaded files
    if (req.files?.length) {
      for (const file of req.files) {
        try {
          const text = await extractTextFromFile(file);
          filesData.push({
            originalName: file.originalname,
            extractedText: text || "Extraction empty",
          });
        } catch (err) {
          filesData.push({
            originalName: file.originalname,
            extractedText: "Text extraction failed.",
          });
        }
      }
    }

    exam.title = req.body.title || exam.title;
    exam.description = req.body.description !== undefined ? req.body.description : exam.description;
    exam.duration = req.body.timeLimit || req.body.duration || exam.duration;
    exam.timeLimitType = req.body.timeLimitType || exam.timeLimitType;
    exam.difficulty = req.body.difficulty || exam.difficulty;
    if (req.body.subject) exam.subject = req.body.subject;

    if (req.body.subjects) exam.subjects = typeof req.body.subjects === 'string' ? JSON.parse(req.body.subjects || "[]") : req.body.subjects;
    if (req.body.topics) exam.topics = typeof req.body.topics === 'string' ? JSON.parse(req.body.topics || "[]") : req.body.topics;

    if (req.body.numberOfQuestions) {
      exam.numberOfQuestions = Number(req.body.numberOfQuestions);
    }

    exam.files = filesData;

    await exam.save();

    for (const fileData of filesData) {
      await storeTextToVector(fileData.extractedText, {
        examId: exam._id.toString(),
        originalName: fileData.originalName,
      }).catch(e => console.error("Vector store failed on update:", e));
    }

    return res.status(200).json({
      success: true,
      message: "Exam updated successfully",
      data: exam,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   ADD MANUAL QUESTION
========================= */
export const addManualQuestion = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    if (exam.status === "PUBLISHED") {
      return res.status(400).json({
        success: false,
        message: "Exam is published. Cannot add questions.",
      });
    }

    const question = await Question.create({
      ...req.body,
      examId: req.params.examId,
      source: "MANUAL",
      isApproved: false,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Question added successfully",
      data: question,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   GET QUESTIONS (TEACHER)
========================= */
export const getQuestions = async (req, res) => {
  try {
    const { examId } = req.params;

    // ✅ Prevent MongoDB crash
    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid exam ID",
      });
    }

    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // Allow admin to view any exam's questions; teachers can only view their own
    if (req.user.role !== "admin" && exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 500; // return all questions by default
    const skip = (page - 1) * limit;

    const totalItems = await Question.countDocuments({ examId });
    const questions = await Question.find({ examId })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      total: totalItems,
      data: questions,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        pageSize: limit
      }
    });

  } catch (error) {
    console.error("Get Questions Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   APPROVE QUESTION
========================= */
export const approveQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    const exam = await Exam.findById(question.examId);
    if (!exam || exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    question.isApproved = true;
    await question.save();

    return res.status(200).json({
      success: true,
      message: "Question approved successfully",
      data: question,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   UPDATE QUESTION
========================= */
export const updateQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    const exam = await Exam.findById(question.examId);
    if (!exam || exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    if (exam.status === "PUBLISHED") {
      return res.status(400).json({
        success: false,
        message: "Exam is published. Cannot edit question.",
      });
    }

    const allowedFields = ["text", "marks", "subject", "difficulty", "options", "correctAnswer", "isApproved"];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        question[field] = req.body[field];
      }
    });

    await question.save();

    return res.status(200).json({
      success: true,
      message: "Question updated successfully",
      data: question,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   DELETE QUESTION
========================= */
export const deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    const exam = await Exam.findById(question.examId);
    if (!exam || exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    if (exam.status === "PUBLISHED") {
      return res.status(400).json({
        success: false,
        message: "Exam is published. Cannot delete question.",
      });
    }

    await question.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Question deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   BULK APPROVE ALL QUESTIONS
========================= */
export const bulkApproveQuestions = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    if (exam.status === "PUBLISHED") {
      return res.status(400).json({
        success: false,
        message: "Exam is already published.",
      });
    }

    const isApproved = req.body.isApproved !== undefined ? req.body.isApproved : true;

    const result = await Question.updateMany(
      { examId: req.params.examId },
      { $set: { isApproved } }
    );

    return res.status(200).json({
      success: true,
      message: "All questions approved successfully",
      approvedCount: result.modifiedCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   TASK QUEUE FOR AI GENERATION
========================= */
const generationQueue = [];
let isProcessing = false;

const processNextInQueue = async () => {
  if (isProcessing || generationQueue.length === 0) return;

  isProcessing = true;
  const { examId, req, res } = generationQueue.shift();

  try {
    const exam = await Exam.findById(examId);
    if (!exam) {
      console.error(`Exam ${examId} not found in queue`);
      isProcessing = false;
      processNextInQueue();
      return;
    }

    exam.status = "PROCESSING";
    exam.processingMessage = "Starting AI generation...";
    await exam.save();

    const combinedText = exam.files.map((f) => f.extractedText).join("\n");

    // Count existing approved questions to avoid duplicating them
    const approvedCount = await Question.countDocuments({ examId, isApproved: true });

    // Safety fallback for subjects and question count
    const subjectsToProcess = exam.subjects && exam.subjects.length > 0 ? exam.subjects : ["General"];
    const totalQty = exam.numberOfQuestions && exam.numberOfQuestions > 0 ? exam.numberOfQuestions : 4;

    // Calculate how many more questions we need to reach the totalQty
    const remainingQty = Math.max(0, totalQty - approvedCount);

    if (remainingQty === 0) {
      exam.status = "REVIEW";
      exam.processingMessage = "AI generation complete (Required number of questions already locked).";
      await exam.save();
      isProcessing = false;
      processNextInQueue();
      return;
    }

    // Process subjects sequentially
    for (let i = 0; i < subjectsToProcess.length; i++) {
      const subject = subjectsToProcess[i];
      exam.processingMessage = `Generating questions for ${subject}... (${i + 1}/${subjectsToProcess.length})`;
      await exam.save();

      const questions = await generateQuestionsFromText({
        text: combinedText,
        difficulty: exam.difficulty || "Medium",
        subjects: [subject], // Process one subject at a time
        count: Math.ceil(remainingQty / subjectsToProcess.length), // Distribute remaining questions
        language: exam.language || "English",
        topics: exam.topics,
      });

      if (questions && questions.length > 0) {
        await Question.insertMany(
          questions.map((q) => ({
            examId: exam._id,
            ...q,
            source: "AI",
            isApproved: false,
            createdBy: exam.createdBy,
          }))
        );
      }
    }

    exam.status = "REVIEW";
    exam.processingMessage = "AI generation complete.";
    await exam.save();

  } catch (error) {
    console.error("AI Generation Error:", error);
    try {
      const exam = await Exam.findById(examId);
      if (exam) {
        exam.status = "CREATED";
        exam.processingMessage = `Error: ${error.message}`;
        await exam.save();
      }
    } catch (dbError) {
      console.error("Error updating exam status after failure:", dbError);
    }
  } finally {
    isProcessing = false;
    processNextInQueue();
  }
};

/* =========================
   GENERATE AI QUESTIONS
========================= */
export const generateAIQuestions = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    if (exam.status === "PUBLISHED") {
      return res.status(400).json({
        success: false,
        message: "Exam is already published. AI generation is locked.",
      });
    }

    if (exam.status === "PROCESSING" && !req._isRegenerating) {
      return res.status(400).json({
        success: false,
        message: "Exam is already being processed.",
      });
    }

    const combinedText = exam.files.map((f) => f.extractedText).join("\n");
    if (!combinedText.trim()) {
      return res.status(400).json({
        success: false,
        message: "No syllabus text available for AI generation",
      });
    }

    // Add to queue
    generationQueue.push({ examId: exam._id, req, res });

    // Start processing if not already
    processNextInQueue();

    return res.status(202).json({
      success: true,
      message: "AI question generation started. You will be notified once complete.",
      status: "PROCESSING"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   REGENERATE AI QUESTIONS
========================= */
export const regenerateAIQuestions = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    // Allow regeneration even for published exams (resets to REVIEW after generation)

    // Set status to PROCESSING immediately to notify UI
    exam.status = "PROCESSING";
    exam.processingMessage = "Deleting old questions and preparing for regeneration...";
    await exam.save();

    await Question.deleteMany({
      examId: req.params.examId,
      source: "AI",
      isApproved: false, // Only delete unapproved questions
    });

    req._isRegenerating = true;
    return generateAIQuestions(req, res);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   IMPORT STATIC EXAM
========================= */
export const importStaticExam = async (req, res) => {
  try {
    const { examDetails, questions } = req.body;

    if (!examDetails || !questions || !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        message: "Missing examDetails or questions array",
      });
    }

    // 1. Check if it's an existing draft, otherwise Create the Exam document
    let exam;
    if (examDetails._id) {
      exam = await Exam.findById(examDetails._id);
    }

    if (exam) {
      exam.title = examDetails.title || exam.title;
      exam.subject = examDetails.subject || exam.subject;
      if (examDetails.subjects) exam.subjects = examDetails.subjects;
      if (examDetails.topics) exam.topics = examDetails.topics;
      if (examDetails.difficulty) exam.difficulty = examDetails.difficulty;
      if (examDetails.timeLimit) exam.duration = examDetails.timeLimit;
      if (examDetails.timeLimitType) exam.timeLimitType = examDetails.timeLimitType;
      if (examDetails.description !== undefined) exam.description = examDetails.description;
      exam.status = examDetails.status || "PUBLISHED";
      await exam.save();
      // Clear old manual questions if we are replacing them from the draft
      await Question.deleteMany({ examId: exam._id });
    } else {
      exam = await Exam.create({
        ...examDetails,
        subjects: examDetails.subjects || [],
        topics: examDetails.topics || [],
        createdBy: req.user._id,
        status: examDetails.status || "PUBLISHED",
      });
    }

    // 2. Format and Insert Questions
    const formattedQuestions = questions.map((q) => {
      const { _id, id, ...rest } = q;
      return {
        ...rest,
        examId: exam._id,
        createdBy: req.user._id,
        source: "MANUAL",
        isApproved: true, // Auto-approve static data from frontend
      };
    });

    const result = await Question.insertMany(formattedQuestions);

    return res.status(201).json({
      success: true,
      message: "Static exam and questions imported successfully",
      data: {
        examId: exam._id,
        questionCount: result.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   PUBLISH EXAM
========================= */
export const publishExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    // Allow re-publishing after regeneration (status will be REVIEW)
    const lockedQuestions = await Question.find({
      examId: exam._id,
      isApproved: true
    }).lean();

    if (!lockedQuestions.length) {
      return res.status(400).json({
        success: false,
        message: "No approved (locked) questions. Please approve at least one question before publishing.",
      });
    }

    const totalMarks = lockedQuestions.reduce(
      (sum, q) => sum + q.marks,
      0
    );

    // Create a directory for exams if it doesn't exist
    const examsDir = path.join(process.cwd(), "uploads", "exams");
    if (!fs.existsSync(examsDir)) {
      fs.mkdirSync(examsDir, { recursive: true });
    }

    const pdfFilename = `exam_${exam._id}_${Date.now()}.pdf`;
    const pdfPath = path.join(examsDir, pdfFilename);

    const examData = {
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      duration: exam.duration,
      timeLimitType: exam.timeLimitType,
      subjects: exam.subjects,
      difficulty: exam.difficulty,
      language: exam.language,
      topics: exam.topics,
      totalMarks: totalMarks,
    };

    // Generate PDF
    await generateExamPDF(
      examData,
      lockedQuestions,
      pdfPath
    );

    const publishedExam = await PublishedExam.create({
      examId: exam._id,
      createdBy: req.user._id,   // ✅ ADD THIS
      ...examData,
      questions: lockedQuestions.map((q) => ({

        questionId: q._id,

        text: q.text,

        options: q.options,

        correctAnswer: q.correctAnswer,

        marks: q.marks,

      })),

      totalMarks,
      pdfPath: `/uploads/exams/${pdfFilename}`,
      publishedAt: new Date(),
    });

    exam.status = "PUBLISHED";
    await exam.save();

    const serverUrl = process.env.SERVER_URL || "http://localhost:5000";
    const pdfUrl = `${serverUrl}/uploads/exams/${pdfFilename}`;

    return res.status(200).json({
      success: true,
      message: "Exam published and PDF generated successfully",
      totalQuestions: lockedQuestions.length,
      totalMarks,
      pdfUrl,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   GET EXAM STATUS
========================= */
export const getExamStatus = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        status: exam.status,
        timeLimitType: exam.timeLimitType,
        processingMessage: exam.processingMessage,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   GET ALL EXAMS (TEACHER)
========================= */
export const getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find({ createdBy: req.user._id }).sort({ createdAt: -1 });

    // For each exam, count number of questions
    const examsWithCount = await Promise.all(exams.map(async (exam) => {
      const questionsCount = await Question.countDocuments({ examId: exam._id, isApproved: true });
      return {
        ...exam._doc,
        questionsCount
      };
    }));

    return res.status(200).json({
      success: true,
      count: examsWithCount.length,
      data: examsWithCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   GET PUBLISHED EXAMS
========================= */
export const getPublishedExams = async (req, res) => {
  try {
    const publishedExams = await PublishedExam.find({
      createdBy: req.user._id   // ✅ FILTER BY USER
    }).sort({ publishedAt: -1 });

    return res.status(200).json({
      success: true,
      count: publishedExams.length,
      data: publishedExams,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   GET PUBLISHED EXAM BY ID
========================= */
export const getPublishedExamById = async (req, res) => {
  try {
    const publishedExam = await PublishedExam.findOne({
      _id: req.params.id,
      createdBy: req.user._id   // ✅ Prevent access to others
    });

    if (!publishedExam) {
      return res.status(404).json({
        success: false,
        message: "Published exam not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: publishedExam,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
/* =========================
   DELETE EXAM (TEACHER)
========================= */
export const deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // Only owner can delete
    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this exam",
      });
    }

    // 🔥 If exam was published → remove published record
    if (exam.status === "PUBLISHED") {
      const publishedExam = await PublishedExam.findOne({
        examId: exam._id,
      });

      if (publishedExam) {
        // Optional: delete PDF file from server
        if (publishedExam.pdfPath) {
          const filePath = path.join(process.cwd(), publishedExam.pdfPath);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }

        await publishedExam.deleteOne();
      }
    }

    // Delete related questions
    await Question.deleteMany({ examId: exam._id });

    // Delete exam itself
    await exam.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Exam deleted successfully (including published data if existed)",
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   GET EXAM BY ID (TEACHER)
========================= */
export const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    const questionsCount = await Question.countDocuments({ examId: exam._id });

    return res.status(200).json({
      success: true,
      data: {
        ...exam._doc,
        questionsCount
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
/* =========================
   GET ALL PUBLISHED EXAMS (STUDENT)
========================= */
export const studentGetAllExams = async (req, res) => {
  try {
    const publishedExams = await PublishedExam.find()
      .populate("createdBy", "firstName lastName university college")
      .sort({ publishedAt: -1 })
      .lean();

    // Fetch attempts for this student to mark completion
    const attempts = await Attempt.find({ studentId: req.user._id });
    const completedExamIds = attempts.map(a => a.examId.toString());

    const examsWithStatus = publishedExams.map(exam => {
      const attempt = attempts.find(a => a.examId.toString() === exam._id.toString());
      return {
        ...exam,
        isCompleted: !!attempt,
        score: attempt?.score || 0,
        totalMarks: attempt?.totalMarks || exam.totalMarks || 0,
        percentage: attempt ? (attempt.score / attempt.totalMarks) * 100 : 0,
        timeTaken: attempt?.timeTaken,
        avgTimePerQuestion: attempt?.avgTimePerQuestion,
        totalQuestions: attempt?.totalQuestions,
        attemptedCount: attempt?.attemptedCount,
        correctCount: attempt?.correctCount,
        wrongCount: attempt?.wrongCount
      };
    });

    return res.status(200).json({
      success: true,
      count: examsWithStatus.length,
      data: examsWithStatus,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   SUBMIT EXAM (STUDENT)
 ========================= */
export const submitExam = async (req, res) => {
  try {
    const { examId, answers, timeTaken, avgTimePerQuestion, stats } = req.body;
    const studentId = req.user._id;

    // Check for existing attempt
    const existingAttempt = await Attempt.findOne({ studentId, examId });

    const publishedExam = await PublishedExam.findById(examId);
    if (!publishedExam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // Gamified Scoring System: Base 10 pts + Difficulty Multiplier
    let score = 0;
    let maxPossibleScore = 0;

    publishedExam.questions.forEach(q => {
      let multiplier = 1;
      if (q.difficulty) {
        const d = q.difficulty.toUpperCase();
        if (d === 'MEDIUM') multiplier = 1.5;
        else if (d === 'HARD') multiplier = 2;
      }
      maxPossibleScore += (10 * multiplier);
    });

    const gradedAnswers = answers.map(ans => {
      const question = publishedExam.questions.find(q => q.questionId.toString() === ans.questionId);
      const isCorrect = question && question.correctAnswer === ans.selectedOption;
      
      if (isCorrect && question) {
        let multiplier = 1;
        if (question.difficulty) {
          const d = question.difficulty.toUpperCase();
          if (d === 'MEDIUM') multiplier = 1.5;
          else if (d === 'HARD') multiplier = 2;
        }
        score += (10 * multiplier);
      }
      
      return {
        ...ans,
        isCorrect
      };
    });

    let finalAttempt;
    if (existingAttempt) {
      // Retake Logic: Only update if score is higher
      if (score > existingAttempt.score) {
        existingAttempt.answers = answers;
        existingAttempt.score = score;
        existingAttempt.totalMarks = maxPossibleScore;
        existingAttempt.totalQuestions = stats?.totalQuestions || publishedExam.questions.length;
        existingAttempt.attemptedCount = stats?.attemptedCount || answers.length;
        existingAttempt.correctCount = stats?.correctCount || gradedAnswers.filter(a => a.isCorrect).length;
        existingAttempt.wrongCount = stats?.wrongCount || (answers.length - gradedAnswers.filter(a => a.isCorrect).length);
        existingAttempt.timeTaken = timeTaken;
        existingAttempt.avgTimePerQuestion = avgTimePerQuestion;
        await existingAttempt.save();
        finalAttempt = existingAttempt;
      } else {
        // Score is lower or same, keep old high score but return current result for UI
        finalAttempt = {
          ...existingAttempt.toObject(),
          currentAttemptScore: score, // Optional: show they got this score now, but high score is kept
          isHighScoreUpdate: false
        };
      }
    } else {
      // First attempt
      finalAttempt = await Attempt.create({
        studentId,
        examId,
        answers,
        score,
        totalMarks: maxPossibleScore,
        totalQuestions: stats?.totalQuestions || publishedExam.questions.length,
        attemptedCount: stats?.attemptedCount || answers.length,
        correctCount: stats?.correctCount || gradedAnswers.filter(a => a.isCorrect).length,
        wrongCount: stats?.wrongCount || (answers.length - gradedAnswers.filter(a => a.isCorrect).length),
        timeTaken,
        avgTimePerQuestion,
        status: "completed",
      });
    }

    return res.status(201).json({
      success: true,
      message: existingAttempt && score <= existingAttempt.score 
        ? "Exam retaken, but your previous high score was better!" 
        : "Exam submitted successfully!",
      data: finalAttempt,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   RETAKE EXAM (STUDENT)
 ========================= */
export const retakeExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user._id;

    // Retake logic: We no longer delete the previous attempt.
    // Instead, submitExam handles updating the highest score.
    return res.status(200).json({
      success: true,
      message: "You can now retake the exam. Your highest score will be preserved.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   GET EXAM SPECIFIC LEADERBOARD
========================= */
export const getExamLeaderboard = async (req, res) => {
  try {
    const { examId } = req.params;

    // 1. Find the relevant PublishedExam ID
    // Teachers might pass the original Exam ID, while students pass the PublishedExam ID.
    // We need to match Attempt.examId which is always the PublishedExam._id.
    const publishedExam = await PublishedExam.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(examId) ? new mongoose.Types.ObjectId(examId) : null },
        { examId: mongoose.Types.ObjectId.isValid(examId) ? new mongoose.Types.ObjectId(examId) : null }
      ]
    });

    if (!publishedExam) {
      return res.status(200).json({ success: true, data: [] });
    }

    const leaderboard = await Attempt.aggregate([
      { $match: { examId: publishedExam._id } },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          studentId: "$studentId",
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$user.firstName", ""] },
                  " ",
                  { $ifNull: ["$user.lastName", ""] }
                ]
              }
            }
          },
          score: { $round: ["$score", 0] },
          timeTaken: 1,
          createdAt: 1
        }
      },
      // Tie-breaker: sort by score desc, then timeTaken asc
      { $sort: { score: -1, timeTaken: 1, createdAt: 1 } },
      { $limit: 100 }
    ]);

    const ranked = leaderboard.map((student, index) => ({
      rank: index + 1,
      ...student,
    }));

    return res.status(200).json({ success: true, data: ranked });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================
   GET STUDENT PROFILE STATS
========================= */
export const getStudentProfile = async (req, res) => {
  try {
    let { studentId } = req.params;

    if (studentId === 'me') {
      studentId = req.user._id.toString();
    }

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid student ID" });
    }

    const studentObjId = new mongoose.Types.ObjectId(studentId);

    // Fetch all attempts for this student, joined with PublishedExam difficulty
    const attempts = await Attempt.aggregate([
      { $match: { studentId: studentObjId } },
      {
        $lookup: {
          from: "publishedexams",
          localField: "examId",
          foreignField: "_id",
          as: "exam"
        }
      },
      { $unwind: "$exam" },
      {
        $project: {
          score: 1,
          totalMarks: 1,
          completedAt: 1,
          exam: {
            title: "$exam.title",
            subject: "$exam.subject"
          },
          difficulty: { $toLower: "$exam.difficulty" },
          percentage: {
            $cond: [
              { $gt: ["$totalMarks", 0] },
              { $multiply: [{ $divide: ["$score", "$totalMarks"] }, 100] },
              0
            ]
          }
        }
      }
    ]);

    const totalExams = attempts.length;
    const avgScore = totalExams > 0
      ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / totalExams)
      : 0;

    const easyExams = attempts.filter(a => a.difficulty === "easy").length;
    const mediumExams = attempts.filter(a => a.difficulty === "medium").length;
    const hardExams = attempts.filter(a => a.difficulty === "hard").length;

    // Fetch Badges
    const badges = await Badge.find({ studentId: studentObjId });
    const badgeCounts = {
      weekly: {
        gold: badges.filter(b => b.category === "weekly" && b.type === "gold").length,
        silver: badges.filter(b => b.category === "weekly" && b.type === "silver").length,
        bronze: badges.filter(b => b.category === "weekly" && b.type === "bronze").length,
      },
      monthly: {
        gold: badges.filter(b => b.category === "monthly" && b.type === "gold").length,
        silver: badges.filter(b => b.category === "monthly" && b.type === "silver").length,
        bronze: badges.filter(b => b.category === "monthly" && b.type === "bronze").length,
      },
      total: badges.length
    };

    // Calculate Real Rank
    const studentPoints = await Attempt.aggregate([
      { $match: { studentId: studentObjId } },
      { $group: { _id: null, total: { $sum: "$score" } } }
    ]);
    const myPoints = studentPoints[0]?.total || 0;

    const rank = await Attempt.aggregate([
      { $group: { _id: "$studentId", total: { $sum: "$score" } } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      { $unwind: "$userDetails" },
      { $match: { "userDetails.role": "student", total: { $gt: myPoints } } },
      { $count: "higherCount" }
    ]);
    const globalRank = (rank[0]?.higherCount || 0) + 1;
    const totalStudentsCount = await User.countDocuments({ role: "student" });

    // Fetch user details
    const student = await User.findById(studentId).select("firstName lastName email");

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        studentId,
        name: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
        email: student.email,
        totalExams,
        avgScore,
        easyExams,
        mediumExams,
        hardExams,
        badgeCounts,
        rank: globalRank,
        totalStudents: totalStudentsCount,
        attempts: attempts.map(a => ({
          _id: a._id,
          title: a.exam?.title || "Unknown Exam",
          subject: a.exam?.subject || "General",
          score: a.score,
          totalMarks: a.totalMarks,
          percentage: Math.round(a.percentage),
          date: a.completedAt
        }))
      }
    });
  } catch (error) {
    console.error("Profile API Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================
   GET LEADERBOARD
========================= */
export const getLeaderboard = async (req, res) => {
  try {
    const { timeframe = "overall" } = req.query; // overall, weekly, monthly
    const now = new Date();
    
    // Calculate start of current hour for precise hourly updates
    const currentHourStart = new Date(now);
    currentHourStart.setMinutes(0, 0, 0);
    const lastUpdated = currentHourStart.getTime();

    // Check Cache - Valid if updated within this same hour
    if (
      leaderboardCache[timeframe] &&
      leaderboardCache[timeframe].data &&
      leaderboardCache[timeframe].lastUpdated === lastUpdated
    ) {
      return res.status(200).json({
        success: true,
        data: leaderboardCache[timeframe].data,
        cached: true,
        nextUpdate: new Date(lastUpdated + CACHE_DURATION)
      });
    }

    const matchStage = {};
    if (timeframe === "weekly") {
      // Weekly: Starts every Monday at 5:30 AM
      const weeklyStart = new Date(now);
      const day = weeklyStart.getDay(); // 0 is Sunday, 1 is Monday
      // Calculate days to subtract to get to the most recent Monday
      const daysSinceMonday = (day + 6) % 7; 
      weeklyStart.setDate(weeklyStart.getDate() - daysSinceMonday);
      weeklyStart.setHours(5, 30, 0, 0);
      
      // If the calculated Monday 5:30 AM is in the future (e.g. today is Monday but before 5:30), go back 7 days
      if (weeklyStart > now) {
        weeklyStart.setDate(weeklyStart.getDate() - 7);
      }
      matchStage.createdAt = { $gte: weeklyStart };
    } else if (timeframe === "monthly") {
      // Monthly: Starts every 1st of the month at 5:30 AM
      const monthlyStart = new Date(now.getFullYear(), now.getMonth(), 1, 5, 30, 0, 0);
      
      // If the 1st at 5:30 AM is in the future (e.g. today is the 1st but before 5:30), go back 1 month
      if (monthlyStart > now) {
        monthlyStart.setMonth(monthlyStart.getMonth() - 1);
      }
      matchStage.createdAt = { $gte: monthlyStart };
    }

    const leaderboard = await Attempt.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$studentId",
          totalPoints: { $sum: "$score" },
          examsTaken: { $sum: 1 },
          totalPercentage: {
            $sum: {
              $cond: [
                { $gt: ["$totalMarks", 0] },
                { $multiply: [{ $divide: ["$score", "$totalMarks"] }, 100] },
                0
              ]
            }
          },
          totalTimeTaken: { $sum: "$timeTaken" },
        },
      },
      {
        $addFields: {
          totalPoints: { $round: ["$totalPoints", 0] },
          avgScore: {
            $round: [{ $divide: ["$totalPercentage", "$examsTaken"] }, 0]
          },
        }
      },
      { $sort: { totalPoints: -1, avgScore: -1, totalTimeTaken: 1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          studentId: "$_id",
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$user.firstName", ""] },
                  " ",
                  { $ifNull: ["$user.lastName", ""] }
                ]
              }
            }
          },
          totalPoints: 1,
          examsTaken: 1,
          avgScore: 1,
        }
      }
    ]);

    const ranked = leaderboard.map((student, index) => ({
      rank: index + 1,
      ...student,
    }));

    // Update Cache
    leaderboardCache[timeframe] = {
      data: ranked,
      lastUpdated: lastUpdated
    };


    return res.status(200).json({
      success: true,
      data: ranked,
      cached: false,
      nextUpdate: new Date(lastUpdated + CACHE_DURATION)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================
   GET EXAM INSIGHTS (TEACHER)
========================= */
export const getExamInsights = async (req, res) => {
  try {
    const { examId } = req.params;

    // 1. Resolve PublishedExam
    const publishedExam = await PublishedExam.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(examId) ? new mongoose.Types.ObjectId(examId) : null },
        { examId: mongoose.Types.ObjectId.isValid(examId) ? new mongoose.Types.ObjectId(examId) : null }
      ]
    }).populate("questions.questionId");

    if (!publishedExam) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }

    // Security check
    if (publishedExam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // 2. Fetch all attempts
    const attempts = await Attempt.find({ examId: publishedExam._id });

    if (attempts.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalAttempts: 0,
          averageScore: 0,
          mostMissedQuestion: null,
          topicPerformance: [],
          aiInsight: "No attempts yet to generate insights."
        }
      });
    }

    // 3. Calculate Stats
    const totalAttempts = attempts.length;
    const totalScore = attempts.reduce((sum, a) => sum + a.score, 0);
    const avgScore = (totalScore / totalAttempts).toFixed(1);

    // Per-question stats
    const questionStats = {}; // questionId -> { text, correct, total, subject }
    
    // Initialize stats from publishedExam questions
    publishedExam.questions.forEach(q => {
      questionStats[q.questionId.toString()] = {
        text: q.text,
        correct: 0,
        total: 0,
        subject: "General" // Fallback
      };
    });

    // We need to fetch original questions to get the subject
    const originalQuestionIds = publishedExam.questions.map(q => q.questionId);
    const originalQuestions = await Question.find({ _id: { $in: originalQuestionIds } });
    originalQuestions.forEach(q => {
      if (questionStats[q._id.toString()]) {
        questionStats[q._id.toString()].subject = q.subject || "General";
      }
    });

    // Aggregate from attempts
    attempts.forEach(attempt => {
      attempt.answers.forEach(ans => {
        const qId = ans.questionId.toString();
        if (questionStats[qId]) {
          questionStats[qId].total++;
          if (ans.isCorrect) {
            questionStats[qId].correct++;
          }
        }
      });
    });

    // Identify Most Missed
    let mostMissed = null;
    let highestMissRate = 0;

    const topicStats = {}; // subject -> { correct, total }

    Object.entries(questionStats).forEach(([id, stats]) => {
      const missRate = stats.total > 0 ? (stats.total - stats.correct) / stats.total : 0;
      if (missRate > highestMissRate) {
        highestMissRate = missRate;
        mostMissed = {
          id,
          text: stats.text,
          missRate: (missRate * 100).toFixed(1),
          subject: stats.subject
        };
      }

      // Topic aggregation
      if (!topicStats[stats.subject]) {
        topicStats[stats.subject] = { correct: 0, total: 0 };
      }
      topicStats[stats.subject].correct += stats.correct;
      topicStats[stats.subject].total += stats.total;
    });

    const topicPerformance = Object.entries(topicStats).map(([name, stats]) => ({
      name,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
    })).sort((a, b) => b.accuracy - a.accuracy);

    // 4. AI Insight Generation
    let aiInsight = "Class is performing steadily. Focus on general revision.";
    try {
      const topTopics = topicPerformance.filter(t => t.accuracy >= 70).map(t => t.name);
      const weakTopics = topicPerformance.filter(t => t.accuracy < 50).map(t => t.name);
      
      const prompt = `
        As an AI Education Assistant, analyze these class results for the exam "${publishedExam.title}":
        - Total Students: ${totalAttempts}
        - Average Class Score: ${avgScore}/${publishedExam.totalMarks}
        - Strong Topics (Accuracy > 70%): ${topTopics.join(", ") || "None yet"}
        - Weak Topics (Accuracy < 50%): ${weakTopics.join(", ") || "None yet"}
        - Most Missed Question: "${mostMissed?.text}" (Subject: ${mostMissed?.subject}, Miss Rate: ${mostMissed?.missRate}%)

        Write a 2-sentence professional insight for the teacher. 
        Sentence 1: Summarize where the class is struggling/excelling.
        Sentence 2: Give a specific actionable suggestion for the next lecture.
      `;

      const response = await llm.invoke([new HumanMessage(prompt)]);
      aiInsight = response.content.trim();
    } catch (aiErr) {
      console.error("AI Insight Generation Failed:", aiErr);
    }

    return res.status(200).json({
      success: true,
      data: {
        totalAttempts,
        averageScore: avgScore,
        totalMarks: publishedExam.totalMarks,
        mostMissedQuestion: mostMissed,
        topicPerformance,
        aiInsight
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================
   GET EXAM STUDENT RESULTS (TEACHER)
========================= */
export const getExamStudentResults = async (req, res) => {
  try {
    const { examId } = req.params;

    const publishedExam = await PublishedExam.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(examId) ? new mongoose.Types.ObjectId(examId) : null },
        { examId: mongoose.Types.ObjectId.isValid(examId) ? new mongoose.Types.ObjectId(examId) : null }
      ]
    });

    if (!publishedExam) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }

    if (publishedExam.createdBy.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const attempts = await Attempt.find({ examId: publishedExam._id })
      .populate("studentId", "firstName lastName email")
      .sort({ createdAt: -1 });

    const formattedResults = attempts.map(attempt => ({
      _id: attempt._id,
      studentId: attempt.studentId?._id,
      studentName: attempt.studentId ? `${attempt.studentId.firstName || ""} ${attempt.studentId.lastName || ""}`.trim() : "Unknown Student",
      studentEmail: attempt.studentId?.email || "No email",
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      percentage: attempt.totalMarks > 0 ? Math.round((attempt.score / attempt.totalMarks) * 100) : 0,
      timeTaken: attempt.timeTaken,
      completedAt: attempt.completedAt,
      status: attempt.status
    }));

    return res.status(200).json({
      success: true,
      data: formattedResults
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
