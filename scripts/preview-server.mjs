#!/usr/bin/env node
/**
 * preview-server.mjs
 * ------------------
 * Tiny static-file server bound to 0.0.0.0 so the user can view the generated
 * SVG/Drawio file inside a live preview. Defaults to the ./output directory.
 */
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || "output");
const PORT = parseInt(process.env.PORT || "4173", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".drawio": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const filePath = path.join(ROOT, rel);
    if (!filePath.startsWith(ROOT)) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(data);
  } catch (err) {
    res.statusCode = 404;
    res.end("not found");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`preview server: http://0.0.0.0:${PORT}/  (serving ${ROOT})`);
});
