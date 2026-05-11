from fastapi import APIRouter, HTTPException
from app.models.cabinet import CabinetGeometryRequest, CabinetGeometryResponse
from app.services.parametric import compute_parts

router = APIRouter()


@router.post("/geometry", response_model=CabinetGeometryResponse)
def compute_geometry(req: CabinetGeometryRequest) -> CabinetGeometryResponse:
    """
    Compute all part dimensions for a cabinet from its top-level parameters.
    Called by apps/api whenever a cabinet is saved or its dimensions change.
    """
    try:
        parts = compute_parts(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return CabinetGeometryResponse(
        cabinet_id=req.cabinet_id,
        parts=parts,
    )
