import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    email: {
      type: String,
      unique: true,
      required: true
    },
    password: {
      type: String,
      required: function() { return this.isVerified; } // Password required only after verification
    },
    role: {
      type: String,
      enum: ["teacher", "student", "admin"],
      default: "teacher"
    },
    otp: String,
    otpExpires: Date,
    isVerified: {
      type: Boolean,
      default: false
    },
    loginAttempts: {
      type: Number,
      required: true,
      default: 0
    },
    lockUntil: {
      type: Date
    },
    // Teacher specific profile fields
    state: String,
    city: String,
    university: String,
    college: String,
    subject: String,
    profession: String,
    additionalInfo: String,
    isProfileComplete: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);