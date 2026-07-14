import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MongoClient } from "mongodb";
import mongoose from "mongoose";

let vectorStore;

/**
 * Initializes the vector store.
 * Requires process.env.MONGO_URI, process.env.DB_NAME, and process.env.OPENAI_API_KEY (or compatible).
 */
export const getVectorStore = async () => {
    if (vectorStore) return vectorStore;

    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const collection = client.db(process.env.DB_NAME || "test").collection("vectors");

    // 🧪 STATIC MOCK EMBEDDINGS (for testing)
    if (process.env.USE_STATIC_AI === "true") {
        console.log("🧪 Using Static Mock Embeddings");
        const mockEmbeddings = {
            embedQuery: async () => new Array(1536).fill(0),
            embedDocuments: async (docs) => docs.map(() => new Array(1536).fill(0)),
        };

        vectorStore = new MongoDBAtlasVectorSearch(mockEmbeddings, {
            collection,
            indexName: "vector_index",
            textKey: "text",
            embeddingKey: "embedding",
        });

        return vectorStore;
    }

    // OpenAI Embeddings — requires OPENAI_API_KEY in .env
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("❌ OPENAI_API_KEY is missing from .env file. It is required for embeddings.");
    }

    console.log("✅ Using OpenAI Embeddings (text-embedding-3-small)");
    const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "text-embedding-3-small",
    });

    vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
        collection,
        indexName: "vector_index",
        textKey: "text",
        embeddingKey: "embedding",
    });

    return vectorStore;
};

/**
 * Stores text in the vector database after chunking.
 */
export const storeTextToVector = async (text, metadata = {}) => {
    const store = await getVectorStore();

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    const docs = await splitter.createDocuments([text], [metadata]);

    await store.addDocuments(docs);
    return docs.length;
};

/**
 * Searches for relevant chunks.
 */
export const searchVectorStore = async (query, k = 5, filter = {}) => {
    const store = await getVectorStore();
    const results = await store.similaritySearch(query, k, filter);
    return results;
};
