import User from "../models/User.js";
import Exam from "../models/Exam.js";
import Question from "../models/Question.js";
import Attempt from "../models/Attempt.js";
import { calculateLeaderboardAndAwardBadges } from "../utils/cronJobs.js";

export const getStats = async (req, res) => {
  try {
    const totalTeachers = await User.countDocuments({ role: "teacher" });
    const totalStudents = await User.countDocuments({ role: "student" });
    const totalExams = await Exam.countDocuments();
    const totalQuestions = await Question.countDocuments();

    return res.status(200).json({
      success: true,
      data: {
        totalTeachers,
        totalStudents,
        totalExams,
        totalQuestions
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllExams = async (req, res) => {
  try {
    const { teacherId } = req.query;
    const filter = teacherId ? { createdBy: teacherId } : {};

    const exams = await Exam.find(filter)
      .populate("createdBy", "firstName lastName email college city state")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: exams
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: "student" })
      .select("-password -otp -otpExpires")
      .sort({ createdAt: -1 });

    // Aggregate real stats
    const studentStats = await Attempt.aggregate([
      {
        $group: {
          _id: "$studentId",
          totalExams: { $count: {} },
          totalPoints: { $sum: "$score" },
          totalPossibleMarks: { $sum: "$totalMarks" },
          avgPercentage: {
            $avg: {
              $cond: [
                { $gt: ["$totalMarks", 0] },
                { $multiply: [{ $divide: ["$score", "$totalMarks"] }, 100] },
                0
              ]
            }
          }
        }
      }
    ]);

    const statsMap = studentStats.reduce((acc, stat) => {
      acc[stat._id.toString()] = {
        totalExams: stat.totalExams,
        avgScore: Math.round(stat.avgPercentage)
      };
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      data: students.map(s => ({
        ...s.toObject(),
        totalExams: statsMap[s._id.toString()]?.totalExams || 0,
        avgScore: statsMap[s._id.toString()]?.avgScore || 0,
      }))
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: "teacher" })
      .select("-password -otp -otpExpires")
      .sort({ createdAt: -1 });

    // Aggregate exam counts for teachers
    const teacherExamStats = await Exam.aggregate([
      {
        $group: {
          _id: "$createdBy",
          totalExams: { $count: {} }
        }
      }
    ]);

    // Aggregate question counts for teachers
    const teacherQuestionStats = await Question.aggregate([
      {
        $group: {
          _id: "$createdBy",
          totalQuestions: { $count: {} }
        }
      }
    ]);

    const examStatsMap = teacherExamStats.reduce((acc, stat) => {
      acc[stat._id.toString()] = stat.totalExams;
      return acc;
    }, {});

    const questionStatsMap = teacherQuestionStats.reduce((acc, stat) => {
      acc[stat._id.toString()] = stat.totalQuestions;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      data: teachers.map(t => ({
        ...t.toObject(),
        totalExams: examStatsMap[t._id.toString()] || 0,
        totalQuestions: questionStatsMap[t._id.toString()] || 0,
      }))
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    
    if (!user || user.role !== "teacher") {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    await User.findByIdAndDelete(id);
    
    return res.status(200).json({
      success: true,
      message: "Teacher deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    
    if (!user || user.role !== "student") {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    await User.findByIdAndDelete(id);
    
    return res.status(200).json({
      success: true,
      message: "Student deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const triggerBadges = async (req, res) => {
  try {
    const { timeframe } = req.body;
    if (!["weekly", "monthly"].includes(timeframe)) {
      return res.status(400).json({ success: false, message: "Invalid timeframe. Use 'weekly' or 'monthly'." });
    }

    await calculateLeaderboardAndAwardBadges(timeframe);

    return res.status(200).json({
      success: true,
      message: `${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} badges awarded successfully (if not already awarded).`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
