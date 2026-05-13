from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.models.cabinet import CabinetGeometryRequest, CabinetGeometryResponse
from app.services.parametric import compute_parts
from app.services.geometry import build_cabinet_step, build_cabinet_stl
from app.services.drawing import build_shop_drawing_svg

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


@router.post("/{cabinet_id}/step")
def export_step(cabinet_id: str, req: CabinetGeometryRequest) -> Response:
    """
    Generate a STEP file for the cabinet assembly using OpenCascade.
    Returns raw STEP bytes as a file download.
    """
    try:
        step_bytes = build_cabinet_step(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"STEP generation failed: {exc}")

    return Response(
        content=step_bytes,
        media_type="application/step",
        headers={
            "Content-Disposition": f'attachment; filename="cabinet_{cabinet_id}.step"',
        },
    )


@router.post("/{cabinet_id}/mesh")
def export_mesh(cabinet_id: str, req: CabinetGeometryRequest) -> Response:
    """Generate a binary STL mesh for in-browser 3D preview."""
    try:
        stl_bytes = build_cabinet_stl(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Mesh generation failed: {exc}")

    return Response(
        content=stl_bytes,
        media_type="model/stl",
        headers={
            "Content-Disposition": f'attachment; filename="cabinet_{cabinet_id}.stl"',
        },
    )


@router.post("/{cabinet_id}/drawing")
def export_drawing(cabinet_id: str, req: CabinetGeometryRequest) -> Response:
    """
    Generate a 3-view SVG shop drawing (front elevation / side elevation / plan)
    using OpenCascade Hidden Line Removal.
    """
    try:
        svg_bytes = build_shop_drawing_svg(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Drawing generation failed: {exc}")

    return Response(
        content=svg_bytes,
        media_type="image/svg+xml",
        headers={
            "Content-Disposition": f'attachment; filename="drawing_{cabinet_id}.svg"',
        },
    )
