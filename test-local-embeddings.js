import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

async function test() {
    console.log("🚀 Testing HuggingFaceTransformersEmbeddings...");
    try {
        const embeddings = new HuggingFaceTransformersEmbeddings({
            model: "Xenova/all-MiniLM-L6-v2",
        });

        const text = "Hello world, this is a test of local embeddings.";
        console.log(`📝 Text to embed: "${text}"`);

        const vector = await embeddings.embedQuery(text);

        console.log("✅ Vector generated successfully!");
        console.log(`📊 Vector dimension: ${vector.length}`);
        console.log(`🔢 First 5 values: ${vector.slice(0, 5).join(", ")}`);

        if (vector.length > 0 && vector.some(v => v !== 0)) {
            console.log("✨ SUCCESS: Local embeddings are working and non-zero!");
        } else {
            console.log("❌ FAILURE: Vector is empty or all zeros.");
        }
    } catch (error) {
        console.error("❌ Error during test:", error);
    }
}

test();
