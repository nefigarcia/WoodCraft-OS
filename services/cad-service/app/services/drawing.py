"""
2D shop drawings via OpenCascade Hidden Line Removal.

Three views are generated (front elevation, side elevation, plan) using
HLRBRep_PolyAlgo on the meshed cabinet compound and exported as a single SVG sheet.

Coordinate system used throughout:
  X = cabinet width (left → right)
  Y = cabinet height (bottom → top)
  Z = cabinet depth (front face at Z=0, back at Z=D)

HLR projector gp_Ax2(origin, N, X_dir):
  N = direction from scene origin toward the viewer (not the viewing direction)
  Projected Y in the plane = N × X_dir (right-hand rule)

View table
  FRONT  N=(0,0,-1) X=(1,0,0)  → proj_y=world −Y  → flip_y=True
  SIDE   N=(1,0,0)  X=(0,0,1)  → proj_y=world −Y  → flip_y=True
  TOP    N=(0,1,0)  X=(1,0,0)  → proj_y=world −Z  → flip_y=False
                                   (front of cab normalises to SVG bottom)
"""
from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh
from OCC.Core.HLRBRep import HLRBRep_PolyAlgo, HLRBRep_PolyHLRToShape
from OCC.Core.HLRAlgo import HLRAlgo_Projector
from OCC.Core.gp import gp_Ax2, gp_Pnt, gp_Dir
from OCC.Core.BRepAdaptor import BRepAdaptor_Curve
from OCC.Core.TopExp import TopExp_Explorer
from OCC.Core.TopAbs import TopAbs_EDGE
from OCC.Core.TopoDS import topods

from app.models.cabinet import CabinetGeometryRequest
from app.services.geometry import build_cabinet_shape

# (gp_Ax2, flip_y)
_VIEW_AXES: dict[str, tuple] = {
    "FRONT": (gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, -1), gp_Dir(1, 0, 0)), True),
    "SIDE":  (gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0),  gp_Dir(0, 0, 1)), True),
    "TOP":   (gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 1, 0),  gp_Dir(1, 0, 0)), False),
}


def _project(shape, axis: gp_Ax2) -> list[tuple[float, float, float, float]]:
    """Mesh shape and run HLR; return visible edge segments as (x1,y1,x2,y2)."""
    BRepMesh_IncrementalMesh(shape, 0.5)

    hlr = HLRBRep_PolyAlgo()
    hlr.Load(shape)
    hlr.Projector(HLRAlgo_Projector(axis))
    hlr.Update()

    ext = HLRBRep_PolyHLRToShape()
    ext.Update(hlr)

    visible = ext.VCompound()
    segs: list[tuple[float, float, float, float]] = []
    if visible.IsNull():
        return segs

    exp = TopExp_Explorer(visible, TopAbs_EDGE)
    while exp.More():
        edge = topods.Edge(exp.Current())
        c = BRepAdaptor_Curve(edge)
        p1 = c.Value(c.FirstParameter())
        p2 = c.Value(c.LastParameter())
        segs.append((p1.X(), p1.Y(), p2.X(), p2.Y()))
        exp.Next()

    return segs


def _normalise(
    segs: list[tuple], flip_y: bool
) -> tuple[list[tuple], float, float]:
    """Translate bounding-box to origin; optionally flip Y for SVG coords."""
    if not segs:
        return [], 1.0, 1.0

    all_x = [v for s in segs for v in (s[0], s[2])]
    all_y = [v for s in segs for v in (s[1], s[3])]
    ox, oy = min(all_x), min(all_y)
    vw = max(all_x) - ox or 1.0
    vh = max(all_y) - oy or 1.0

    out = [(x1 - ox, y1 - oy, x2 - ox, y2 - oy) for x1, y1, x2, y2 in segs]
    if flip_y:
        out = [(x1, vh - y1, x2, vh - y2) for x1, y1, x2, y2 in out]
    return out, vw, vh


def _svg_lines(segs: list[tuple], flip_y: bool) -> tuple[str, float, float]:
    norm, vw, vh = _normalise(segs, flip_y)
    parts = [
        f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}"/>'
        for x1, y1, x2, y2 in norm
    ]
    return "\n      ".join(parts), vw, vh


# ─── SVG annotation helpers ───────────────────────────────────────────────────

def _hdim(x1: float, x2: float, y: float, label: str, fs: int) -> str:
    mx = (x1 + x2) / 2
    return (
        f'<line x1="{x1:.1f}" y1="{y:.1f}" x2="{x2:.1f}" y2="{y:.1f}" '
        f'stroke="#999" stroke-width="0.4" stroke-dasharray="4,3"/>'
        f'<line x1="{x1:.1f}" y1="{y-5:.1f}" x2="{x1:.1f}" y2="{y+5:.1f}" stroke="#999" stroke-width="0.5"/>'
        f'<line x1="{x2:.1f}" y1="{y-5:.1f}" x2="{x2:.1f}" y2="{y+5:.1f}" stroke="#999" stroke-width="0.5"/>'
        f'<text x="{mx:.1f}" y="{y - 5:.1f}" text-anchor="middle" '
        f'font-size="{fs}" fill="#777">{label}</text>'
    )


