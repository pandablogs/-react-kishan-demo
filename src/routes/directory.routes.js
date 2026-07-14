import express from "express";
import {
    getRootFolders,
    getFolderContents,
    getBreadcrumb,
    createFolder,
    uploadFile,
    deleteFolder,
    deleteFile,
    getAllFolders,
    getFileContent,
} from "../controllers/directory.controller.js";
import { directoryUpload } from "../middleware/directoryUpload.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// GET root folders
router.get("/folders", protect, getRootFolders);

// GET folder contents (sub-folders + files)
router.get("/folders/:folderId", protect, getFolderContents);

// GET breadcrumb for a folder
router.get("/folders/:folderId/breadcrumb", protect, getBreadcrumb);

// CREATE folder
router.post("/folders", protect, createFolder);

// UPLOAD file to a folder
router.post(
    "/folders/:folderId/upload",
    protect,
    directoryUpload.single("file"),
    uploadFile
);

// DELETE folder (soft delete)
router.delete("/folders/:folderId", protect, deleteFolder);

// DELETE file (soft delete)
router.delete("/files/:fileId", protect, deleteFile);

// GET all folders (for sidebar tree)
router.get("/all-folders", protect, getAllFolders);

// GET file content (secure serving)
router.get("/files/:fileId/content", protect, getFileContent);

export default router;
