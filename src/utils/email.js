import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * Build a transporter that works on restricted hosts (e.g. Render):
 * - Prefer port 587 + STARTTLS over 465 (often blocked / IPv6-only)
 * - Force IPv4 to avoid ENETUNREACH on IPv6
 */
const createTransporter = () => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = port === 465; // true only for implicit TLS

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    family: 4, // Force IPv4 — fixes ENETUNREACH on Render
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: "TLSv1.2",
    },
  });
};

export const sendOTP = async (email, otp, role = "student") => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("SMTP Error Details:", {
      message: "SMTP_USER or SMTP_PASS is not set",
    });
    return false;
  }

  const transporter = createTransporter();
  const roleName = role.charAt(0).toUpperCase() + role.slice(1);
  const mailOptions = {
    from: `"ExamAI" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
    to: email,
    subject: `Your OTP for ${roleName} Registration`,
    text: `Your OTP for ${role} registration is ${otp}. It will expire in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #2563eb; text-align: center;">Welcome to ExamAI</h2>
        <p>Hello,</p>
        <p>Thank you for choosing ExamAI. Please use the following One-Time Password (OTP) to complete your <strong>${role} registration</strong>:</p>
        <div style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #1e40af; border-radius: 5px; margin: 20px 0;">
          ${otp}
        </div>
        <p>This OTP is valid for 10 minutes. Please do not share this code with anyone.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="font-size: 12px; color: #6b7280; text-align: center;">&copy; 2026 ExamAI. All rights reserved.</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("SMTP Error Details:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack,
    });
    return false;
  }
};
