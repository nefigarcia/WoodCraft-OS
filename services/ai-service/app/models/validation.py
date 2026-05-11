from pydantic import BaseModel, Field
from typing import Optional


class PartSpec(BaseModel):
    name: str
    part_type: str
    width: float
    height: float
    thickness: float
    quantity: int = 1


class CabinetSpec(BaseModel):
    cabinet_id: str
    type: str
    width: float
    height: float
    depth: float
    parameters: dict = Field(default_factory=dict)
    parts: list[PartSpec] = Field(default_factory=list)


class ValidationRequest(BaseModel):
    cabinet: CabinetSpec
    room_width: Optional[float] = None
    room_height: Optional[float] = None
    adjacent_cabinets: list[CabinetSpec] = Field(default_factory=list)


class ValidationIssue(BaseModel):
    code: str
    message: str
    field: Optional[str] = None
    severity: str  # "error" | "warning"


class ValidationResponse(BaseModel):
    cabinet_id: str
    status: str  # "pass" | "warning" | "fail"
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)
    ai_model: Optional[str] = None
    raw_response: Optional[dict] = None
