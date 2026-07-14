import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/token.js";
import { sendOTP } from "../utils/email.js";
import crypto from "crypto";

/* =========================
   REGISTER
========================= */
export const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // 1️⃣ Validate input
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email and password are required",
      });
    }

    // 2️⃣ Check if email is already taken
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Teacher with this email already exists",
      });
    }

    // 3️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4️⃣ Create teacher user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    // 5️⃣ Response
    return res.status(201).json({
      success: true,
      message: "Teacher registered successfully",
      token: generateToken(user),
      firstName: user.firstName,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   LOGIN (SINGLE USER)
========================= */
export const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // 1️⃣ Validate input
    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Email, password, and role are required",
      });
    }

    // 2️⃣ Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found with this email",
      });
    }

    // 2.5️⃣ Enforce role
    if (user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `This account is registered as a ${user.role}, please use the correct login page.`,
      });
    }

    // 3️⃣ Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / (60 * 1000));
      return res.status(403).json({
        success: false,
        message: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingTime} minutes.`,
      });
    }

    // 3.5 Check if user is verified
    if (!user.isVerified || !user.password) {
      return res.status(401).json({
        success: false,
        message: "Please complete the OTP verification process first to set up your password.",
      });
    }

    // 4️⃣ Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment login attempts if incorrect password
      user.loginAttempts += 1;

      let message = "Incorrect password.";

      // Lock account if MAX_ATTEMPTS reached
      if (user.loginAttempts >= 3) {
        user.lockUntil = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
        message = "Account locked for 30 minutes due to 3 failed login attempts.";
      } else {
        const remainingAttempts = 3 - user.loginAttempts;
        message = `Incorrect password. You have ${remainingAttempts} attempts remaining before your account is locked.`;
      }

      await user.save();

      return res.status(401).json({
        success: false,
        message: message,
      });
    }

    // 5️⃣ Password matches - Reset attempts and lock status
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // 6️⃣ Success
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: generateToken(user),
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isProfileComplete: user.isProfileComplete,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   EDIT PROFILE
========================= */
export const editProfile = async (req, res) => {
  try {
    const { firstName, lastName, currentPassword, newPassword, confirmPassword } = req.body;

    // req.user is set by the `protect` middleware (without password field)
    // Re-fetch with password so we can verify current password
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ── 1. Update name fields if provided ──────────────────────────────────
    if (firstName !== undefined) {
      if (!firstName.trim()) {
        return res.status(400).json({ success: false, message: "First name cannot be empty" });
      }
      user.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      if (!lastName.trim()) {
        return res.status(400).json({ success: false, message: "Last name cannot be empty" });
      }
      user.lastName = lastName.trim();
    }

    // ── 2. Change password (only if any password field is provided) ─────────
    const wantsPasswordChange = currentPassword || newPassword || confirmPassword;

    if (wantsPasswordChange) {
      // All three fields are required for a password change
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password, new password, and confirm password are all required to change your password",
        });
      }

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // New password and confirm password must match
      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "New password and confirm password do not match",
        });
      }

      // New password must not be the same as current
      if (newPassword === currentPassword) {
        return res.status(400).json({
          success: false,
          message: "New password must be different from the current password",
        });
      }

      // Minimum length check
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters long",
        });
      }

      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   STUDENT SEND OTP
========================= */
export const studentSendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.role === 'teacher') {
        return res.status(400).json({ success: false, message: "This email is registered as a teacher account" });
      }
      if (existingUser.isVerified) {
        return res.status(400).json({ success: false, message: "This email is already registered. Please login." });
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existingUser) {
      existingUser.otp = otp;
      existingUser.otpExpires = otpExpires;
      await existingUser.save();
    } else {
      await User.create({
        email,
        role: 'student',
        otp,
        otpExpires,
        isVerified: false
      });
    }

    const emailSent = await sendOTP(email, otp, 'student');
    if (!emailSent) {
      return res.status(500).json({ success: false, message: "Failed to send OTP email. Please check your SMTP settings." });
    }

    return res.status(200).json({ success: true, message: "OTP sent to your email" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================
   STUDENT VERIFY OTP & REGISTER
========================= */
export const studentVerifyOTP = async (req, res) => {
  try {
    const { email, otp, firstName, lastName, password } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email, role: 'student' });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // OTP is valid
    user.otp = undefined;
    user.otpExpires = undefined;
    user.isVerified = true;
    user.isProfileComplete = true; // Students don't need additional profile steps
    
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Student registered and verified successfully",
      token: generateToken(user),
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================
   TEACHER SEND OTP
========================= */
export const teacherSendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.role === 'student') {
        return res.status(400).json({ success: false, message: "This email is registered as a student account" });
      }
      if (existingUser.isVerified) {
        return res.status(400).json({ success: false, message: "This email is already registered. Please login." });
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existingUser) {
      existingUser.otp = otp;
      existingUser.otpExpires = otpExpires;
      await existingUser.save();
    } else {
      await User.create({
        email,
        role: 'teacher',
        otp,
        otpExpires,
        isVerified: false
      });
    }

    const emailSent = await sendOTP(email, otp, 'teacher');
    if (!emailSent) {
      return res.status(500).json({ success: false, message: "Failed to send OTP email. Please check your SMTP settings." });
    }

    return res.status(200).json({ success: true, message: "OTP sent to your email" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================
   TEACHER VERIFY OTP & REGISTER
========================= */
export const teacherVerifyOTP = async (req, res) => {
  try {
    const { email, otp, firstName, lastName, password } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email, role: 'teacher' });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // OTP is valid
    user.otp = undefined;
    user.otpExpires = undefined;
    user.isVerified = true;
    
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Teacher registered and verified successfully",
      token: generateToken(user),
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================
   COMPLETE TEACHER PROFILE
========================= */
export const completeTeacherProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { state, city, university, college, subject, profession, additionalInfo } = req.body;

    if (!state || !city || !college || !subject || !profession) {
      return res.status(400).json({ success: false, message: "State, city, college, subject, and profession are required" });
    }

    const user = await User.findById(userId);

    if (!user || user.role !== 'teacher') {
      return res.status(404).json({ success: false, message: "Teacher account not found" });
    }

    user.state = state;
    user.city = city;
    user.university = university || "";
    user.college = college;
    user.subject = subject;
    user.profession = profession;
    user.additionalInfo = additionalInfo;
    user.isProfileComplete = true;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Teacher profile completed successfully",
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isProfileComplete: user.isProfileComplete
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};