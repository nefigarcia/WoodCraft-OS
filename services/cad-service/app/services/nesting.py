"""MAXRECTS 2D bin-packing for sheet nesting."""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class NestingPart:
    id: str
    name: str
    width: float
    height: float
    quantity: int = 1
    rotatable: bool = True


@dataclass
class Placement:
    part_id: str
    part_name: str
    x: float
    y: float
    width: float
    height: float
    rotated: bool
    sheet_index: int


@dataclass
class NestingSheet:
    index: int
    width: float
    height: float
    placements: list[Placement] = field(default_factory=list)

    @property
    def used_area(self) -> float:
        return sum(p.width * p.height for p in self.placements)

    @property
    def total_area(self) -> float:
        return self.width * self.height

    @property
    def efficiency(self) -> float:
        return self.used_area / self.total_area if self.total_area else 0.0


@dataclass
class NestingResult:
    sheets: list[NestingSheet]
    unplaced: list[str]
    total_parts: int

    @property
    def total_sheets(self) -> int:
        return len(self.sheets)

    @property
    def overall_efficiency(self) -> float:
        if not self.sheets:
            return 0.0
        used = sum(s.used_area for s in self.sheets)
        total = sum(s.total_area for s in self.sheets)
        return used / total if total else 0.0


def compute_nesting(
    parts: list[NestingPart],
    sheet_width: float = 1220.0,
    sheet_height: float = 2440.0,
    kerf: float = 3.2,
) -> NestingResult:
    from rectpack import newPacker, MaxRectsBssf, PackingMode, PackingBin, SORT_AREA

    # Expand quantities into individual rects; track original dims by uid
    expanded: list[tuple[str, str, float, float]] = []  # (uid, name, orig_w, orig_h)
    for part in parts:
        for i in range(max(part.quantity, 1)):
            uid = f"{part.id}__{i}" if part.quantity > 1 else part.id
            expanded.append((uid, part.name, part.width, part.height))

    if not expanded:
        return NestingResult(sheets=[], unplaced=[], total_parts=0)

    meta: dict[str, tuple[float, float, str]] = {
        uid: (ow, oh, name) for uid, name, ow, oh in expanded
    }

    packer = newPacker(
        mode=PackingMode.Offline,
        bin_algo=PackingBin.BBF,
        pack_algo=MaxRectsBssf,
        sort_algo=SORT_AREA,
        rotation=True,
    )
    packer.add_bin(sheet_width, sheet_height, count=len(expanded))

    for uid, _name, w, h in expanded:
        packer.add_rect(w + kerf, h + kerf, rid=uid)

    packer.pack()

    sheet_map: dict[int, NestingSheet] = {}
    placed_ids: set[str] = set()

    for b, x, y, w, h, rid in packer.rect_list():
        orig_w, orig_h, name = meta[rid]
        rotated = abs(w - (orig_w + kerf)) > 0.5

        if b not in sheet_map:
            sheet_map[b] = NestingSheet(index=b, width=sheet_width, height=sheet_height)

        sheet_map[b].placements.append(Placement(
            part_id=rid,
            part_name=name,
            x=x,
            y=y,
            width=w - kerf,
            height=h - kerf,
            rotated=rotated,
            sheet_index=b,
        ))
        placed_ids.add(rid)

    all_ids = {uid for uid, *_ in expanded}
    unplaced = list(all_ids - placed_ids)
    sheets = [sheet_map[i] for i in sorted(sheet_map)]

    return NestingResult(sheets=sheets, unplaced=unplaced, total_parts=len(expanded))