def _vdim(x: float, y1: float, y2: float, label: str, fs: int) -> str:
    my = (y1 + y2) / 2
    rx = x - 4
    return (
        f'<line x1="{x:.1f}" y1="{y1:.1f}" x2="{x:.1f}" y2="{y2:.1f}" '
        f'stroke="#999" stroke-width="0.4" stroke-dasharray="4,3"/>'
        f'<line x1="{x-5:.1f}" y1="{y1:.1f}" x2="{x+5:.1f}" y2="{y1:.1f}" stroke="#999" stroke-width="0.5"/>'
        f'<line x1="{x-5:.1f}" y1="{y2:.1f}" x2="{x+5:.1f}" y2="{y2:.1f}" stroke="#999" stroke-width="0.5"/>'
        f'<text x="{rx:.1f}" y="{my:.1f}" text-anchor="middle" '
        f'font-size="{fs}" fill="#777" transform="rotate(-90,{rx:.1f},{my:.1f})">{label}</text>'
    )


# ─── Public entry point ───────────────────────────────────────────────────────

def build_shop_drawing_svg(req: CabinetGeometryRequest) -> bytes:
    """
    Generate a 3-view shop drawing SVG (front elevation / side elevation / plan).
    SVG units are mm; 1 SVG unit = 1 mm.
    """
    shape = build_cabinet_shape(req)
    W, H, D = req.width, req.height, req.depth

    front_svg, fw, fh = _svg_lines(_project(shape, _VIEW_AXES["FRONT"][0]), _VIEW_AXES["FRONT"][1])
    side_svg,  sw, sh = _svg_lines(_project(shape, _VIEW_AXES["SIDE"][0]),  _VIEW_AXES["SIDE"][1])
    top_svg,   tw, th = _svg_lines(_project(shape, _VIEW_AXES["TOP"][0]),   _VIEW_AXES["TOP"][1])

    MARGIN = 25
    GAP    = 35
    DIM    = 18   # dimension-line offset from view edge (mm)
    FS     = 9    # annotation font size (mm / SVG px — same at 1:1)

    # Sheet layout: [FRONT | SIDE] on row 1, [TOP] on row 2
    left_col_w = max(fw, tw)
    total_w = MARGIN * 2 + DIM * 2 + FS * 5 + left_col_w + GAP + sw
    total_h = MARGIN * 2 + DIM * 2 + FS * 3 + max(fh, sh) + GAP + th

    # View origins
    vx = MARGIN + DIM + FS * 4   # shared left edge for front & top
    vy = MARGIN + DIM             # top edge of row 1
    sx = vx + left_col_w + GAP   # side view left
    ty = vy + max(fh, sh) + GAP  # top view top edge

    ann = "\n  ".join([
        _hdim(vx,      vx + fw, vy - DIM / 2,       f"{W:.0f}", FS),
        _vdim(vx - DIM, vy,     vy + fh,             f"{H:.0f}", FS),
        _hdim(sx,      sx + sw, vy - DIM / 2,       f"{D:.0f}", FS),
        _hdim(vx,      vx + tw, ty + th + DIM / 2,  f"{W:.0f}", FS),
        _vdim(vx - DIM, ty,     ty + th,             f"{D:.0f}", FS),
    ])

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="{total_w:.1f}mm" height="{total_h:.1f}mm"
     viewBox="0 0 {total_w:.1f} {total_h:.1f}">
  <style>
    line  {{ stroke: #111; stroke-width: 0.6; fill: none; }}
    text  {{ font-family: monospace; fill: #222; }}
    .lbl  {{ font-size: {FS}px; fill: #555; }}
    .ttl  {{ font-size: {FS + 2}px; font-weight: bold; fill: #111; }}
  </style>

  <rect width="{total_w:.1f}" height="{total_h:.1f}" fill="#fff" stroke="none"/>
  <rect x="{MARGIN/2:.1f}" y="{MARGIN/2:.1f}"
        width="{total_w - MARGIN:.1f}" height="{total_h - MARGIN:.1f}"
        fill="none" stroke="#ccc" stroke-width="0.5"/>

  <!-- FRONT ELEVATION -->
  <g transform="translate({vx:.1f},{vy:.1f})">
    {front_svg}
  </g>
  <text class="lbl" x="{vx + fw/2:.1f}" y="{vy + fh + 13:.1f}" text-anchor="middle">FRONT ELEVATION</text>

  <!-- SIDE ELEVATION -->
  <g transform="translate({sx:.1f},{vy:.1f})">
    {side_svg}
  </g>
  <text class="lbl" x="{sx + sw/2:.1f}" y="{vy + sh + 13:.1f}" text-anchor="middle">SIDE ELEVATION</text>

  <!-- PLAN VIEW -->
  <g transform="translate({vx:.1f},{ty:.1f})">
    {top_svg}
  </g>
  <text class="lbl" x="{vx + tw/2:.1f}" y="{ty + th + 13:.1f}" text-anchor="middle">PLAN VIEW</text>

  <!-- Dimension annotations -->
  {ann}

  <!-- Title block -->
  <line x1="{MARGIN/2:.1f}" y1="{total_h - MARGIN * 1.9:.1f}"
        x2="{total_w - MARGIN/2:.1f}" y2="{total_h - MARGIN * 1.9:.1f}"
        stroke="#bbb" stroke-width="0.4"/>
  <text class="ttl" x="{MARGIN:.1f}" y="{total_h - MARGIN * 0.7:.1f}">
    {req.type.upper()} CABINET &#8212; {W:.0f}W &#215; {H:.0f}H &#215; {D:.0f}D mm
  </text>
  <text x="{total_w - MARGIN:.1f}" y="{total_h - MARGIN * 0.7:.1f}"
        text-anchor="end" font-size="{FS - 1}px" fill="#aaa">WoodCraft OS</text>
</svg>""".encode("utf-8")
