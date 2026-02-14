import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4004);
const STORAGE_PATH = process.env.STORAGE_PATH ?? path.join(process.cwd(), "data");
const TEMP_PATH = path.join(STORAGE_PATH, "tmp");

fs.mkdirSync(STORAGE_PATH, { recursive: true });
fs.mkdirSync(TEMP_PATH, { recursive: true });

const upload = multer({ dest: TEMP_PATH });

app.get("/health", (_req, res) => {
  res.json({
    service: "storage-service",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/files", (_req, res) => {
  try {
    const files = fs
      .readdirSync(STORAGE_PATH)
      .filter((entry) => entry !== "tmp")
      .map((filename) => {
        const filePath = path.join(STORAGE_PATH, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        };
      });

    res.json({ files });
  } catch (error) {
    console.error("[storage-service] list files error", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

app.post("/files/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const sanitizedOriginalName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${Date.now()}-${sanitizedOriginalName}`;
    const finalPath = path.join(STORAGE_PATH, filename);
    fs.renameSync(req.file.path, finalPath);

    res.status(201).json({
      file: {
        filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("[storage-service] upload error", error);
    res.status(500).json({ error: "Failed to store file" });
  }
});

app.get("/files/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(STORAGE_PATH, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.download(filePath);
});

app.delete("/files/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(STORAGE_PATH, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  fs.unlinkSync(filePath);
  res.json({ deleted: true, filename });
});

app.listen(PORT, () => {
  console.log(`[storage-service] listening on port ${PORT}`);
});
