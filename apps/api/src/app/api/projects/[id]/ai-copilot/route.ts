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

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert kitchen cabinet designer and millwork specialist. Generate complete, professional cabinet specifications from natural language descriptions. Always call the generate_kitchen_design function.",
        },
        {
          role: "user",
          content: `Design request: "${body.prompt}"

Guidelines:
- Base cabinets: 876mm H (34.5") × 610mm D (24") standard
- Wall cabinets: 762mm H (30") × 305mm D (12") standard
- Tall/pantry cabinets: 2134mm H (84") × 610mm D (24")
- Island: 914mm H (36") × 762–1067mm D (30–42")
- 1 ft = 304.8mm (e.g. 10 ft island = 3048mm wide)
- Default: face-frame construction, shaker doors, soft-close hinges
- Toe kick height: 89mm (3.5") standard`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "generate_kitchen_design",
            description: "Generate a complete kitchen cabinet design from a natural language description",
            parameters: {
              type: "object",
              properties: {
                requirements: {
                  type: "array",
                  items: { type: "string" },
                  description: "Gathered requirements extracted from the user request",
                },
                cabinetList: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name:   { type: "string", description: "Human-readable cabinet name" },
                      type:   { type: "string", enum: ["base","wall","tall","corner","drawer_base","sink_base","island"] },
                      width:  { type: "number", description: "Width in mm" },
                      height: { type: "number", description: "Height in mm" },
                      depth:  { type: "number", description: "Depth in mm" },
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
                    required: ["name", "type", "width", "height", "depth", "parameters", "notes"],
                  },
                },
                roomLogic: {
                  type: "object",
                  properties: {
                    suggestedRoomWidth: { type: "number", description: "Room width in mm" },
                    suggestedRoomDepth: { type: "number", description: "Room depth in mm" },
                    layout:             { type: "string", description: "Layout type (e.g. Island + L-shape perimeter)" },
                  },
                  required: ["suggestedRoomWidth", "suggestedRoomDepth", "layout"],
                },
                standards: {
                  type: "array",
                  items: { type: "string" },
                  description: "Applicable construction standards and specifications",
                },
                designNotes: {
                  type: "array",
                  items: { type: "string" },
                  description: "Important clearances, recommendations, and design notes",
                },
              },
              required: ["requirements", "cabinetList", "roomLogic", "standards", "designNotes"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "generate_kitchen_design" } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "generate_kitchen_design") {
      return apiError("AI failed to generate a design. Try again.", 503, "AI_ERROR");
    }

    return ok(JSON.parse(toolCall.function.arguments) as CopilotResult);
  } catch (err) {
    console.error("[ai-copilot] OpenAI error:", err);
    return apiError("AI service unavailable. Try again later.", 503, "AI_UNAVAILABLE");
  }
}
