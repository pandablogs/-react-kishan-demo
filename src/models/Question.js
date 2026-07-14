import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam"
    },
    text: String,
    marks: {
      type: Number,
      default: 1
    },
    options: [String],
    correctAnswer: Number, // index 0-3
    subject: String,
    difficulty: String,
    source: {
      type: String,
      enum: ["AI", "MANUAL"]
    },

    isApproved: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Question", questionSchema);