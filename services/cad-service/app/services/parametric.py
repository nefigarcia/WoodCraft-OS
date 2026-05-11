"""
Parametric cabinet engine.
Computes all part dimensions from cabinet-level parameters using constraint propagation.
When a dimension changes, all dependent parts (doors, panels, shelves) are recomputed.
"""

from app.models.cabinet import CabinetGeometryRequest, PartDimensions


def compute_base_cabinet(req: CabinetGeometryRequest) -> list[PartDimensions]:
    """Standard base cabinet with frameless construction."""
    t = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    params = req.parameters

    door_count: int = params.get("doorCount", 2)
    drawer_count: int = params.get("drawerCount", 0)
    shelf_count: int = params.get("shelfCount", 1)
    toe_kick_height: float = params.get("toeKickHeight", 96.0)
    door_overlay: float = params.get("doorOverlay", 3.0)

    # Interior dimensions
    interior_W = W - (2 * t)
    interior_H = H - toe_kick_height - (2 * t)
    interior_D = D - t  # back panel accounts for remaining depth

    parts: list[PartDimensions] = [
        PartDimensions(
            name="left_panel",
            part_type="left_panel",
            width=D,
            height=H - toe_kick_height,
            thickness=t,
            edge_banding={"top": True, "bottom": False, "left": True, "right": False},
        ),
        PartDimensions(
            name="right_panel",
            part_type="right_panel",
            width=D,
            height=H - toe_kick_height,
            thickness=t,
            edge_banding={"top": True, "bottom": False, "left": True, "right": False},
        ),
        PartDimensions(
            name="top_panel",
            part_type="top_panel",
            width=interior_W,
            height=D - t,
            thickness=t,
            edge_banding={"top": False, "bottom": False, "left": False, "right": True},
        ),
        PartDimensions(
            name="bottom_panel",
            part_type="bottom_panel",
            width=interior_W,
            height=D - t,
            thickness=t,
            edge_banding={"top": False, "bottom": False, "left": False, "right": True},
        ),
        PartDimensions(
            name="back_panel",
            part_type="back_panel",
            width=interior_W,
            height=interior_H,
            thickness=6.0,  # typically 6mm HDF back
        ),
        PartDimensions(
            name="toe_kick",
            part_type="toe_kick",
            width=interior_W,
            height=toe_kick_height,
            thickness=t,
        ),
    ]

    # Shelves
    for i in range(shelf_count):
        parts.append(
            PartDimensions(
                name=f"shelf_{i + 1}",
                part_type="shelf",
                width=interior_W - 1.0,  # 0.5mm clearance each side
                height=interior_D,
                thickness=t,
                edge_banding={"top": False, "bottom": False, "left": False, "right": True},
            )
        )

    # Doors
    if door_count > 0:
        door_W = (W / door_count) + door_overlay
        door_H = H - toe_kick_height + door_overlay
        parts.append(
            PartDimensions(
                name="door",
                part_type="door",
                width=door_W,
                height=door_H,
                thickness=t,
                quantity=door_count,
                edge_banding={"top": True, "bottom": True, "left": True, "right": True},
            )
        )

    return parts


def compute_wall_cabinet(req: CabinetGeometryRequest) -> list[PartDimensions]:
    t = req.material_thickness
    W, H, D = req.width, req.height, req.depth
    params = req.parameters

    door_count: int = params.get("doorCount", 2)
    shelf_count: int = params.get("shelfCount", 1)
    door_overlay: float = params.get("doorOverlay", 3.0)

    interior_W = W - (2 * t)
    interior_H = H - (2 * t)
    interior_D = D - t

    parts: list[PartDimensions] = [
        PartDimensions(name="left_panel", part_type="left_panel", width=D, height=H, thickness=t),
        PartDimensions(name="right_panel", part_type="right_panel", width=D, height=H, thickness=t),
        PartDimensions(name="top_panel", part_type="top_panel", width=interior_W, height=D - t, thickness=t),
        PartDimensions(name="bottom_panel", part_type="bottom_panel", width=interior_W, height=D - t, thickness=t),
        PartDimensions(name="back_panel", part_type="back_panel", width=interior_W, height=interior_H, thickness=6.0),
    ]

    for i in range(shelf_count):
        parts.append(
            PartDimensions(
                name=f"shelf_{i + 1}", part_type="shelf",
                width=interior_W - 1.0, height=interior_D, thickness=t,
            )
        )

    if door_count > 0:
        door_W = (W / door_count) + door_overlay
        door_H = H + door_overlay
        parts.append(
            PartDimensions(
                name="door", part_type="door",
                width=door_W, height=door_H, thickness=t,
                quantity=door_count,
                edge_banding={"top": True, "bottom": True, "left": True, "right": True},
            )
        )

    return parts


CABINET_BUILDERS = {
    "base": compute_base_cabinet,
    "wall": compute_wall_cabinet,
}


def compute_parts(req: CabinetGeometryRequest) -> list[PartDimensions]:
    builder = CABINET_BUILDERS.get(req.type)
    if builder is None:
        raise ValueError(f"Unknown cabinet type: {req.type!r}")
    return builder(req)
