import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { requireOwner } from "./lib/auth.js";
import { generateArticle } from "./lib/articles.js";
import { generateImage } from "./lib/images.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const allowedOrigins = [
  "https://propertiesbychel.vercel.app",
  /^https:\/\/propertiesbychel-[a-z0-9]+-zerotherm27-8336s-projects\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/
];
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const ok = allowedOrigins.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin));
    cb(ok ? null : new Error("Not allowed by CORS"), ok);
  }
}));

// Lazy client: a missing key must not crash the whole process (health checks,
// CORS, etc. should still work) — only the endpoints that need OpenAI should fail.
let openai = null;
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

app.get("/health", (req, res) => res.json({ ok: true, openaiConfigured: !!process.env.OPENAI_API_KEY }));

app.post("/generate-article", requireOwner, async (req, res) => {
  const client = getOpenAI();
  if (!client) return res.status(503).json({ error: "OPENAI_API_KEY is not set on this server yet" });
  const { topic, section } = req.body || {};
  if (!topic || !["journal", "intelligence"].includes(section)) {
    return res.status(400).json({ error: "topic and a valid section are required" });
  }
  try {
    const article = await generateArticle(client, { topic, section });
    res.json(article);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message || "Generation failed" });
  }
});

app.post("/generate-image", requireOwner, async (req, res) => {
  const client = getOpenAI();
  if (!client) return res.status(503).json({ error: "OPENAI_API_KEY is not set on this server yet" });
  const { title, dek, section } = req.body || {};
  if (!title || !["journal", "intelligence"].includes(section)) {
    return res.status(400).json({ error: "title and a valid section are required" });
  }
  try {
    const image = await generateImage(client, { title, dek, section });
    res.json(image);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message || "Image generation failed" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Content agent listening on ${port}`));
