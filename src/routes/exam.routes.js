import express from "express";
import {
  createExam,
  addManualQuestion,
  getQuestions,
  approveQuestion,
  updateQuestion,
  deleteQuestion,
  bulkApproveQuestions,
  publishExam,
  regenerateAIQuestions,
  getExamStatus,
  importStaticExam,
  getAllExams,
  getPublishedExams,
  getPublishedExamById,
  deleteExam,
  getExamById,
  updateExam,
  generateAIQuestions,
  studentGetAllExams,
  submitExam,
  retakeExam,
  getLeaderboard,
  getExamLeaderboard,
  getStudentProfile,
  getExamInsights,
  getExamStudentResults
} from "../controllers/exam.controller.js";

import { upload } from "../middleware/upload.js";
import { protect } from "../middleware/auth.js";


const router = express.Router();

// GET PUBLISHED EXAMS
router.get("/published", protect, getPublishedExams);

// GET PUBLISHED EXAM BY ID
router.get("/published/:id", protect, getPublishedExamById);

// STUDENT: GET ALL PUBLISHED EXAMS
router.get("/student/all", protect, studentGetAllExams);

// STUDENT: SUBMIT EXAM
router.post("/student/submit", protect, submitExam);

// STUDENT: RETAKE EXAM
router.delete("/student/retake/:examId", protect, retakeExam);

// GLOBAL LEADERBOARD
router.get("/leaderboard", protect, getLeaderboard);

// STUDENT PROFILE STATS
router.get("/student/profile/:studentId", protect, getStudentProfile);

// EXAM SPECIFIC LEADERBOARD
router.get("/:examId/leaderboard", protect, getExamLeaderboard);


// GET ALL EXAMS (Teacher only)
router.get("/", protect, getAllExams);

// GET EXAM BY ID (Teacher only)
router.get("/:id", protect, getExamById);


// CREATE EXAM (Teacher only)
router.post(
  "/create",
  protect,
  upload.array("files", 5),
  createExam
);

// UPDATE EXAM
router.put(
  "/:examId",
  protect,
  upload.array("files", 5),
  updateExam
);

// IMPORT STATIC EXAM (New)
router.post(
  "/import-static",
  protect,
  importStaticExam
);

// ADD MANUAL QUESTION (Teacher only)
router.post(
  "/:examId/questions/manual",
  protect,
  addManualQuestion
);

// GET QUESTIONS (Teacher only)
router.get(
  "/:examId/questions",
  protect,
  getQuestions
);

// APPROVE QUESTION (Teacher only)
router.patch(
  "/questions/:id/approve",
  protect,
  approveQuestion
);

// EDIT QUESTION (Teacher only)
router.put(
  "/questions/:id",
  protect,
  updateQuestion
);

// DELETE QUESTION (Teacher only)
router.delete(
  "/questions/:id",
  protect,
  deleteQuestion
);

// BULK APPROVE ALL QUESTIONS (Teacher only)
router.patch(
  "/:examId/approve-all",
  protect,
  bulkApproveQuestions
);

// PUBLISH EXAM (Teacher only)
router.post(
  "/:examId/publish",
  protect,
  publishExam
);

// GENERATE AI QUESTIONS
router.post(
  "/:examId/generate-ai",
  protect,
  generateAIQuestions
);

// REGENERATE AI QUESTIONS
router.post(
  "/:examId/regenerate",
  protect,
  regenerateAIQuestions
);

// GET EXAM STATUS
router.get(
  "/:examId/status",
  protect,
  getExamStatus
);

// GET EXAM INSIGHTS (NEW)
router.get(
  "/:examId/insights",
  protect,
  getExamInsights
);

// GET EXAM STUDENT RESULTS (NEW)
router.get(
  "/:examId/student-results",
  protect,
  getExamStudentResults
);

// DELETE EXAM (Teacher only)
router.delete(
  "/:examId",
  protect,
  deleteExam
);

export default router;