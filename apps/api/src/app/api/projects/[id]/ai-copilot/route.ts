import { NextRequest } from "next/server";
import OpenAI from "openai";

import { getContext } from "@/lib/context";
import { apiError, ok } from "@/lib/errors";

type CabinetType = "base" | "wall" | "tall" | "corner" | "drawer_base" | "sink_base" | "island";

interface AICabinetSpec {
  name: string;
  type: CabinetType;
  width: number;
  height: number;
  depth: number;
  posX: number;
  posY: number;
  posZ: number;
  wallSide: "back" | "left" | "right" | "island" | "none";
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

export interface CopilotResult {
  roomType: string;
  designConcept: string;
  imageUrl?: string;
  requirements: string[];
  cabinetList: AICabinetSpec[];
  roomLogic: {
    suggestedRoomWidth: number;
    suggestedRoomDepth: number;
    layout: string;
  };
  standards: string[];
  designNotes: string[];
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  getContext(req);
  void params;

  const body = (await req.json()) as { prompt: string };
  if (!body.prompt?.trim()) return apiError("prompt is required");

  const client = getOpenAI();

  // Build the image prompt from the raw user request so both calls can run in parallel.
  const imagePrompt =
    `Photorealistic interior design render: ${body.prompt}. ` +
    `High-end custom built-in cabinetry and millwork, beautiful natural lighting, ` +
    `professional architectural photography, showroom quality. No text or labels in the image.`;

