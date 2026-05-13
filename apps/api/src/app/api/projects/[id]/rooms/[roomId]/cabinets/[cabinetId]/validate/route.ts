import { NextRequest } from "next/server";
import { GoogleGenAI, Type, FunctionCallingConfigMode } from "@google/genai";

export const maxDuration = 60;
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { apiError, ok } from "@/lib/errors";

interface PartRow {
  name: string;
  width: { valueOf(): unknown } | number | string;
  height: { valueOf(): unknown } | number | string;
  thickness: { valueOf(): unknown } | number | string;
  quantity: number;
}

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

function getGenAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 800
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isQuotaError =
        err instanceof Error && err.message.includes("quota");
      const isRetryable =
        !isQuotaError &&
        err instanceof Error &&
        (err.message.includes("429") ||
          err.message.includes("503") ||
          err.message.includes("502") ||
          err.message.includes("UNAVAILABLE") ||
          err.message.includes("timeout"));
      if (attempt >= retries || !isRetryable) throw err;
      await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
    }
  }
}

async function validateWithGemini(
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
  const ai = getGenAI();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a cabinet manufacturing expert. Validate this cabinet design and call the report_validation function with the results. Only report real issues.

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
      },
    ],
    config: {
      tools: [
        {
          functionDeclarations: [
            {
              name: "report_validation",
              description: "Report cabinet validation results",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  status: {
                    type: Type.STRING,
                    enum: ["pass", "warning", "fail"],
                    description: "Overall validation status",
                  },
                  errors: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        code: { type: Type.STRING },
                        message: { type: Type.STRING },
                        field: { type: Type.STRING },
                        severity: { type: Type.STRING, enum: ["error"] },
                      },
                      required: ["code", "message", "field", "severity"],
                    },
                  },
                  warnings: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        code: { type: Type.STRING },
                        message: { type: Type.STRING },
                        field: { type: Type.STRING },
                        severity: { type: Type.STRING, enum: ["warning"] },
                      },
                      required: ["code", "message", "field", "severity"],
                    },
                  },
                },
                required: ["status", "errors", "warnings"],
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ["report_validation"],
        },
      },
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const functionCall = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.functionCall
  )?.functionCall;

  if (!functionCall || functionCall.name !== "report_validation") {
    throw new Error("Gemini did not return a function call");
  }

  return functionCall.args as unknown as ValidationResult;
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
    result = await withRetry(() =>
      validateWithGemini(
        {
          type: cabinet.type,
          width: Number(cabinet.width),
          height: Number(cabinet.height),
          depth: Number(cabinet.depth),
          parameters: cabinet.parameters as Record<string, unknown>,
          parts: cabinet.parts.map((p: PartRow) => ({
            name: p.name,
            width: Number(p.width),
            height: Number(p.height),
            thickness: Number(p.thickness),
            quantity: p.quantity,
          })),
        },
        Number(cabinet.room.width),
        Number(cabinet.room.height)
      )
    );
  } catch (err) {
    console.error("[validate] Gemini error:", err);
    return apiError("AI validation service is unavailable. Try again later.", 503, "AI_UNAVAILABLE");
  }

  const report = await prisma.validationReport.create({
    data: {
      cabinetId: cabinet.id,
      orgId,
      projectId: params.id,
      status: result.status,
      errors: result.errors as any,
      warnings: result.warnings as any,
      aiModel: "gemini-2.5-flash",
      rawResponse: result as any,
    },
  });

  return ok(report, 201);
}
