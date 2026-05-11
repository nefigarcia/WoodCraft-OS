"""
Gemini-powered cabinet validation.
Sends cabinet geometry and parameters to Gemini 1.5 Pro with a structured
prompt, and parses the response into typed ValidationIssue objects.
"""

import json
from typing import Optional

import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig

from app.core.config import settings
from app.models.validation import CabinetSpec, ValidationIssue

SYSTEM_PROMPT = """You are an expert cabinet maker and structural engineer.
You will receive a cabinet specification and must validate it for:
1. Structural integrity (panel thickness relative to span)
2. Clearance issues (door swing, drawer pull clearance)
3. Measurement conflicts (parts that don't add up to cabinet dimensions)
4. Industry standard violations (e.g. base cabinet heights, overlay tolerances)

Respond ONLY with valid JSON in this exact schema:
{
  "status": "pass" | "warning" | "fail",
  "errors": [{"code": string, "message": string, "field": string | null, "severity": "error"}],
  "warnings": [{"code": string, "message": string, "field": string | null, "severity": "warning"}]
}
"""


def build_validation_prompt(cabinet: CabinetSpec, room_width: Optional[float], room_height: Optional[float]) -> str:
    lines = [
        f"Cabinet type: {cabinet.type}",
        f"Dimensions: W={cabinet.width}mm H={cabinet.height}mm D={cabinet.depth}mm",
        f"Parameters: {json.dumps(cabinet.parameters)}",
        f"Parts ({len(cabinet.parts)}):",
    ]
    for p in cabinet.parts:
        lines.append(f"  - {p.name}: {p.width}×{p.height}×{p.thickness}mm qty={p.quantity}")
    if room_width:
        lines.append(f"Room width: {room_width}mm")
    if room_height:
        lines.append(f"Room height: {room_height}mm")
    return "\n".join(lines)


def validate_cabinet(
    cabinet: CabinetSpec,
    room_width: Optional[float] = None,
    room_height: Optional[float] = None,
) -> dict:
    vertexai.init(
        project=settings.google_cloud_project,
        location=settings.vertex_ai_location,
    )
    model = GenerativeModel(
        settings.gemini_model,
        system_instruction=SYSTEM_PROMPT,
    )
    prompt = build_validation_prompt(cabinet, room_width, room_height)
    response = model.generate_content(
        prompt,
        generation_config=GenerationConfig(
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    return json.loads(response.text)
