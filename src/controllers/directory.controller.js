import Folder from "../models/Folder.js";
import DirectoryFile from "../models/DirectoryFile.js";
import path from "path";
import fs from "fs";

// Helper: determine file type category from mimetype
function getFileTypeCategory(mimetype) {
    if (mimetype === "application/pdf") return "pdf";
    if (
        mimetype === "application/msword" ||
        mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
        return "doc";
    if (mimetype.startsWith("image/")) return "image";
    return "unknown";
}

// GET ROOT FOLDERS (parentId = null)
export const getRootFolders = async (req, res) => {
    try {
        const folders = await Folder.find({
            parentId: null,
            createdBy: req.user._id,
            isActive: true,
        }).sort({ createdAt: -1 });

        res.json({ success: true, data: { folders, files: [] } });
    } catch (error) {
        console.error("getRootFolders error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET ALL FOLDERS (for sidebar tree)
export const getAllFolders = async (req, res) => {
    try {
        const folders = await Folder.find({
            createdBy: req.user._id,
            isActive: true,
        }).sort({ name: 1 });

        res.json({ success: true, data: folders });
    } catch (error) {
        console.error("getAllFolders error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET FOLDER CONTENTS (sub-folders + files)
export const getFolderContents = async (req, res) => {
    try {
        const { folderId } = req.params;

        // Verify folder exists and belongs to user
        if (folderId) {
            const folder = await Folder.findOne({ _id: folderId, createdBy: req.user._id, isActive: true });
            if (!folder) {
                return res.status(404).json({ success: false, message: "Folder not found" });
            }
        }

        const folders = await Folder.find({
            parentId: folderId,
            createdBy: req.user._id,
            isActive: true,
        }).sort({ createdAt: -1 });

        const files = await DirectoryFile.find({
            folderId,
            createdBy: req.user._id,
            isActive: true,
        }).sort({ createdAt: -1 });

        res.json({ success: true, data: { folders, files } });
    } catch (error) {
        console.error("getFolderContents error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET BREADCRUMB PATH (from root to current folder)
export const getBreadcrumb = async (req, res) => {
    try {
        const { folderId } = req.params;
        const breadcrumb = [];
        let currentId = folderId;

        while (currentId) {
            const folder = await Folder.findOne({ _id: currentId, createdBy: req.user._id, isActive: true });
            if (!folder) break;
            breadcrumb.unshift({ _id: folder._id, name: folder.name });
            currentId = folder.parentId;
        }

        res.json({ success: true, data: breadcrumb });
    } catch (error) {
        console.error("getBreadcrumb error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// CREATE FOLDER
export const createFolder = async (req, res) => {
    try {
        const { name, parentId, description } = req.body;

        if (!name || !name.trim()) {
            return res
                .status(400)
                .json({ success: false, message: "Folder name is required" });
        }

        const folder = await Folder.create({
            name: name.trim(),
            parentId: parentId || null,
            description: description || "",
            createdBy: req.user._id,
        });

        res.status(201).json({ success: true, data: folder });
    } catch (error) {
        console.error("createFolder error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// UPLOAD FILE TO A FOLDER
export const uploadFile = async (req, res) => {
    try {
        const { folderId } = req.params;

        // Verify folder exists and belongs to user
        const folder = await Folder.findOne({ _id: folderId, createdBy: req.user._id, isActive: true });
        if (!folder) {
            return res
                .status(404)
                .json({ success: false, message: "Folder not found" });
        }

        if (!req.file) {
            return res
                .status(400)
                .json({ success: false, message: "No file uploaded" });
        }

        const fileType = getFileTypeCategory(req.file.mimetype);
        if (fileType === "unknown") {
            // Delete uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                message:
                    "Only PDF, DOC, DOCX, and image files (PNG, JPG, JPEG, GIF, WEBP) are allowed!",
            });
        }

        const directoryFile = await DirectoryFile.create({
            name: req.file.filename,
            originalName: req.file.originalname,
            folderId,
            fileType,
            mimeType: req.file.mimetype,
            filePath: req.file.path,
            size: req.file.size,
            createdBy: req.user._id,
        });

        res.status(201).json({ success: true, data: directoryFile });
    } catch (error) {
        console.error("uploadFile error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE FOLDER (soft delete)
export const deleteFolder = async (req, res) => {
    try {
        const { folderId } = req.params;

        const folder = await Folder.findOneAndUpdate(
            { _id: folderId, createdBy: req.user._id },
            { isActive: false },
            { new: true }
        );

        if (!folder) {
            return res
                .status(404)
                .json({ success: false, message: "Folder not found" });
        }

        // Also soft-delete all files in this folder
        await DirectoryFile.updateMany(
            { folderId, createdBy: req.user._id },
            { isActive: false }
        );

        // Also soft-delete child folders recursively
        const childFolders = await Folder.find({
            parentId: folderId,
            createdBy: req.user._id,
        });
        for (const child of childFolders) {
            await Folder.findByIdAndUpdate(child._id, { isActive: false });
            await DirectoryFile.updateMany(
                { folderId: child._id },
                { isActive: false }
            );
        }

        res.json({ success: true, message: "Folder deleted successfully" });
    } catch (error) {
        console.error("deleteFolder error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE FILE (soft delete)
export const deleteFile = async (req, res) => {
    try {
        const { fileId } = req.params;

        const file = await DirectoryFile.findOneAndUpdate(
            { _id: fileId, createdBy: req.user._id },
            { isActive: false },
            { new: true }
        );

        if (!file) {
            return res
                .status(404)
                .json({ success: false, message: "File not found" });
        }

        res.json({ success: true, message: "File deleted successfully" });
    } catch (error) {
        console.error("deleteFile error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET FILE CONTENT (Secure serving)
export const getFileContent = async (req, res) => {
    try {
        const { fileId } = req.params;
        const file = await DirectoryFile.findOne({
            _id: fileId,
            createdBy: req.user._id,
            isActive: true,
        });

        if (!file) {
            return res.status(404).json({ success: false, message: "File not found" });
        }

        const absolutePath = path.resolve(file.filePath);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: "Physical file not found" });
        }

        res.sendFile(absolutePath);
    } catch (error) {
        console.error("getFileContent error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
