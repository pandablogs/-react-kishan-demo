import { OpenAIEmbeddings } from "@langchain/openai";
import dotenv from "dotenv";

dotenv.config();

async function test() {
    console.log("🚀 Testing OpenAI Embeddings...");

    if (!process.env.OPENAI_API_KEY) {
        console.error("❌ OPENAI_API_KEY is missing from .env file.");
        process.exit(1);
    }

    try {
        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: "text-embedding-3-small",
        });

        const text = "Hello world, this is a test of OpenAI embeddings.";
        console.log(`📝 Text to embed: "${text}"`);

        const vector = await embeddings.embedQuery(text);

        console.log("✅ Vector generated successfully!");
        console.log(`📊 Vector dimension: ${vector.length}`);
        console.log(`🔢 First 5 values: ${vector.slice(0, 5).join(", ")}`);

        if (vector.length > 0 && vector.some(v => v !== 0)) {
            console.log("✨ SUCCESS: OpenAI embeddings are working and non-zero!");
        } else {
            console.log("❌ FAILURE: Vector is empty or all zeros.");
        }
    } catch (error) {
        console.error("❌ Error during test:", error.message);
    }
}

test();
