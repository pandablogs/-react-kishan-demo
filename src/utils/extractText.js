import fs from "fs";
import mammoth from "mammoth";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let pdfParse = require("pdf-parse");
if (typeof pdfParse !== "function" && pdfParse.default) {
  pdfParse = pdfParse.default;
}


export const extractTextFromFile = async (file) => {
  const buffer = fs.readFileSync(file.path);

  // ✅ PDF
  if (file.mimetype === "application/pdf") {
    const data = await pdfParse(buffer);
    return data.text || "";
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