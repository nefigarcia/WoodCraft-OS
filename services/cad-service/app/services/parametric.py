"""
Parametric cabinet engine — enterprise-grade part computation.

Every builder outputs parts with:
  - grain_dir        horizontal | vertical | none
  - assembly_group   carcass | face_frame | door | drawer | shelf
  - cut_params       joinery specs, shelf-pin layouts, hardware boring positions

Cabinet types: base, wall, tall, corner, drawer_base, sink_base, island
Construction:  frameless (default) | face_frame
"""

from typing import Optional
from app.models.cabinet import CabinetGeometryRequest, PartDimensions


# ─── Part factory ──────────────────────────────────────────────────────────────

def _p(
    name: str,
    part_type: str,
    width: float,
    height: float,
    thickness: float,
    *,
    qty: int = 1,
    grain: Optional[str] = None,
    eb: Optional[dict] = None,
    cut: Optional[dict] = None,
    group: Optional[str] = None,
) -> PartDimensions:
    return PartDimensions(
        name=name,
        part_type=part_type,
        width=width,
        height=height,
        thickness=thickness,
        quantity=qty,
        grain_dir=grain,
        edge_banding=eb,
        cut_params=cut,
        assembly_group=group,
    )


def _eb(*sides: str) -> dict:
    """Build edge-banding dict from named sides: _eb("top","right") etc."""
    return {s: (s in sides) for s in ("top", "bottom", "left", "right")}


# ─── Shared helpers ────────────────────────────────────────────────────────────

def _shelf_pin_cut(spacing: float = 32.0, inset: float = 37.0) -> dict:
    return {"shelf_pins": {"spacing_mm": spacing, "row_inset_mm": inset, "rows": 2}}


def _dado_cut(depth: float, **extra) -> dict:
    return {"joinery": {"type": "dado", "depth_mm": round(depth, 2), **extra}}


def _hinge_cut(door_h: float) -> dict:
    """35 mm Euro-hinge boring positions calculated from door height."""
    count = max(2, int(door_h / 500) + 1)
    if count == 2:
        positions = [100.0, door_h - 100.0]
    else:
        mid = [(door_h / 2) + (i - (count - 2) / 2) * 150 for i in range(count - 2)]
        positions = [100.0] + mid + [door_h - 100.0]
    return {
        "hardware": {
            "type": "hinge",
            "style": "euro_35mm",
            "count": count,
            "cup_diameter_mm": 35,
            "boring_depth_mm": 13.5,
            "plate_inset_mm": 3.0,
            "positions_from_top_mm": [round(p, 1) for p in positions],
        }
    }


def _slide_cut(interior_depth: float) -> dict:
    slide_len = int(interior_depth * 0.75 / 50) * 50  # nearest 50 mm increment
    return {
        "hardware": {
            "type": "drawer_slide",
            "style": "undermount",
            "length_mm": slide_len,
            "side_space_mm": 13,
        }
    }


def _face_frame(
    W: float,
    H: float,
    t_ff: float,
    stile_w: float,
    rail_w: float,
    door_count: int,
) -> list[PartDimensions]:
    """Solid-wood face frame: stiles, top/bottom rails, mullions."""
    interior_w = W - 2 * stile_w
    pocket = {"joinery": {"type": "pocket_screw", "screws_per_joint": 2}}
    parts = [
        _p("face_frame_left_stile",  "face_frame_stile", stile_w, H, t_ff,
           grain="vertical",   eb=_eb("top", "bottom", "left"), cut=pocket, group="face_frame"),
        _p("face_frame_right_stile", "face_frame_stile", stile_w, H, t_ff,
           grain="vertical",   eb=_eb("top", "bottom", "right"), cut=pocket, group="face_frame"),
        _p("face_frame_top_rail",    "face_frame_rail",  interior_w, rail_w, t_ff,
           grain="horizontal", eb=_eb("top"), cut=pocket, group="face_frame"),
        _p("face_frame_bottom_rail", "face_frame_rail",  interior_w, rail_w, t_ff,
           grain="horizontal", eb=_eb("bottom"), cut=pocket, group="face_frame"),
    ]
    if door_count > 1:
        mullion_h = H - 2 * rail_w
        for i in range(door_count - 1):
            parts.append(_p(
                f"face_frame_mullion_{i + 1}", "face_frame_mullion",
                stile_w, mullion_h, t_ff,
                grain="vertical", cut=pocket, group="face_frame",
            ))
    return parts


