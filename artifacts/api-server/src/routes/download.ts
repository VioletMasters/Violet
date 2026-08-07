import { Router } from "express";
import path from "path";
import fs from "fs";

const router = Router();

// Resolve the zip path once at startup.
// In production Docker the WORKDIR is /app and we COPY the zip there.
// In dev the API server process runs from the workspace root.
// Both cases resolve to: <cwd>/violet-enterprise.zip
const ZIP_PATH = path.join(process.cwd(), "violet-enterprise.zip");

router.get("/download", (_req, res) => {
  if (!fs.existsSync(ZIP_PATH)) {
    res.status(503).json({
      error: "Download package is not available yet. Please check back soon.",
    });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="violet-enterprise.zip"'
  );

  const stat = fs.statSync(ZIP_PATH);
  res.setHeader("Content-Length", stat.size);

  const stream = fs.createReadStream(ZIP_PATH);
  stream.on("error", (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to read download package." });
    } else {
      res.destroy(err);
    }
  });
  stream.pipe(res);
});

export default router;
