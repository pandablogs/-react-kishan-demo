import mongoose from "mongoose";

const directoryFileSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        originalName: {
            type: String,
            required: true,
        },
        folderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Folder",
            required: true,
        },
        fileType: {
            type: String,
            enum: ["pdf", "doc", "docx", "image"],
            required: true,
        },
        mimeType: {
            type: String,
            required: true,
        },
        filePath: {
            type: String,
            required: true,
        },
        size: {
            type: Number,
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

directoryFileSchema.index({ folderId: 1, createdBy: 1 });

export default mongoose.model("DirectoryFile", directoryFileSchema);