def _drawer_bank(
    count: int,
    section_h: float,
    cabinet_w: float,
    interior_w: float,
    interior_d: float,
    t: float,
    door_overlay: float,
) -> list[PartDimensions]:
    """Full drawer set: fronts, Eurobox front/back/sides/bottom."""
    if count == 0:
        return []
    front_h = (section_h / count) + door_overlay
    front_w = (cabinet_w / 1) + door_overlay          # full-width drawer front
    box_w   = interior_w - 26.0                       # 13 mm clearance each side
    box_d   = interior_d - 50.0                       # 50 mm for slide hardware
    box_h   = min(front_h - 20.0, 170.0)
    return [
        _p("drawer_front", "drawer_front", front_w, front_h, t,
           qty=count, grain="vertical",
           eb=_eb("top", "bottom", "left", "right"),
           cut=_slide_cut(interior_d), group="drawer"),
        _p("drawer_box_front_back", "drawer_box", box_w, box_h, t,
           qty=count * 2, grain="horizontal", group="drawer"),
        _p("drawer_box_side", "drawer_box", box_d, box_h, t,
           qty=count * 2, grain="horizontal", group="drawer"),
        _p("drawer_box_bottom", "drawer_box", box_w - 2 * t, box_d, 6.0,
           qty=count, grain="horizontal", group="drawer"),
    ]


# ─── Cabinet builders ──────────────────────────────────────────────────────────

