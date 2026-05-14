"""
OpenCascade solid geometry for cabinet assemblies.
Builds accurate 3D box solids per part, assembled into a compound, then exported as STEP/STL.
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

DRAWER_GAP = 2.0      # gap between drawer fronts (mm)
DRAWER_BOX_SIDE = 16  # drawer box side/back thickness (mm)
DRAWER_BOX_BTM = 6    # drawer box bottom thickness (mm)
DRAWER_CLEARANCE = 30 # clearance behind drawer box for slides (mm)


def _box(x: float, y: float, z: float, dx: float, dy: float, dz: float):
    """Solid box with corner at (x,y,z) and extents dx,dy,dz (mm). Skips degenerate boxes."""
    if dx <= 0 or dy <= 0 or dz <= 0:
        return None
    return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()


def _compound(shapes: list) -> TopoDS_Compound:
    builder = BRep_Builder()
    comp = TopoDS_Compound()
    builder.MakeCompound(comp)
    for s in shapes:
        if s is not None:
            builder.Add(comp, s)
    return comp


def _to_step_bytes(shape) -> bytes:
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


# ─── Shared part builders ─────────────────────────────────────────────────────

def _carcass_base(W, H, D, t, toe_h) -> list:
    """Standard base carcass: left/right panels, bottom, top nailer, back, toe kick."""
    return [
        _box(0,     toe_h, 0,   t,       H - toe_h,           D),        # left panel
        _box(W - t, toe_h, 0,   t,       H - toe_h,           D),        # right panel
        _box(t,     toe_h, 0,   W - 2*t, t,                   D - t),    # bottom
        _box(t,     H - t, 0,   W - 2*t, t,                   D - t),    # top nailer
        _box(t,     toe_h + t,  D - 6,   W - 2*t, H - toe_h - 2*t, 6),  # back (6mm HDF)
        _box(t,     0,     0,   W - 2*t, toe_h,               t),        # toe kick
    ]


def _carcass_box(W, H, D, t) -> list:
    """Simple closed box carcass (wall/tall cabinet without toe kick)."""
    return [
        _box(0,     0, 0,   t,       H,       D),        # left
        _box(W - t, 0, 0,   t,       H,       D),        # right
        _box(t,     0, 0,   W - 2*t, t,       D - t),    # bottom
        _box(t,     H - t, 0, W - 2*t, t,     D - t),    # top
        _box(t,     t, D - 6, W - 2*t, H - 2*t, 6),     # back
    ]


def _shelves(W, H, D, t, interior_y, interior_h, count) -> list:
    if count <= 0:
        return []
    step = interior_h / (count + 1)
    return [
        _box(t + 0.5, interior_y + step * (i + 1), 0, W - 2*t - 1, t, D - t - 0.5)
        for i in range(count)
    ]


def _door_fronts(W, H_front, y_base, t, count, overlay) -> list:
    """Overlay door panels. y_base = bottom Y of door zone, H_front = zone height."""
    if count <= 0:
        return []
    dw = W / count + overlay
    return [
        _box(i * (W / count) - overlay / 2, y_base - overlay / 2, -t, dw, H_front + overlay, t)
        for i in range(count)
    ]


def _drawer_parts(W, zone_y, zone_h, t, D, count, overlay) -> list:
    """
    Drawer fronts + interior drawer boxes stacked vertically within the zone.
    zone_y  = bottom Y of drawer zone (inside carcass, above bottom panel)
    zone_h  = total height available for all drawers
    """
    if count <= 0:
        return []

    shapes = []
    front_h = zone_h / count

    for i in range(count):
        front_y = zone_y + i * front_h

        # Horizontal nailer between drawers (sits inside carcass)
        if i > 0:
            shapes.append(_box(t, front_y, 0, W - 2*t, t, D - t))

        # Drawer front (overlay panel in front of face)
        shapes.append(_box(
            -overlay / 2,
            front_y + DRAWER_GAP / 2,
            -t,
            W + overlay,
            front_h - DRAWER_GAP,
            t,
        ))

        # Drawer box (interior plywood box)
        box_h = min(front_h - DRAWER_GAP - 4, 180.0)
        box_w = W - 2*t - 4
        box_d = D - t - DRAWER_CLEARANCE
        if box_h > 20 and box_w > 20 and box_d > 20:
            bx = t + 2
            by = front_y + DRAWER_GAP / 2 + 4
            bz = t
            # left side
            shapes.append(_box(bx,              by, bz,          DRAWER_BOX_SIDE, box_h, box_d))
            # right side
            shapes.append(_box(bx + box_w - DRAWER_BOX_SIDE, by, bz, DRAWER_BOX_SIDE, box_h, box_d))
            # back
            shapes.append(_box(bx,              by, bz + box_d - DRAWER_BOX_SIDE, box_w, box_h, DRAWER_BOX_SIDE))
            # bottom
            shapes.append(_box(bx,              by, bz,          box_w, DRAWER_BOX_BTM, box_d))

    return shapes


# ─── Cabinet type builders ────────────────────────────────────────────────────
# Coordinate system: X = width (left→right), Y = height (bottom→top), Z = depth (front→back)

def _base_cabinet(req: CabinetGeometryRequest) -> TopoDS_Compound:
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    toe_h        = float(p.get("toeKickHeight", 96.0))
    shelf_count  = int(p.get("shelfCount",  1))
    door_count   = int(p.get("doorCount",   2))
    drawer_count = int(p.get("drawerCount", 0))
    overlay      = float(p.get("doorOverlay", 3.0))

    shapes = _carcass_base(W, H, D, t, toe_h)
    interior_y = toe_h + t
    interior_h = H - toe_h - 2 * t

    if drawer_count > 0 and door_count == 0:
        # All drawers
        shapes += _drawer_parts(W, interior_y, interior_h, t, D, drawer_count, overlay)

    elif drawer_count > 0 and door_count > 0:
        # Drawers on top (~38%), doors on bottom (~62%)
        drawer_zone_h = round(interior_h * 0.38)
        door_zone_h   = interior_h - drawer_zone_h
        drawer_zone_y = interior_y + door_zone_h

        # Divider nailer between zones
        shapes.append(_box(t, drawer_zone_y, 0, W - 2*t, t, D - t))
        # Doors span from toe kick up to the divider nailer
        shapes += _door_fronts(W, door_zone_h + t, toe_h, t, door_count, overlay)
        shapes += _drawer_parts(W, drawer_zone_y, drawer_zone_h, t, D, drawer_count, overlay)

    else:
        # Doors only with shelves
        shapes += _shelves(W, H, D, t, interior_y, interior_h, shelf_count)
        shapes += _door_fronts(W, H - toe_h, toe_h, t, door_count, overlay)

    return _compound(shapes)


def _wall_cabinet(req: CabinetGeometryRequest) -> TopoDS_Compound:
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    shelf_count  = int(p.get("shelfCount",  1))
    door_count   = int(p.get("doorCount",   2))
    drawer_count = int(p.get("drawerCount", 0))
    overlay      = float(p.get("doorOverlay", 3.0))

    shapes = _carcass_box(W, H, D, t)
    interior_y = t
    interior_h = H - 2 * t

    if drawer_count > 0 and door_count == 0:
        shapes += _drawer_parts(W, interior_y, interior_h, t, D, drawer_count, overlay)
    elif drawer_count > 0 and door_count > 0:
        drawer_zone_h = round(interior_h * 0.38)
        door_zone_h   = interior_h - drawer_zone_h
        drawer_zone_y = interior_y + door_zone_h
        shapes.append(_box(t, drawer_zone_y, 0, W - 2*t, t, D - t))
        shapes += _door_fronts(W, door_zone_h, 0, t, door_count, overlay)
        shapes += _drawer_parts(W, drawer_zone_y, drawer_zone_h, t, D, drawer_count, overlay)
    else:
        shapes += _shelves(W, H, D, t, interior_y, interior_h, shelf_count)
        shapes += _door_fronts(W, H, 0, t, door_count, overlay)

    return _compound(shapes)


def _tall_cabinet(req: CabinetGeometryRequest) -> TopoDS_Compound:
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    toe_h        = float(p.get("toeKickHeight", 96.0))
    shelf_count  = int(p.get("shelfCount",  3))
    door_count   = int(p.get("doorCount",   2))
    drawer_count = int(p.get("drawerCount", 0))
    overlay      = float(p.get("doorOverlay", 3.0))

    shapes = _carcass_base(W, H, D, t, toe_h)
    interior_y = toe_h + t
    interior_h = H - toe_h - 2 * t

    if drawer_count > 0:
        # Drawers in bottom portion, doors above
        drawer_zone_h = min(drawer_count * 200.0, interior_h * 0.35)
        door_zone_y   = interior_y + drawer_zone_h
        door_zone_h   = interior_h - drawer_zone_h

        # Divider nailer
        shapes.append(_box(t, door_zone_y, 0, W - 2*t, t, D - t))
        shapes += _drawer_parts(W, interior_y, drawer_zone_h, t, D, drawer_count, overlay)

        # Shelves and doors in upper zone
        shapes += _shelves(W, H, D, t, door_zone_y + t, door_zone_h - t, shelf_count)
        shapes += _door_fronts(W, door_zone_h + t, toe_h + drawer_zone_h, t, door_count, overlay)
    else:
        shapes += _shelves(W, H, D, t, interior_y, interior_h, shelf_count)
        shapes += _door_fronts(W, H - toe_h, toe_h, t, door_count, overlay)

    return _compound(shapes)


def _island_cabinet(req: CabinetGeometryRequest) -> TopoDS_Compound:
    """Island: base cabinet without toe kick recess, accessible from all sides (no back panel)."""
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    shelf_count  = int(p.get("shelfCount",  1))
    door_count   = int(p.get("doorCount",   2))
    drawer_count = int(p.get("drawerCount", 0))
    overlay      = float(p.get("doorOverlay", 3.0))

    shapes = [
        _box(0,     0, 0, t,       H, D),        # left
        _box(W - t, 0, 0, t,       H, D),        # right
        _box(t,     0, 0, W - 2*t, t, D - t),    # bottom
        _box(t, H - t, 0, W - 2*t, t, D - t),   # top
        # back panel (single accessible side)
        _box(t, t, D - 6, W - 2*t, H - 2*t, 6),
    ]

    interior_y = t
    interior_h = H - 2 * t

    if drawer_count > 0 and door_count == 0:
        shapes += _drawer_parts(W, interior_y, interior_h, t, D, drawer_count, overlay)
    elif drawer_count > 0 and door_count > 0:
        drawer_zone_h = round(interior_h * 0.38)
        door_zone_h   = interior_h - drawer_zone_h
        drawer_zone_y = interior_y + door_zone_h
        shapes.append(_box(t, drawer_zone_y, 0, W - 2*t, t, D - t))
        shapes += _door_fronts(W, door_zone_h, 0, t, door_count, overlay)
        shapes += _drawer_parts(W, drawer_zone_y, drawer_zone_h, t, D, drawer_count, overlay)
    else:
        shapes += _shelves(W, H, D, t, interior_y, interior_h, shelf_count)
        shapes += _door_fronts(W, H, 0, t, door_count, overlay)

    return _compound(shapes)


def _corner_cabinet(req: CabinetGeometryRequest) -> TopoDS_Compound:
    """Blind-corner base cabinet: standard box with extra depth on one side."""
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    toe_h      = float(p.get("toeKickHeight", 96.0))
    door_count = int(p.get("doorCount", 1))
    overlay    = float(p.get("doorOverlay", 3.0))

    shapes = _carcass_base(W, H, D, t, toe_h)
    # Blind panel across the corner opening
    shapes.append(_box(W - t, toe_h, 0, t, H - toe_h, D))
    shapes += _door_fronts(W, H - toe_h, toe_h, t, door_count, overlay)

    return _compound(shapes)


# ─── Registry & public API ────────────────────────────────────────────────────

_BUILDERS = {
    "base":   _base_cabinet,
    "wall":   _wall_cabinet,
    "tall":   _tall_cabinet,
    "island": _island_cabinet,
    "corner": _corner_cabinet,
}


def build_cabinet_shape(req: CabinetGeometryRequest) -> TopoDS_Compound:
    builder = _BUILDERS.get(req.type)
    if builder is None:
        raise ValueError(
            f"No 3D geometry builder for cabinet type {req.type!r}. "
            f"Supported: {list(_BUILDERS)}"
        )
    return builder(req)


def build_cabinet_step(req: CabinetGeometryRequest) -> bytes:
    return _to_step_bytes(build_cabinet_shape(req))


def _to_stl_bytes(shape) -> bytes:
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
    return _to_stl_bytes(build_cabinet_shape(req))
