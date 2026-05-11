import { Router, Request, Response } from "express";
import { z } from "zod";

export const dxfRouter = Router();

const partSchema = z.object({
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const requestSchema = z.object({
  jobId: z.string(),
  parts: z.array(partSchema),
});

dxfRouter.post("/generate", async (req: Request, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.errors[0]?.message });
    return;
  }

  const { jobId, parts } = parsed.data;

  // Build a minimal DXF with one rectangle per part on separate layers
  const entities: string[] = [];
  let yOffset = 0;

  for (const part of parts) {
    const layer = part.name.toUpperCase().replace(/\s+/g, "_");
    const x0 = 0, y0 = yOffset;
    const x1 = part.width, y1 = yOffset + part.height;

    entities.push(
      `0\nLWPOLYLINE\n8\n${layer}\n90\n4\n70\n1\n`,
      `10\n${x0}\n20\n${y0}\n`,
      `10\n${x1}\n20\n${y0}\n`,
      `10\n${x1}\n20\n${y1}\n`,
      `10\n${x0}\n20\n${y1}\n`,
    );

    yOffset += part.height + 50; // 50mm gap between parts
  }

  const dxf = [
    "0\nSECTION\n2\nHEADER\n0\nENDSEC\n",
    "0\nSECTION\n2\nENTITIES\n",
    ...entities,
    "0\nENDSEC\n0\nEOF",
  ].join("");

  res.json({ jobId, dxf, partCount: parts.length });
});
