import express from "express";
import { gcodeRouter } from "./routes/gcode.js";
import { dxfRouter } from "./routes/dxf.js";

const PORT = Number(process.env.PORT ?? 8003);
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Internal API key guard
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (req.headers["x-internal-api-key"] !== INTERNAL_API_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "cnc-service" });
});

app.use("/gcode", gcodeRouter);
app.use("/dxf", dxfRouter);

app.listen(PORT, () => {
  console.log(`cnc-service listening on port ${PORT}`);
});
