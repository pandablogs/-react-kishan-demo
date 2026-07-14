import express from "express";
import { 
  getStats, 
  getAllExams, 
  getAllStudents, 
  deleteStudent,
  getAllTeachers,
  deleteTeacher,
  triggerBadges
} from "../controllers/admin.controller.js";
import { protect, admin } from "../middleware/auth.js";

const router = express.Router();

// All admin routes are protected
router.use(protect);
router.use(admin);

router.get("/stats", getStats);
router.get("/exams", getAllExams);
router.get("/students", getAllStudents);
router.delete("/students/:id", deleteStudent);
router.get("/teachers", getAllTeachers);
router.delete("/teachers/:id", deleteTeacher);
router.post("/badges/trigger", triggerBadges);

export default router;
