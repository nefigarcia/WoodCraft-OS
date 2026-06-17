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
  posY: number;
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
  roomType: string;
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
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert interior designer and millwork/cabinetry specialist.
You analyze hand-drawn sketches, napkin drawings, and floor plans of ANY room type and extract built-in furniture and cabinet layouts with precise positions.
Always call extract_room_layout with your complete findings.`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
          },
          {
            type: "text",
            text: `Carefully analyze this sketch and extract EVERY cabinet, unit, and built-in element with their exact floor-plan positions.

STEP 1 — IDENTIFY ROOM TYPE
Read any text labels in the sketch (e.g. "living room", "kitchen", "bedroom", "office", "dining room").
The roomType field MUST reflect what is written or drawn — never default to "kitchen" unless it says so.

STEP 2 — READ ALL LABELED DIMENSIONS
Convert to mm: 1 inch = 25.4 mm · 1 foot = 304.8 mm
Use every labeled number — widths, heights, depths, clearances — as the primary source of truth.

STEP 3 — COORDINATE SYSTEM (top-down floor-plan view)
  Origin (0, 0, 0) = back-left corner of the room, at floor level
  X+ = right along the back wall
  Y+ = upward
  Z+ = forward into the room (away from back wall)

  posX = mm from origin to LEFT edge of the unit's footprint
  posY = mm from floor to BOTTOM of the unit (0 for floor-level units)
        · All base / tall / drawer / island units → posY = 0
        · Upper units that rest ON TOP of lower units → posY = height of the lower unit they sit on
        · Do NOT use 1371 mm for living room upper shelves — use the actual stacked height
        · Kitchen wall cabinets at standard 54" AFF → posY = 1371
  posZ = mm from back wall to BACK edge of the unit's footprint
        · Back-wall units  → posZ = 0
        · Left-wall units  → posX = 0, width runs along wall (Z axis), depth into room (X axis)
        · Right-wall units → posX = roomWidth − unitDepth
        · Freestanding/island → calculate from proportions and clearances

STEP 3b — ENFORCE EXACT POSITION CHAINING (no gaps, no overlaps)
  For units along the same wall, posX values MUST chain perfectly:
    unit[0].posX = 0
    unit[1].posX = unit[0].posX + unit[0].width
    unit[2].posX = unit[1].posX + unit[1].width  …and so on
  Verify: sum of all widths along a wall = room width (or the run length).
  For symmetric designs (e.g. left-tower + center + right-tower):
    · Left and right towers MUST have equal width and depth
    · rightTower.posX = roomWidth − rightTower.width
    · centerUnit.posX = leftTower.width
    · centerUnit.width = roomWidth − leftTower.width − rightTower.width

STEP 4 — UNIT TYPES AND DEFAULT DIMENSIONS BY ROOM TYPE

Kitchen:
  base cabinet     → 876 mm H × 610 mm D
  wall cabinet     → 762 mm H × 305 mm D
  tall/pantry      → 2134 mm H × 610 mm D
  sink base        → 914 mm W × 876 mm H × 610 mm D
  dishwasher       → 610 mm W × 876 mm H × 610 mm D
  range/oven       → 762 mm W × 876 mm H × 610 mm D
  refrigerator     → 914 mm W × 1981 mm H × 686 mm D

Living room / entertainment:
  TV / media console (base)  → use labeled width × 457 mm H × 457 mm D
  Entertainment tower (tall) → use labeled width × 2134 mm H × 406 mm D
  Upper display shelf (wall) → use labeled width × 305 mm H × 305 mm D
  Drawer unit (drawer_base)  → use labeled width × 610 mm H × 457 mm D
  A full-height wall-unit tower → type "tall", depth 406 mm

Bedroom:
  Wardrobe / closet (tall)   → use labeled width × 2134 mm H × 610 mm D
  Bedside (base)             → 500 mm W × 600 mm H × 450 mm D
  Dresser (drawer_base)      → use labeled width × 914 mm H × 508 mm D

Office:
  Desk unit (base)           → use labeled width × 762 mm H × 610 mm D
  Bookcase (tall)            → use labeled width × 2134 mm H × 305 mm D

STEP 5 — DETECT EVERY COMPONENT SEPARATELY
If the sketch shows a wall unit made of several sections (e.g. left tower + center TV opening + right tower + base drawers), output EACH section as its own cabinet entry. Do not merge them into one.

STEP 6 — sketchNotes (6–10 sentences)
Cover: room type identified, every labeled dimension, unit-by-unit description with sizes, any clearances or heights noted, total linear run, and anything special about the design.`,
          },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "extract_room_layout",
          description: "Extract all built-in units and their floor-plan positions from a room sketch",
          parameters: {
            type: "object",
            properties: {
              roomType: {
                type: "string",
                description: "Room type exactly as labeled in the sketch (e.g. 'living room', 'kitchen', 'bedroom'). Never default to 'kitchen' unless labeled.",
              },
              cabinets: {
                type: "array",
                description: "Every cabinet, unit, or built-in element detected — output separate entries for each distinct section",
                items: {
                  type: "object",
                  properties: {
                    name:   { type: "string", description: "Descriptive name matching the sketch (e.g. 'Left Tower', 'TV Opening', 'Drawer Base')" },
                    type:   { type: "string", enum: ["base","wall","tall","corner","drawer_base","sink_base","island"] },
                    width:  { type: "number", description: "Width in mm — use labeled dimension if present" },
                    height: { type: "number", description: "Height in mm" },
                    depth:  { type: "number", description: "Depth in mm" },
                    posX:   { type: "number", description: "mm from back-left origin to LEFT edge of unit footprint. Must chain exactly with adjacent units (no gaps, no overlaps)." },
                    posY:   { type: "number", description: "mm from floor to BOTTOM of unit. 0 for all floor-level units. For upper units resting on lower ones, set to the height of the unit below. Do NOT default to 1371 for living room shelves." },
                    posZ:   { type: "number", description: "mm from back wall to BACK edge of footprint (0 for back-wall units)" },
                    wallSide: { type: "string", enum: ["back","left","right","island","none"] },
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
                  required: ["name","type","width","height","depth","posX","posY","posZ","wallSide","parameters","notes"],
                },
              },
              roomDimensions: {
                type: "object",
                properties: {
                  width: { type: "number", description: "Room width in mm (along back wall)" },
                  depth: { type: "number", description: "Room depth in mm (front to back)" },
                },
                required: ["width","depth"],
              },
              confidence: { type: "string", enum: ["high","medium","low"] },
              sketchNotes: {
                type: "array",
                items: { type: "string" },
                description: "6–10 sentences: room type, every labeled dimension, each unit described with size, clearances, heights, total linear run, and any design notes.",
              },
            },
            required: ["roomType","cabinets","confidence","sketchNotes"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "extract_room_layout" } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "extract_room_layout") {
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
