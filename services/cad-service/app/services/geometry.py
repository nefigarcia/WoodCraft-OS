"""
OpenCascade solid geometry for cabinet assemblies.
Builds accurate 3D box solids per part, assembled into a compound, then exported as STEP.
"""
import os
import tempfile

from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCC.Core.BRep import BRep_Builder
from OCC.Core.TopoDS import TopoDS_Compound
from OCC.Core.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh
from OCC.Core.StlAPI import StlAPI_Writer
from OCC.Core.gp import gp_Pnt

from app.models.cabinet import CabinetGeometryRequest


def _box(x: float, y: float, z: float, dx: float, dy: float, dz: float):
    """Create a solid box with corner at (x, y, z) and given extents (all in mm)."""
    return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()


def _compound(shapes: list) -> TopoDS_Compound:
    builder = BRep_Builder()
    comp = TopoDS_Compound()
    builder.MakeCompound(comp)
    for s in shapes:
        builder.Add(comp, s)
    return comp


def _to_step_bytes(shape) -> bytes:
    """Export an OCC shape to STEP and return the raw file bytes."""
    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp:
        path = tmp.name
    try:
        writer = STEPControl_Writer()
        writer.Transfer(shape, STEPControl_AsIs)
        status = writer.Write(path)
        if status != IFSelect_RetDone:
            raise RuntimeError("STEP writer returned non-OK status")
        with open(path, "rb") as f:
            return f.read()
    finally:
        os.unlink(path)


# ─── Cabinet type builders ────────────────────────────────────────────────────
# Coordinate system: X = width (left→right), Y = height (bottom→top), Z = depth (front→back)

def _base_cabinet(req: CabinetGeometryRequest) -> TopoDS_Compound:
    t = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p = req.parameters

    toe_h: float = p.get("toeKickHeight", 96.0)
    shelf_count: int = int(p.get("shelfCount", 1))
    door_count: int = int(p.get("doorCount", 2))
    door_overlay: float = p.get("doorOverlay", 3.0)

    shapes = [
        _box(0,     toe_h, 0, t,       H - toe_h,       D),      # left panel
        _box(W - t, toe_h, 0, t,       H - toe_h,       D),      # right panel
        _box(t,     toe_h, 0, W - 2*t, t,               D - t),  # bottom panel
        _box(t,     H - t, 0, W - 2*t, t,               D - t),  # top nailer
        _box(t,     toe_h + t, D - 6,  W - 2*t, H - toe_h - 2*t, 6),  # back (6mm HDF)
        _box(t,     0,     0, W - 2*t, toe_h,           t),      # toe kick
    ]

    # Evenly-spaced shelves inside the carcass
    interior_h = H - toe_h - 2 * t
    shelf_step = interior_h / (shelf_count + 1)
    for i in range(shelf_count):
        sy = toe_h + t + shelf_step * (i + 1)
        shapes.append(_box(t + 0.5, sy, 0, W - 2*t - 1, t, D - t - 0.5))

    # Doors sit in front of the cabinet face (Z < 0 = extends forward)
    if door_count > 0:
        dw = W / door_count + door_overlay
        dh = H - toe_h + door_overlay
        for i in range(door_count):
            dx = i * (W / door_count) - door_overlay / 2
            shapes.append(_box(dx, toe_h - door_overlay / 2, -t, dw, dh, t))

    return _compound(shapes)


def _wall_cabinet(req: CabinetGeometryRequest) -> TopoDS_Compound:
    t = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p = req.parameters

    shelf_count: int = int(p.get("shelfCount", 1))
    door_count: int = int(p.get("doorCount", 2))
    door_overlay: float = p.get("doorOverlay", 3.0)

    shapes = [
        _box(0,     0,     0, t,       H,       D),      # left panel
        _box(W - t, 0,     0, t,       H,       D),      # right panel
        _box(t,     H - t, 0, W - 2*t, t,       D - t),  # top
        _box(t,     0,     0, W - 2*t, t,       D - t),  # bottom
        _box(t,     t,     D - 6, W - 2*t, H - 2*t, 6),  # back
    ]

    interior_h = H - 2 * t
    shelf_step = interior_h / (shelf_count + 1)
    for i in range(shelf_count):
        sy = t + shelf_step * (i + 1)
        shapes.append(_box(t + 0.5, sy, 0, W - 2*t - 1, t, D - t - 0.5))

    if door_count > 0:
        dw = W / door_count + door_overlay
        dh = H + door_overlay
        for i in range(door_count):
            dx = i * (W / door_count) - door_overlay / 2
            shapes.append(_box(dx, -door_overlay / 2, -t, dw, dh, t))

    return _compound(shapes)


_BUILDERS = {
    "base": _base_cabinet,
    "wall": _wall_cabinet,
}


def build_cabinet_shape(req: CabinetGeometryRequest) -> TopoDS_Compound:
    """Build the OCC compound for a cabinet (shared by STEP export and drawing generation)."""
    builder = _BUILDERS.get(req.type)
    if builder is None:
        raise ValueError(
            f"No 3D geometry builder for cabinet type {req.type!r}. "
            f"Supported types: {list(_BUILDERS)}"
        )
    return builder(req)


def build_cabinet_step(req: CabinetGeometryRequest) -> bytes:
    """Build an OCC compound for the given cabinet and return raw STEP bytes."""
    return _to_step_bytes(build_cabinet_shape(req))


def _to_stl_bytes(shape) -> bytes:
    """Mesh an OCC shape and export as binary STL bytes."""
    BRepMesh_IncrementalMesh(shape, 0.5, False, 0.5)
    with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp:
        path = tmp.name
    try:
        writer = StlAPI_Writer()
        writer.Write(shape, path)
        with open(path, "rb") as f:
            return f.read()
    finally:
        os.unlink(path)


def build_cabinet_stl(req: CabinetGeometryRequest) -> bytes:
    """Build an OCC compound for the given cabinet and return raw STL bytes."""
    return _to_stl_bytes(build_cabinet_shape(req))
