import mongoose from "mongoose";

const publishedExamSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam"
    },

    // ✅ ADD THIS
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    title: String,
    description: String,
    instructions: String,
    difficulty: String,
    subjects: [String],
    language: String,
    duration: Number,
    timeLimitType: {
      type: String,
      enum: ["overall", "per-question"],
      default: "overall"
    },
    topics: [String],

    questions: [

      {

        questionId: mongoose.Schema.Types.ObjectId,

        text: String,

        options: [String],

        correctAnswer: Number,

        marks: Number

      }

    ],


    totalMarks: Number,
    pdfPath: String,
    publishedAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("PublishedExam", publishedExamSchema);