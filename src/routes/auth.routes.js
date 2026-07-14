import express from "express";
import {
  register,
  login,
  editProfile,
  studentSendOTP,
  studentVerifyOTP,
  teacherSendOTP,
  teacherVerifyOTP,
  completeTeacherProfile
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.put("/edit-profile", protect, editProfile);

// Student registration/login via OTP
router.post("/student/send-otp", studentSendOTP);
router.post("/student/verify-otp", studentVerifyOTP);

// Teacher registration via OTP
router.post("/teacher/send-otp", teacherSendOTP);
router.post("/teacher/verify-otp", teacherVerifyOTP);
router.post("/teacher/complete-profile", protect, completeTeacherProfile);

export default router;
