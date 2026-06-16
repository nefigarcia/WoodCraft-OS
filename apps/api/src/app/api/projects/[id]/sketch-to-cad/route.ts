import { NextRequest } from "next/server";
import OpenAI from "openai";

import { getContext } from "@/lib/context";
import { apiError, ok } from "@/lib/errors";

type CabinetType =
  | "base"
  | "wall"
  | "tall"
  | "corner"
  | "drawer_base"
  | "sink_base"
  | "island";

export type WallSide = "back" | "left" | "right" | "island" | "none";

export interface SketchCabinet {
  name: string;
  type: CabinetType;
  width: number;
  height: number;
  depth: number;
  posX: number;
  posZ: number;
  wallSide: WallSide;
  parameters: {
    doorCount?: number;
    drawerCount?: number;
    shelfCount?: number;
    toeKickHeight?: number;
    constructionMethod?: string;
    hingeType?: string;
  };
  notes: string;
}

export interface SketchToCadResult {
  cabinets: SketchCabinet[];
  roomDimensions: { width: number; depth: number } | null;
  confidence: "high" | "medium" | "low";
  sketchNotes: string[];
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

async function analyzeSketch(
  fileBytes: Uint8Array,
  mimeType: string
): Promise<SketchToCadResult> {
  const client = getOpenAI();
  const base64 = Buffer.from(fileBytes).toString("base64");

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an expert kitchen cabinet designer and CAD technician. Extract complete cabinet layouts from kitchen sketches and floor plans by calling extract_full_kitchen.",
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
            text: `Analyze this kitchen sketch or floor plan and extract ALL cabinets and appliances with their exact floor-plan positions.

COORDINATE SYSTEM (looking straight down at the floor plan):
  Origin (0,0) = back-left corner of the kitchen (where back wall meets left wall)
  X+ = rightward along the back wall
  Z+ = forward into the room (away from the back wall)

POSITION RULES:
  posX = distance in mm from the origin to the LEFT edge of the cabinet footprint
  posZ = distance in mm from the back wall to the BACK edge of the cabinet footprint
  - Back wall cabinets → posZ = 0
  - Left wall cabinets → posX = 0
  - Right wall cabinets → posX = (room width) - (cabinet depth)
  - Island → calculate posX and posZ from labeled clearances
  - wallSide: "back" | "left" | "right" | "island" | "none"

DIMENSION RULES (1" = 25.4mm, 1' = 304.8mm):
  - Sink base (sink_base):  914mm W (36") × 876mm H × 610mm D
  - Dishwasher (base):      610mm W (24") × 876mm H × 610mm D
  - Range/Oven (base):      762mm W (30") × 876mm H × 610mm D
  - Refrigerator (tall):    914mm W (36") × 1981mm H × 686mm D (27")
  - Upper/Wall cabs (wall): match base width × 762mm H × 305mm D
  - Standard base cabs:     varies × 876mm H × 610mm D
  - Island (island):        use labeled dimensions

IMPORTANT: For LEFT WALL cabinets, 'width' runs ALONG the wall (Z direction) and 'depth' goes INTO the room (X direction).

Use labeled dimensions when present (high confidence), otherwise estimate from proportions.

For sketchNotes, provide DETAILED observations — aim for 6–10 bullet points covering:
  1. Overall kitchen layout type (L-shape, U-shape, galley, island, etc.)
  2. Every labeled dimension found in the sketch (counter run lengths, clearances, island size)
  3. All appliance positions and their sizes
  4. Aisle/clearance dimensions noted
  5. Upper cabinet mounting height if noted (A.F.F.)
  6. Countertop height if noted
  7. Any special notes written on the sketch (scale, construction notes)
  8. Total linear footage of base and upper cabinets
  9. Work triangle or workflow observations
  10. Any constraints or features that affect cabinet layout`,
          },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "extract_full_kitchen",
          description: "Extract all cabinet specs and floor-plan positions from a kitchen sketch",
          parameters: {
            type: "object",
            properties: {
              cabinets: {
                type: "array",
                description: "All cabinets and appliance bays in the sketch",
                items: {
                  type: "object",
                  properties: {
                    name:   { type: "string" },
                    type:   { type: "string", enum: ["base","wall","tall","corner","drawer_base","sink_base","island"] },
                    width:  { type: "number", description: "Width in mm" },
                    height: { type: "number", description: "Height in mm" },
                    depth:  { type: "number", description: "Depth in mm" },
                    posX: {
                      type: "number",
                      description: "Distance in mm from back-left origin to LEFT edge of cabinet footprint",
                    },
                    posZ: {
                      type: "number",
                      description: "Distance in mm from back wall to BACK edge of cabinet footprint (0 for back-wall cabs)",
                    },
                    wallSide: {
                      type: "string",
                      enum: ["back", "left", "right", "island", "none"],
                    },
                    parameters: {
                      type: "object",
                      properties: {
                        doorCount:          { type: "number" },
                        drawerCount:        { type: "number" },
                        shelfCount:         { type: "number" },
                        toeKickHeight:      { type: "number" },
                        constructionMethod: { type: "string" },
                        hingeType:          { type: "string" },
                      },
                    },
                    notes: { type: "string" },
                  },
                  required: ["name","type","width","height","depth","posX","posZ","wallSide","parameters","notes"],
                },
              },
              roomDimensions: {
                type: "object",
                properties: {
                  width: { type: "number", description: "Room width in mm (along back wall)" },
                  depth: { type: "number", description: "Room depth in mm (front to back)" },
                },
                required: ["width", "depth"],
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
              sketchNotes: {
                type: "array",
                items: { type: "string" },
                description: "Detailed observations from the sketch — 6 to 10 items covering: layout type, every labeled dimension, appliance positions and sizes, aisle clearances, mounting heights (A.F.F.), countertop notes, scale/construction notes, total linear footage, workflow observations, and any layout constraints. Each item is one complete sentence.",
              },
            },
            required: ["cabinets", "confidence", "sketchNotes"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "extract_full_kitchen" } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "extract_full_kitchen") {
    throw new Error("OpenAI did not return a function call");
  }

  return JSON.parse(toolCall.function.arguments) as SketchToCadResult;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  getContext(req);
  void params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return apiError("No file provided", 400);
  if (!ALLOWED_TYPES.has(file.type))
    return apiError("Unsupported file type. Use JPEG, PNG, WebP, or GIF. PDF is not supported.", 400);
  if (file.size > 20 * 1024 * 1024)
    return apiError("File too large. Maximum 20 MB.", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());

  let result: SketchToCadResult;
  try {
    result = await analyzeSketch(bytes, file.type);
  } catch (err) {
    console.error("[sketch-to-cad] OpenAI error:", err);
    return apiError("AI analysis unavailable. Try again later.", 503, "AI_UNAVAILABLE");
  }

  return ok(result);
}
