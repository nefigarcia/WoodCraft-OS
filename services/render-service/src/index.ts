import express from "express";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 8004);
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

const app = express();
app.use(express.json({ limit: "20mb" }));

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (req.headers["x-internal-api-key"] !== INTERNAL_API_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "render-service" });
});

const renderSchema = z.object({
  projectId: z.string(),
  rooms: z.array(z.record(z.unknown())),
  cabinets: z.array(z.record(z.unknown())),
  width: z.number().int().min(400).max(3840).default(1920),
  height: z.number().int().min(300).max(2160).default(1080),
  format: z.enum(["png", "jpeg"]).default("png"),
});

// Heavy render job — queued via BullMQ, result uploaded to S3
app.post("/render", (req, res) => {
  const parsed = renderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.errors[0]?.message });
    return;
  }
  // TODO: enqueue BullMQ job for headless Three.js render
  res.json({
    jobId: crypto.randomUUID(),
    status: "queued",
    message: "Render job queued. Poll /render/:jobId for status.",
  });
});

app.get("/render/:jobId", (req, res) => {
  // TODO: return job status + S3 URL when complete
  res.json({ jobId: req.params["jobId"], status: "pending" });
});

app.listen(PORT, () => {
  console.log(`render-service listening on port ${PORT}`);
});
