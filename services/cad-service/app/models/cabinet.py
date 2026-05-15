from pydantic import BaseModel, Field
from typing import Optional


class CabinetGeometryRequest(BaseModel):
    cabinet_id: str
    type: str  # base | wall | tall | corner | island
    width: float = Field(gt=0, description="Width in mm")
    height: float = Field(gt=0, description="Height in mm")
    depth: float = Field(gt=0, description="Depth in mm")
    parameters: dict = Field(default_factory=dict)
    material_thickness: float = Field(default=18.0, description="Panel thickness in mm")


class PartDimensions(BaseModel):
    name: str
    part_type: str
    width: float
    height: float
    thickness: float
    quantity: int = 1
    grain_dir: Optional[str] = None        # "horizontal" | "vertical" | "none"
    edge_banding: Optional[dict] = None
    cut_params: Optional[dict] = None      # joinery, hardware positions, shelf_pins
    assembly_group: Optional[str] = None   # "carcass" | "face_frame" | "door" | "drawer" | "shelf"


class CabinetGeometryResponse(BaseModel):
    cabinet_id: str
    parts: list[PartDimensions]
    step_file_url: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)
