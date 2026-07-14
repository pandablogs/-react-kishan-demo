import llm from "../config/llm.js";
import { HumanMessage } from "@langchain/core/messages";

export const generateQuestionsFromText = async ({
    text,
    difficulty,
    subjects,
    count,
    language,
}) => {
    // 🧪 STATIC MOCK DATA (for testing)
    if (process.env.USE_STATIC_AI === "true") {
        console.log("🧪 Using Static Mock Data for AI Generation");

        const mockQuestions = [
            {
                text: "What is the primary purpose of a 'vector database' in AI applications?",
                marks: 1,
                options: [
                    "To store high-dimensional embeddings for similarity search",
                    "To store traditional relational data",
                    "To manage user authentication",
                    "To render 3D graphics"
                ],
                correctAnswer: 0,
                subject: subjects[0] || "AI",
                difficulty: difficulty || "Medium",
                language: language || "English"
            },
            {
                text: "Which of these is a key benefit of using a RAG (Retrieval-Augmented Generation) architecture?",
                marks: 1,
                options: [
                    "It eliminates the need for any LLM",
                    "It allows the model to access private or up-to-date data without retraining",
                    "It makes the system run without internet",
                    "It reduces the token cost to zero"
                ],
                correctAnswer: 1,
                subject: subjects[0] || "AI",
                difficulty: difficulty || "Medium",
                language: language || "English"
            },
            {
                text: "What does 'temperature' control in an LLM generation?",
                marks: 1,
                options: [
                    "The physical heat of the server",
                    "The speed of the response",
                    "The randomness and creativity of the output",
                    "The maximum number of tokens generated"
                ],
                correctAnswer: 2,
                subject: subjects[0] || "AI",
                difficulty: difficulty || "Medium",
                language: language || "English"
            },
            {
                text: "In the context of embeddings, what does 'cosine similarity' measure?",
                marks: 1,
                options: [
                    "The distance between two points in Euclidean space",
                    "The angle between two vectors",
                    "The number of identical words in two sentences",
                    "The time taken to generate a response"
                ],
                correctAnswer: 1,
                subject: subjects[0] || "AI",
                difficulty: difficulty || "Medium",
                language: language || "English"
            }
        ];

        // Return the requested number of questions
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push({
                ...mockQuestions[i % mockQuestions.length],
                source: "static-mock-data"
            });
        }

        return result;
    }

    const prompt = `
You are an exam question generator API.

STRICT RULES (follow exactly):
- Return ONLY raw JSON
- Do NOT include explanations
- Do NOT include markdown
- Do NOT include backticks
- Do NOT include text before or after JSON
- Each question MUST have exactly 4 options.
- Each question MUST have exactly 1 correct answer (index 0-3).
- All questions are 1 mark each.

Syllabus:
${text}

Requirements:
- Subject: ${subjects.join(", ")}
- Difficulty: ${difficulty}
- Language: ${language}
- Number of questions: ${count}
- Focus Topics: ${subjects.join(", ") || "General contents from provided text"}
 

JSON FORMAT (STRICT):
[
  {
    "text": "question text",
    "marks": 1,
    "options": ["option 1", "option 2", "option 3", "option 4"],
    "correctAnswer": 0, // index of the correct option
    "subject": "subject",
    "difficulty": "difficulty",
    "language": "language"
  }
]
`;

    const response = await llm.invoke([
        new HumanMessage(prompt),
    ]);

    const raw = response.content;

    // 🔥 SAFE JSON EXTRACTION (KEY FIX)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
        console.error("RAW AI RESPONSE:", raw);
        throw new Error("AI did not return JSON");
    }

    let questions;
    try {
        questions = JSON.parse(jsonMatch[0]);
    } catch (err) {
        console.error("RAW AI RESPONSE:", raw);
        throw new Error("AI returned invalid JSON");
    }

    return questions.map(q => ({
        ...q,
        source: "deepseek-ai",
    }));
};