def compute_base_cabinet(req: CabinetGeometryRequest) -> list[PartDimensions]:
    """Standard base cabinet — frameless or face-frame, with drawers."""
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    door_count   = int(p.get("doorCount",   2))
    drawer_count = int(p.get("drawerCount", 0))
    shelf_count  = int(p.get("shelfCount",  1))
    toe_h        = float(p.get("toeKickHeight",      96.0))
    overlay      = float(p.get("doorOverlay",         3.0))
    construction = p.get("constructionMethod", "frameless")
    stile_w      = float(p.get("stileWidth",         38.0))
    rail_w       = float(p.get("railWidth",          38.0))
    t_ff         = float(p.get("faceFrameThickness", 19.0))

    cab_h      = H - toe_h
    int_w      = W - 2 * t
    int_h      = cab_h - 2 * t
    int_d      = D - t
    dado_d     = min(9.0, t * 0.5)
    side_cut   = {**_dado_cut(dado_d, location="back_panel"), **_shelf_pin_cut()}

    parts = [
        _p("left_panel",  "left_panel",  D, cab_h, t,
           grain="vertical",   eb=_eb("top", "left"),
           cut=side_cut, group="carcass"),
        _p("right_panel", "right_panel", D, cab_h, t,
           grain="vertical",   eb=_eb("top", "right"),
           cut=side_cut, group="carcass"),
        _p("top_panel",    "top_panel",    int_w, D - t, t,
           grain="horizontal", eb=_eb("right"),
           cut=_dado_cut(dado_d, location="top_nailer"), group="carcass"),
        _p("bottom_panel", "bottom_panel", int_w, D - t, t,
           grain="horizontal", eb=_eb("right"),
           cut=_dado_cut(dado_d, location="bottom_nailer"), group="carcass"),
        _p("back_panel",   "back_panel",   int_w, int_h, 6.0,
           grain="vertical",
           cut=_dado_cut(dado_d, fits_into="left_panel,right_panel"), group="carcass"),
        _p("toe_kick",     "toe_kick",     int_w, toe_h, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
    ]

    for i in range(shelf_count):
        parts.append(_p(
            f"shelf_{i + 1}", "shelf", int_w - 1.0, int_d - dado_d, t,
            grain="horizontal", eb=_eb("right"),
            cut={"joinery": {"type": "shelf_pins", "pin_diameter_mm": 5}},
            group="shelf",
        ))

    drawer_h = 0.0
    if drawer_count > 0:
        drawer_h = min(cab_h * 0.4, drawer_count * 170.0)
        parts.extend(_drawer_bank(drawer_count, drawer_h, W, int_w, int_d, t, overlay))

    door_h_span = cab_h - drawer_h
    if door_count > 0:
        dw = W / door_count + overlay
        dh = door_h_span + overlay
        parts.append(_p(
            "door", "door", dw, dh, t, qty=door_count,
            grain="vertical", eb=_eb("top", "bottom", "left", "right"),
            cut=_hinge_cut(dh), group="door",
        ))

    if construction == "face_frame":
        parts.extend(_face_frame(W, cab_h, t_ff, stile_w, rail_w, door_count))

    return parts


def compute_wall_cabinet(req: CabinetGeometryRequest) -> list[PartDimensions]:
    """Wall-mounted cabinet — no toe kick, full-height panels."""
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    door_count   = int(p.get("doorCount",   2))
    shelf_count  = int(p.get("shelfCount",  1))
    overlay      = float(p.get("doorOverlay",         3.0))
    construction = p.get("constructionMethod", "frameless")
    stile_w      = float(p.get("stileWidth",         38.0))
    rail_w       = float(p.get("railWidth",          38.0))
    t_ff         = float(p.get("faceFrameThickness", 19.0))

    int_w  = W - 2 * t
    int_h  = H - 2 * t
    int_d  = D - t
    dado_d = min(9.0, t * 0.5)

    parts = [
        _p("left_panel",  "left_panel",  D, H, t,
           grain="vertical",   eb=_eb("top", "bottom", "left"),
           cut={**_dado_cut(dado_d, location="back_panel"), **_shelf_pin_cut()}, group="carcass"),
        _p("right_panel", "right_panel", D, H, t,
           grain="vertical",   eb=_eb("top", "bottom", "right"),
           cut={**_dado_cut(dado_d, location="back_panel"), **_shelf_pin_cut()}, group="carcass"),
        _p("top_panel",    "top_panel",    int_w, D - t, t,
           grain="horizontal", eb=_eb("top"), group="carcass"),
        _p("bottom_panel", "bottom_panel", int_w, D - t, t,
           grain="horizontal", eb=_eb("bottom", "right"), group="carcass"),
        _p("back_panel",   "back_panel",   int_w, int_h, 6.0,
           grain="vertical",
           cut=_dado_cut(dado_d, fits_into="left_panel,right_panel"), group="carcass"),
    ]

    for i in range(shelf_count):
        parts.append(_p(
            f"shelf_{i + 1}", "shelf", int_w - 1.0, int_d - dado_d, t,
            grain="horizontal", eb=_eb("right"),
            cut={"joinery": {"type": "shelf_pins", "pin_diameter_mm": 5}},
            group="shelf",
        ))

    if door_count > 0:
        dw = W / door_count + overlay
        dh = H + overlay
        parts.append(_p(
            "door", "door", dw, dh, t, qty=door_count,
            grain="vertical", eb=_eb("top", "bottom", "left", "right"),
            cut=_hinge_cut(dh), group="door",
        ))

    if construction == "face_frame":
        parts.extend(_face_frame(W, H, t_ff, stile_w, rail_w, door_count))

    return parts


def compute_tall_cabinet(req: CabinetGeometryRequest) -> list[PartDimensions]:
    """Pantry / oven-tower tall cabinet — optional drawer bank at bottom."""
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    door_count   = int(p.get("doorCount",   2))
    drawer_count = int(p.get("drawerCount", 2))
    shelf_count  = int(p.get("shelfCount",  4))
    toe_h        = float(p.get("toeKickHeight",      96.0))
    overlay      = float(p.get("doorOverlay",         3.0))
    construction = p.get("constructionMethod", "frameless")
    stile_w      = float(p.get("stileWidth",         38.0))
    rail_w       = float(p.get("railWidth",          38.0))
    t_ff         = float(p.get("faceFrameThickness", 19.0))

    cab_h  = H - toe_h
    int_w  = W - 2 * t
    int_h  = cab_h - 2 * t
    int_d  = D - t
    dado_d = min(9.0, t * 0.5)

    # Drawer section occupies lower 400 mm (or less if cabinet is short)
    drawer_section_h = min(400.0, cab_h * 0.25) if drawer_count > 0 else 0.0
    upper_door_h     = cab_h - drawer_section_h

    parts = [
        _p("left_panel",  "left_panel",  D, cab_h, t,
           grain="vertical",   eb=_eb("top", "left"),
           cut={**_dado_cut(dado_d, location="back_panel"), **_shelf_pin_cut()}, group="carcass"),
        _p("right_panel", "right_panel", D, cab_h, t,
           grain="vertical",   eb=_eb("top", "right"),
           cut={**_dado_cut(dado_d, location="back_panel"), **_shelf_pin_cut()}, group="carcass"),
        _p("top_panel",    "top_panel",    int_w, D - t, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        _p("bottom_panel", "bottom_panel", int_w, D - t, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        _p("back_panel",   "back_panel",   int_w, int_h, 6.0,
           grain="vertical",
           cut=_dado_cut(dado_d, fits_into="left_panel,right_panel"), group="carcass"),
        _p("toe_kick",     "toe_kick",     int_w, toe_h, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        # Mid rail separates drawer bank from upper doors
        *([_p("mid_rail", "mid_rail", int_w, t, t,
              grain="horizontal", eb=_eb("right"),
              cut=_dado_cut(dado_d, location="divider"), group="carcass")]
          if drawer_count > 0 else []),
    ]

    for i in range(shelf_count):
        parts.append(_p(
            f"shelf_{i + 1}", "shelf", int_w - 1.0, int_d - dado_d, t,
            grain="horizontal", eb=_eb("right"),
            cut={"joinery": {"type": "shelf_pins", "pin_diameter_mm": 5}},
            group="shelf",
        ))

    if drawer_count > 0:
        parts.extend(_drawer_bank(drawer_count, drawer_section_h, W, int_w, int_d, t, overlay))

    if door_count > 0 and upper_door_h > 0:
        dw = W / door_count + overlay
        dh = upper_door_h + overlay
        parts.append(_p(
            "door", "door", dw, dh, t, qty=door_count,
            grain="vertical", eb=_eb("top", "bottom", "left", "right"),
            cut=_hinge_cut(dh), group="door",
        ))

    if construction == "face_frame":
        parts.extend(_face_frame(W, cab_h, t_ff, stile_w, rail_w, door_count))

    return parts


def compute_corner_cabinet(req: CabinetGeometryRequest) -> list[PartDimensions]:
    """Blind-corner base cabinet — one side blind, opposite side full access."""
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    toe_h   = float(p.get("toeKickHeight", 96.0))
    overlay = float(p.get("doorOverlay",    3.0))
    # Blind panel width: portion of cabinet hidden inside the corner
    blind_w = float(p.get("blindPanelWidth", W * 0.4))

    cab_h  = H - toe_h
    int_w  = W - 2 * t
    int_h  = cab_h - 2 * t
    int_d  = D - t
    dado_d = min(9.0, t * 0.5)

    parts = [
        _p("left_panel",  "left_panel",  D,      cab_h, t,
           grain="vertical", eb=_eb("top", "left"),
           cut={**_dado_cut(dado_d, location="back_panel"), **_shelf_pin_cut()}, group="carcass"),
        _p("right_panel", "right_panel", D,      cab_h, t,
           grain="vertical", eb=_eb("top", "right"),
           cut={**_dado_cut(dado_d, location="back_panel"), **_shelf_pin_cut()}, group="carcass"),
        _p("top_panel",    "top_panel",    int_w, D - t, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        _p("bottom_panel", "bottom_panel", int_w, D - t, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        _p("back_panel",   "back_panel",   int_w, int_h, 6.0,
           grain="vertical",
           cut=_dado_cut(dado_d, fits_into="left_panel,right_panel"), group="carcass"),
        _p("toe_kick",     "toe_kick",     int_w, toe_h, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        # Blind panel covers the hidden portion
        _p("blind_panel",  "filler",       blind_w, cab_h, t,
           grain="vertical", eb=_eb("top", "left", "right"), group="carcass"),
        # Fixed shelf at mid-height for structural support
        _p("fixed_shelf",  "shelf",        int_w - 1.0, int_d - dado_d, t,
           grain="horizontal", eb=_eb("right"), group="shelf"),
    ]

    # Single door on the accessible face
    dw = (W - blind_w) + overlay
    dh = cab_h + overlay
    parts.append(_p(
        "door", "door", dw, dh, t,
        grain="vertical", eb=_eb("top", "bottom", "left", "right"),
        cut=_hinge_cut(dh), group="door",
    ))

    return parts


def compute_drawer_base_cabinet(req: CabinetGeometryRequest) -> list[PartDimensions]:
    """All-drawer base cabinet — equal-height drawer stack, no doors."""
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    drawer_count = int(p.get("drawerCount", 3))
    toe_h        = float(p.get("toeKickHeight", 96.0))
    overlay      = float(p.get("doorOverlay",    3.0))

    cab_h  = H - toe_h
    int_w  = W - 2 * t
    int_h  = cab_h - 2 * t
    int_d  = D - t
    dado_d = min(9.0, t * 0.5)

    parts = [
        _p("left_panel",  "left_panel",  D, cab_h, t,
           grain="vertical", eb=_eb("top", "left"),
           cut=_dado_cut(dado_d, location="back_panel"), group="carcass"),
        _p("right_panel", "right_panel", D, cab_h, t,
           grain="vertical", eb=_eb("top", "right"),
           cut=_dado_cut(dado_d, location="back_panel"), group="carcass"),
        _p("top_panel",    "top_panel",    int_w, D - t, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        _p("bottom_panel", "bottom_panel", int_w, D - t, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        _p("back_panel",   "back_panel",   int_w, int_h, 6.0,
           grain="vertical",
           cut=_dado_cut(dado_d, fits_into="left_panel,right_panel"), group="carcass"),
        _p("toe_kick",     "toe_kick",     int_w, toe_h, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
    ]

    # Horizontal drawer dividers between each drawer opening
    if drawer_count > 1:
        for i in range(drawer_count - 1):
            parts.append(_p(
                f"drawer_divider_{i + 1}", "mid_rail", int_w, t, t,
                grain="horizontal", eb=_eb("right"),
                cut=_dado_cut(dado_d, location="divider"), group="carcass",
            ))

    parts.extend(_drawer_bank(drawer_count, cab_h, W, int_w, int_d, t, overlay))
    return parts


def compute_sink_base_cabinet(req: CabinetGeometryRequest) -> list[PartDimensions]:
    """Sink base — open interior (no shelves), face frame optional, 2 doors."""
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    door_count   = int(p.get("doorCount",   2))
    toe_h        = float(p.get("toeKickHeight",      96.0))
    overlay      = float(p.get("doorOverlay",         3.0))
    construction = p.get("constructionMethod", "frameless")
    stile_w      = float(p.get("stileWidth",         38.0))
    rail_w       = float(p.get("railWidth",          38.0))
    t_ff         = float(p.get("faceFrameThickness", 19.0))

    cab_h  = H - toe_h
    int_w  = W - 2 * t
    int_h  = cab_h - 2 * t
    int_d  = D - t
    dado_d = min(9.0, t * 0.5)

    # No bottom panel (plumbing access), no shelves, front/back stretchers instead
    parts = [
        _p("left_panel",  "left_panel",  D, cab_h, t,
           grain="vertical", eb=_eb("top", "left"),
           cut=_dado_cut(dado_d, location="back_panel"), group="carcass"),
        _p("right_panel", "right_panel", D, cab_h, t,
           grain="vertical", eb=_eb("top", "right"),
           cut=_dado_cut(dado_d, location="back_panel"), group="carcass"),
        _p("top_panel",    "top_panel",    int_w, D - t, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        _p("back_panel",   "back_panel",   int_w, int_h, 6.0,
           grain="vertical",
           cut=_dado_cut(dado_d, fits_into="left_panel,right_panel"), group="carcass"),
        _p("toe_kick",     "toe_kick",     int_w, toe_h, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        # Front stretcher at floor level (structural, behind doors)
        _p("front_stretcher", "mid_rail", int_w, 89.0, t,
           grain="horizontal", eb=_eb("right"), group="carcass"),
        # Rear stretcher at floor level
        _p("rear_stretcher", "mid_rail",  int_w, 89.0, t,
           grain="horizontal", group="carcass"),
    ]

    if door_count > 0:
        dw = W / door_count + overlay
        dh = cab_h + overlay
        parts.append(_p(
            "door", "door", dw, dh, t, qty=door_count,
            grain="vertical", eb=_eb("top", "bottom", "left", "right"),
            cut=_hinge_cut(dh), group="door",
        ))

    if construction == "face_frame":
        parts.extend(_face_frame(W, cab_h, t_ff, stile_w, rail_w, door_count))

    return parts


def compute_island_cabinet(req: CabinetGeometryRequest) -> list[PartDimensions]:
    """Freestanding island — toe kicks on all 4 sides, doors on both faces."""
    t  = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    p  = req.parameters

    door_count   = int(p.get("doorCount",   2))
    drawer_count = int(p.get("drawerCount", 0))
    shelf_count  = int(p.get("shelfCount",  1))
    toe_h        = float(p.get("toeKickHeight", 96.0))
    overlay      = float(p.get("doorOverlay",    3.0))

    cab_h  = H - toe_h
    int_w  = W - 2 * t
    int_d  = D - 2 * t   # panels on both front and back
    dado_d = min(9.0, t * 0.5)

    parts = [
        _p("left_panel",  "left_panel",  D, cab_h, t,
           grain="vertical", eb=_eb("top", "left", "right"),
           cut={**_dado_cut(dado_d, location="internal"), **_shelf_pin_cut()}, group="carcass"),
        _p("right_panel", "right_panel", D, cab_h, t,
           grain="vertical", eb=_eb("top", "left", "right"),
           cut={**_dado_cut(dado_d, location="internal"), **_shelf_pin_cut()}, group="carcass"),
        _p("top_panel",    "top_panel",    int_w, int_d, t,
           grain="horizontal", eb=_eb("left", "right"), group="carcass"),
        _p("bottom_panel", "bottom_panel", int_w, int_d, t,
           grain="horizontal", group="carcass"),
        # Toe kicks on all four faces
        _p("toe_kick_front", "toe_kick", int_w,        toe_h, t, grain="horizontal", eb=_eb("right"), group="carcass"),
        _p("toe_kick_back",  "toe_kick", int_w,        toe_h, t, grain="horizontal", eb=_eb("right"), group="carcass"),
        _p("toe_kick_left",  "toe_kick", int_d - 2*t,  toe_h, t, grain="horizontal", group="carcass"),
        _p("toe_kick_right", "toe_kick", int_d - 2*t,  toe_h, t, grain="horizontal", group="carcass"),
    ]

    for i in range(shelf_count):
        parts.append(_p(
            f"shelf_{i + 1}", "shelf", int_w - 1.0, int_d - 1.0, t,
            grain="horizontal", eb=_eb("left", "right"),
            cut={"joinery": {"type": "shelf_pins", "pin_diameter_mm": 5}},
            group="shelf",
        ))

    drawer_h = 0.0
    if drawer_count > 0:
        drawer_h = min(cab_h * 0.4, drawer_count * 170.0)
        parts.extend(_drawer_bank(drawer_count, drawer_h, W, int_w, int_d, t, overlay))

    door_span = cab_h - drawer_h
    if door_count > 0:
        dw = W / door_count + overlay
        dh = door_span + overlay
        parts.append(_p(
            "door", "door", dw, dh, t, qty=door_count,
            grain="vertical", eb=_eb("top", "bottom", "left", "right"),
            cut=_hinge_cut(dh), group="door",
        ))

    return parts


# ─── Registry ──────────────────────────────────────────────────────────────────

CABINET_BUILDERS = {
    "base":         compute_base_cabinet,
    "wall":         compute_wall_cabinet,
    "tall":         compute_tall_cabinet,
    "corner":       compute_corner_cabinet,
    "drawer_base":  compute_drawer_base_cabinet,
    "sink_base":    compute_sink_base_cabinet,
    "island":       compute_island_cabinet,
}


def compute_parts(req: CabinetGeometryRequest) -> list[PartDimensions]:
    builder = CABINET_BUILDERS.get(req.type)
    if builder is None:
        supported = list(CABINET_BUILDERS.keys())
        raise ValueError(f"No 3D geometry builder for cabinet type '{req.type}'. Supported types: {supported}")
    return builder(req)
