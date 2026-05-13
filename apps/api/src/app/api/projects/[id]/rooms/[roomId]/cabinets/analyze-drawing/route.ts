import { NextRequest } from "next/server";
import { GoogleGenAI, Type, FunctionCallingConfigMode } from "@google/genai";
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

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

function getGenAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

async function analyzeWithGemini(
  fileBytes: Uint8Array,
  mimeType: string
): Promise<DrawingAnalysis> {
  const ai = getGenAI();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: Buffer.from(fileBytes).toString("base64"),
            },
          },
          {
            text: `You are a cabinet manufacturing expert. Analyze this drawing, sketch, photo, or blueprint and extract the cabinet specifications. Call extract_cabinet_specs with your findings.

If dimensions are explicitly labeled in the image, use them directly (high confidence).
If not, estimate from proportions and typical standards:
  - Base cabinets:   600–900 mm W × 720 mm H × 560 mm D
  - Wall cabinets:   300–900 mm W × 600–720 mm H × 300 mm D
  - Tall cabinets:   600 mm W × 1800–2200 mm H × 560 mm D
  - Corner cabinets: 900 mm W × 720 mm H × 900 mm D
  - Island cabinets: 900–1500 mm W × 900 mm H × 700–900 mm D

Set confidence to:
  "high"   — dimensions are explicitly labeled
  "medium" — estimated from visible scale, proportions, or context clues
  "low"    — mostly guessed from cabinet type alone

In the notes field, briefly describe what you saw and any caveats.`,
          },
        ],
      },
    ],
    config: {
      tools: [
        {
          functionDeclarations: [
            {
              name: "extract_cabinet_specs",
              description: "Extract cabinet specifications from a drawing or image",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    enum: ["base", "wall", "tall", "corner", "island"],
                    description: "Cabinet type inferred from the image",
                  },
                  width: {
                    type: Type.NUMBER,
                    description: "Width in millimeters",
                  },
                  height: {
                    type: Type.NUMBER,
                    description: "Height in millimeters",
                  },
                  depth: {
                    type: Type.NUMBER,
                    description: "Depth in millimeters",
                  },
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      doorCount:   { type: Type.NUMBER, description: "Number of doors" },
                      drawerCount: { type: Type.NUMBER, description: "Number of drawers" },
                      shelfCount:  { type: Type.NUMBER, description: "Number of internal shelves" },
                    },
                    required: ["doorCount", "drawerCount", "shelfCount"],
                  },
                  notes: {
                    type: Type.STRING,
                    description: "Brief description of what was extracted and any caveats",
                  },
                  confidence: {
                    type: Type.STRING,
                    enum: ["high", "medium", "low"],
                    description: "Confidence level for the extracted dimensions",
                  },
                },
                required: ["type", "width", "height", "depth", "parameters", "notes", "confidence"],
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ["extract_cabinet_specs"],
        },
      },
    },
  });

  const functionCall = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.functionCall
  )?.functionCall;

  if (!functionCall || functionCall.name !== "extract_cabinet_specs") {
    throw new Error("Gemini did not return a function call");
  }

  return functionCall.args as unknown as DrawingAnalysis;
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
    return apiError("Unsupported file type. Use JPEG, PNG, WebP, or PDF.", 400);
  if (file.size > 10 * 1024 * 1024)
    return apiError("File too large. Maximum size is 10 MB.", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());

  let result: DrawingAnalysis;
  try {
    result = await analyzeWithGemini(bytes, file.type);
  } catch (err) {
    console.error("[analyze-drawing] Gemini error:", err);
    return apiError("AI analysis service is unavailable. Try again later.", 503, "AI_UNAVAILABLE");
  }

  return ok(result);
}
