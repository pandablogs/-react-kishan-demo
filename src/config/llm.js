import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";

// 🔥 Explicitly load environment variables
dotenv.config();

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY is missing from .env file");
}

const llm = new ChatOpenAI({
  modelName: "llama-3.3-70b-versatile",
  temperature: 0.3,
  apiKey: process.env.GROQ_API_KEY,
  configuration: {
    baseURL: "https://api.groq.com/openai/v1",
  },
});

export default llm;