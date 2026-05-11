import { Router, Request, Response } from "express";
import { generateHolzherGcode } from "../lib/postprocessors/holzher.js";
import { z } from "zod";

export const gcodeRouter = Router();

const partSchema = z.object({
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive(),
  quantity: z.number().int().positive().default(1),
  cutParams: z.record(z.unknown()).optional(),
});

const requestSchema = z.object({
  jobId: z.string(),
  machineProfile: z.object({
    postProcessor: z.string(),
    config: z.record(z.unknown()),
  }),
  parts: z.array(partSchema),
});

gcodeRouter.post("/generate", async (req: Request, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.errors[0]?.message });
    return;
  }

  const { jobId, machineProfile, parts } = parsed.data;

  try {
    const gcode = generateHolzherGcode({ jobId, config: machineProfile.config, parts });
    res.json({ jobId, gcode, lineCount: gcode.split("\n").length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
