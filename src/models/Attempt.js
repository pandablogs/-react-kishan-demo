import mongoose from "mongoose";

const attemptSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PublishedExam",
      required: true,
    },
    answers: [
      {
        questionId: mongoose.Schema.Types.ObjectId,
        selectedOption: Number, // Index of the option
        textResponse: String,   // For non-MCQ if needed later
      },
    ],
    score: {
      type: Number,
      default: 0,
    },
    totalMarks: {
      type: Number,
      required: true,
    },
    totalQuestions: Number,
    attemptedCount: Number,
    correctCount: Number,
    wrongCount: Number,
    timeTaken: Number,      // Total seconds taken
    avgTimePerQuestion: Number, // Average seconds per question
    status: {
      type: String,
      enum: ["completed"],
      default: "completed",
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Attempt", attemptSchema);
