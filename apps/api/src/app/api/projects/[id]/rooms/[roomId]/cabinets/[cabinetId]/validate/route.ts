import { NextRequest } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; roomId: string; cabinetId: string } };

interface ValidationIssue {
  code: string;
  message: string;
  field: string | null;
  severity: "error" | "warning";
}

interface ValidationResult {
  status: "pass" | "warning" | "fail";
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function validateWithOpenAI(
  cabinet: {
    type: string;
    width: number;
    height: number;
    depth: number;
    parameters: Record<string, unknown>;
    parts: { name: string; width: number; height: number; thickness: number; quantity: number }[];
  },
  roomWidth: number,
  roomHeight: number
): Promise<ValidationResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a cabinet manufacturing expert. Validate cabinet designs and identify structural, dimensional, or manufacturing issues. Be concise — only report real issues.",
      },
      {
        role: "user",
        content: `Validate this cabinet design:

Cabinet:
- Type: ${cabinet.type} (base | wall | tall | corner | island)
- Dimensions: ${cabinet.width}mm W × ${cabinet.height}mm H × ${cabinet.depth}mm D
- Parameters: ${JSON.stringify(cabinet.parameters)}
- Parts (${cabinet.parts.length}):
${cabinet.parts.map((p) => `  • ${p.name}: ${p.width}×${p.height}×${p.thickness}mm, qty ${p.quantity}`).join("\n")}

Room constraints:
- Width: ${roomWidth}mm
- Height: ${roomHeight}mm

Check for: dimensions outside standard ranges, cabinet exceeding room size, parts inconsistent with cabinet envelope, material thickness outside 15–19mm, missing structural parts, clearance or manufacturing concerns.`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "report_validation",
          description: "Report cabinet validation results",
          parameters: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["pass", "warning", "fail"] },
              errors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                    field: { type: "string", nullable: true },
                    severity: { type: "string", enum: ["error"] },
                  },
                  required: ["code", "message", "field", "severity"],
                },
              },
              warnings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                    field: { type: "string", nullable: true },
                    severity: { type: "string", enum: ["warning"] },
                  },
                  required: ["code", "message", "field", "severity"],
                },
              },
            },
            required: ["status", "errors", "warnings"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "report_validation" } },
  });

  const toolCall = response.choices[0]?.message.tool_calls?.[0];
  if (!toolCall) throw new Error("OpenAI did not return a tool call");

  return JSON.parse(toolCall.function.arguments) as ValidationResult;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const cabinet = await prisma.cabinet.findFirst({
    where: {
      id: params.cabinetId,
      orgId,
      roomId: params.roomId,
      room: { projectId: params.id },
    },
    include: {
      parts: true,
      room: { select: { width: true, height: true } },
    },
  });
  if (!cabinet) return apiError("Cabinet not found", 404);

  let result: ValidationResult;
  try {
    result = await validateWithOpenAI(
      {
        type: cabinet.type,
        width: Number(cabinet.width),
        height: Number(cabinet.height),
        depth: Number(cabinet.depth),
        parameters: cabinet.parameters as Record<string, unknown>,
        parts: cabinet.parts.map((p) => ({
          name: p.name,
          width: Number(p.width),
          height: Number(p.height),
          thickness: Number(p.thickness),
          quantity: p.quantity,
        })),
      },
      Number(cabinet.room.width),
      Number(cabinet.room.height)
    );
  } catch (err) {
    console.error("[validate] OpenAI error:", err);
    return apiError("AI validation service is unavailable. Try again later.", 503, "AI_UNAVAILABLE");
  }

  const report = await prisma.validationReport.create({
    data: {
      cabinetId: cabinet.id,
      orgId,
      projectId: params.id,
      status: result.status,
      errors: result.errors as unknown as import("@prisma/client").Prisma.InputJsonValue,
      warnings: result.warnings as unknown as import("@prisma/client").Prisma.InputJsonValue,
      aiModel: "gpt-4o-mini",
      rawResponse: result as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  });

  return ok(report, 201);
}