  try {
    // ── Run design generation + image generation in parallel ─────────────────
    const [designResponse, imageResponse] = await Promise.all([
      client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert interior designer and millwork specialist.
You design custom built-in cabinetry and furniture for ANY room type: kitchens, living rooms, bedrooms, home offices, dining rooms, bathrooms, etc.
Detect the room type from the user's prompt and generate a complete, positioned layout tailored to that room.
Always call generate_room_design with your complete findings.`,
          },
          {
            role: "user",
            content: `Design request: "${body.prompt}"

STEP 1 — DETECT ROOM TYPE
Identify the room from the prompt (kitchen, living room, bedroom, office, etc.). Default to "kitchen" only if explicitly mentioned or no room is specified.

STEP 2 — GENERATE DESIGN CONCEPT
Write a 1–2 sentence design concept describing the overall style, materials, and layout.

STEP 3 — DIMENSION STANDARDS (1 ft = 304.8 mm · 1 in = 25.4 mm)

Kitchen:
  Base cabinets:     varies W × 876 mm H × 610 mm D
  Wall cabinets:     varies W × 762 mm H × 305 mm D
  Tall/pantry:       varies W × 2134 mm H × 610 mm D
  Sink base:         914 mm W × 876 mm H × 610 mm D
  Island:            use prompt dimensions or 1524 mm W × 914 mm H × 762 mm D

Living room / entertainment:
  TV console (base): varies W × 457 mm H × 457 mm D
  Side tower (tall): varies W × 2134 mm H × 406 mm D
  Upper shelf (wall): varies W × 305 mm H × 305 mm D  — posY = height of unit below
  Drawer unit (drawer_base): varies W × 610 mm H × 457 mm D

Bedroom:
  Wardrobe (tall):   varies W × 2134 mm H × 610 mm D
  Nightstand (base): 500 mm W × 600 mm H × 450 mm D
  Dresser (drawer_base): varies W × 914 mm H × 508 mm D

Office:
  Desk unit (base):  varies W × 762 mm H × 610 mm D
  Bookcase (tall):   varies W × 2134 mm H × 305 mm D
  Overhead (wall):   varies W × 457 mm H × 305 mm D — posY = height of desk

STEP 4 — COORDINATE SYSTEM
  Origin (0,0,0) = back-left corner of the room, at floor level
  X+ = right along the back wall · Y+ = up · Z+ = into the room

  posX: mm from origin to LEFT edge of unit's footprint
  posY: mm from floor to BOTTOM of unit
        — All floor-level units → posY = 0
        — Upper units resting on lower units → posY = height of lower unit
        — Kitchen wall cabinets at 54" AFF → posY = 1371
  posZ: mm from back wall to BACK edge (0 for back-wall units)
        — Left/right-wall units: posX = 0 or (roomWidth − depth)

STEP 5 — EXACT POSITION CHAINING (no gaps, no overlaps)
  For units along the same wall, chain posX exactly:
    unit[n+1].posX = unit[n].posX + unit[n].width
  Verify: sum of widths = total run length (room width or the relevant wall run).
  For symmetric layouts (e.g. left-tower + center + right-tower):
    left and right units must have EQUAL width and depth.
    rightUnit.posX = roomWidth − rightUnit.width
    centerUnit.posX = leftUnit.width
    centerUnit.width = roomWidth − leftUnit.width − rightUnit.width

STEP 6 — COVER ALL COMPONENTS SEPARATELY
  Output each distinct section as its own entry in cabinetList.
  If the design has upper and lower units at the same X position, create two entries with different posY values.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_room_design",
              description: "Generate a complete room built-in design from a natural language description",
              parameters: {
                type: "object",
                properties: {
                  roomType: {
                    type: "string",
                    description: "Room type (e.g. 'kitchen', 'living room', 'bedroom', 'home office')",
                  },
                  designConcept: {
                    type: "string",
                    description: "1–2 sentence design concept describing style, materials, and layout",
                  },
                  requirements: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key requirements extracted from the user prompt",
                  },
                  cabinetList: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name:     { type: "string" },
                        type:     { type: "string", enum: ["base","wall","tall","corner","drawer_base","sink_base","island"] },
                        width:    { type: "number", description: "Width in mm" },
                        height:   { type: "number", description: "Height in mm" },
                        depth:    { type: "number", description: "Depth in mm" },
                        posX:     { type: "number", description: "mm from back-left origin to LEFT edge. Must chain exactly with adjacent units." },
                        posY:     { type: "number", description: "mm from floor to bottom of unit. 0 for floor-level. Use actual stacked height for upper units." },
                        posZ:     { type: "number", description: "mm from back wall to back edge (0 for back-wall units)" },
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
                  roomLogic: {
                    type: "object",
                    properties: {
                      suggestedRoomWidth: { type: "number", description: "Room width in mm" },
                      suggestedRoomDepth: { type: "number", description: "Room depth in mm" },
                      layout:             { type: "string", description: "Layout description (e.g. 'L-shape kitchen', 'Symmetric entertainment wall')" },
                    },
                    required: ["suggestedRoomWidth","suggestedRoomDepth","layout"],
                  },
                  standards: {
                    type: "array",
                    items: { type: "string" },
                    description: "Applicable construction and industry standards",
                  },
                  designNotes: {
                    type: "array",
                    items: { type: "string" },
                    description: "Important clearances, recommendations, and design observations",
                  },
                },
                required: ["roomType","designConcept","requirements","cabinetList","roomLogic","standards","designNotes"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_room_design" } },
      }),

      // DALL-E 3 runs in parallel — failure is non-fatal
      client.images.generate({
        model: "dall-e-3",
        prompt: imagePrompt,
        size: "1792x1024",
        quality: "standard",
        n: 1,
      }).catch((err) => {
        console.warn("[ai-copilot] image generation failed (non-fatal):", err);
        return null;
      }),
    ]);

    const toolCall = designResponse.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "generate_room_design") {
      return apiError("AI failed to generate a design. Try again.", 503, "AI_ERROR");
    }

    const design = JSON.parse(toolCall.function.arguments) as CopilotResult;
    const imageUrl = imageResponse?.data?.[0]?.url ?? undefined;

    return ok({ ...design, imageUrl });
  } catch (err) {
    console.error("[ai-copilot] OpenAI error:", err);
    return apiError("AI service unavailable. Try again later.", 503, "AI_UNAVAILABLE");
  }
}
