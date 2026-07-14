import fs from "fs";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export const extractTextFromFile = async (file) => {
  const buffer = fs.readFileSync(file.path);

  // ✅ PDF
  if (file.mimetype === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const data = await parser.getText();
      return data.text || "";
    } finally {
      await parser.destroy();
    }
  }

  // ✅ DOC / DOCX
  if (
    file.mimetype === "application/msword" ||
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  return "";
};
