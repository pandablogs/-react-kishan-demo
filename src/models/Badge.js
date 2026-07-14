import mongoose from "mongoose";

const badgeSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ["gold", "silver", "bronze"],
      required: true
    },
    category: {
      type: String,
      enum: ["weekly", "monthly"],
      required: true
    },
    periodKey: {
      type: String, // e.g., "weekly-2026-W18" or "monthly-2026-04"
      required: true,
      index: true
    },
    earnedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Prevent duplicate badges for the same person in the same period
badgeSchema.index({ studentId: 1, periodKey: 1 }, { unique: true });

export default mongoose.model("Badge", badgeSchema);
