import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    instructions: String,
    subject: String,
    difficulty: String,
    subjects: [String],
    language: String,
    numberOfQuestions: Number,
    duration: Number, // in minutes
    topics: [String],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    files: [
      {
        originalName: String,
        extractedText: String
      }
    ],

    status: {
      type: String,
      enum: ["CREATED", "PROCESSING", "REVIEW", "PUBLISHED", "Draft", "DRAFT"],
      default: "CREATED"
    },
    timeLimitType: {
      type: String,
      enum: ["overall", "per-question"],
      default: "overall"
    },
    processingMessage: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

export default mongoose.model("Exam", examSchema);