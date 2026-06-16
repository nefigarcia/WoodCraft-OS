import { NextRequest } from "next/server";
import OpenAI from "openai";

import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; roomId: string } };

export interface DrawingAnalysis {
  type: "base" | "wall" | "tall" | "corner" | "island";
  width: number;
  height: number;
  depth: number;
  parameters: {
    doorCount: number;
    drawerCount: number;
    shelfCount: number;
  };
  notes: string;
  confidence: "high" | "medium" | "low";
}

// PDFs are not supported by the OpenAI vision API — images only.
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function analyzeWithOpenAI(
  fileBytes: Uint8Array,
  mimeType: string
): Promise<DrawingAnalysis> {
  const client = getOpenAI();
  const base64 = Buffer.from(fileBytes).toString("base64");

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a cabinet manufacturing expert. Analyze drawings and extract cabinet specifications by calling the extract_cabinet_specs function.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: "high",
            },
          },
          {
            type: "text",
            text: `Analyze this drawing, sketch, photo, or blueprint and extract the cabinet specifications. Call extract_cabinet_specs with your findings.

If dimensions are explicitly labeled in the image, use them directly (high confidence).
If not, estimate from proportions and typical standards:
  - Base cabinets:   600–900 mm W × 720 mm H × 560 mm D
  - Wall cabinets:   300–900 mm W × 600–720 mm H × 300 mm D
  - Tall cabinets:   600 mm W × 1800–2200 mm H × 560 mm D
  - Corner cabinets: 900 mm W × 720 mm H × 900 mm D
  - Island cabinets: 900–1500 mm W × 900 mm H × 700–900 mm D

Set confidence to:
  "high"   — dimensions are explicitly labeled
  "medium" — estimated from visible scale or proportions
  "low"    — mostly guessed from cabinet type alone

Describe what you saw and any caveats in the notes field.`,
          },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "extract_cabinet_specs",
          description: "Extract cabinet specifications from a drawing or image",
          parameters: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["base", "wall", "tall", "corner", "island"],
                description: "Cabinet type inferred from the image",
              },
              width:  { type: "number", description: "Width in millimeters" },
              height: { type: "number", description: "Height in millimeters" },
              depth:  { type: "number", description: "Depth in millimeters" },
              parameters: {
                type: "object",
                properties: {
                  doorCount:   { type: "number", description: "Number of doors" },
                  drawerCount: { type: "number", description: "Number of drawers" },
                  shelfCount:  { type: "number", description: "Number of internal shelves" },
                },
                required: ["doorCount", "drawerCount", "shelfCount"],
              },
              notes:      { type: "string", description: "Brief description of what was extracted and any caveats" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["type", "width", "height", "depth", "parameters", "notes", "confidence"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "extract_cabinet_specs" } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "extract_cabinet_specs") {
    throw new Error("OpenAI did not return a function call");
  }

  return JSON.parse(toolCall.function.arguments) as DrawingAnalysis;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const room = await prisma.room.findFirst({
    where: { id: params.roomId, project: { id: params.id, orgId } },
    select: { id: true },
  });
  if (!room) return apiError("Room not found", 404);

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return apiError("No file provided", 400);
  if (!ALLOWED_TYPES.has(file.type))
    return apiError("Unsupported file type. Use JPEG, PNG, WebP, or GIF.", 400);
  if (file.size > 20 * 1024 * 1024)
    return apiError("File too large. Maximum size is 20 MB.", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());

  let result: DrawingAnalysis;
  try {
    result = await analyzeWithOpenAI(bytes, file.type);
  } catch (err) {
    console.error("[analyze-drawing] OpenAI error:", err);
    return apiError("AI analysis service is unavailable. Try again later.", 503, "AI_UNAVAILABLE");
  }

  return ok(result);
}
