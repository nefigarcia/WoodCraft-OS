from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.nesting import NestingPart, compute_nesting
from app.services.diagram import generate_svg

router = APIRouter()


class NestingPartIn(BaseModel):
    id: str
    name: str
    width: float
    height: float
    quantity: int = 1
    rotatable: bool = True


class NestingRequest(BaseModel):
    parts: list[NestingPartIn]
    sheet_width: float = Field(default=1220.0, gt=0, description="Sheet width in mm")
    sheet_height: float = Field(default=2440.0, gt=0, description="Sheet height in mm")
    kerf: float = Field(default=3.2, ge=0, description="Saw blade kerf in mm")


class PlacementOut(BaseModel):
    part_id: str
    part_name: str
    x: float
    y: float
    width: float
    height: float
    rotated: bool
    sheet_index: int


class SheetOut(BaseModel):
    index: int
    width: float
    height: float
    placements: list[PlacementOut]
    efficiency: float


class NestingResponse(BaseModel):
    sheets: list[SheetOut]
    total_sheets: int
    total_parts: int
    overall_efficiency: float
    unplaced_parts: list[str]
    svg: str


@router.post("/compute", response_model=NestingResponse)
def compute(req: NestingRequest) -> NestingResponse:
    parts = [NestingPart(**p.model_dump()) for p in req.parts]
    result = compute_nesting(parts, req.sheet_width, req.sheet_height, req.kerf)
    return NestingResponse(
        sheets=[
            SheetOut(
                index=s.index,
                width=s.width,
                height=s.height,
                placements=[PlacementOut(**vars(p)) for p in s.placements],
                efficiency=s.efficiency,
            )
            for s in result.sheets
        ],
        total_sheets=result.total_sheets,
        total_parts=result.total_parts,
        overall_efficiency=result.overall_efficiency,
        unplaced_parts=result.unplaced,
        svg=generate_svg(result),
    )
