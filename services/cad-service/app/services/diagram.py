"""SVG diagram generator for nesting sheet layouts."""
import colorsys
from .nesting import NestingResult

_SHEET_GAP = 40   # px between sheets
_LABEL_H = 22     # px above each sheet for title
_LEGEND_H = 18    # px below all sheets for summary line
_SCALE = 0.25     # mm → px  (1220 mm → 305 px, 2440 mm → 610 px)


def _hex(hue: float) -> str:
    r, g, b = colorsys.hls_to_rgb(hue % 1.0, 0.45, 0.65)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def generate_svg(result: NestingResult, scale: float = _SCALE) -> str:
    if not result.sheets:
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"'
            ' style="background:#0d1117">'
            '<text x="12" y="36" font-family="monospace" font-size="13" fill="#888">'
            "No parts to nest</text></svg>"
        )

    sw = result.sheets[0].width * scale
    sh = result.sheets[0].height * scale
    n = len(result.sheets)

    total_w = n * sw + (n - 1) * _SHEET_GAP
    total_h = _LABEL_H + sh + _LEGEND_H

    # Stable color per unique part name via golden-ratio hue spacing
    seen: list[str] = []
    for s in result.sheets:
        for p in s.placements:
            if p.part_name not in seen:
                seen.append(p.part_name)
    colors: dict[str, str] = {name: _hex(i * 0.618033988749895) for i, name in enumerate(seen)}

    out: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg"'
        f' width="{total_w:.0f}" height="{total_h:.0f}"'
        f' style="background:#0d1117;font-family:monospace">',
        "<defs><style>",
        ".st{font-size:10px;fill:#888}",
        ".lb{font-size:8px;fill:rgba(255,255,255,.85);pointer-events:none}",
        ".lg{font-size:9px;fill:#555}",
        "</style></defs>",
    ]

    for idx, sheet in enumerate(result.sheets):
        ox = idx * (sw + _SHEET_GAP)
        oy = _LABEL_H

        out.append(
            f'<rect x="{ox:.1f}" y="{oy:.1f}" width="{sw:.1f}" height="{sh:.1f}"'
            f' fill="#161b22" stroke="#30363d" stroke-width="1.5"/>'
        )
        out.append(
            f'<text x="{ox:.1f}" y="{_LABEL_H - 4:.0f}" class="st">'
            f"Sheet {idx + 1}  {sheet.width:.0f}×{sheet.height:.0f} mm"
            f"  —  {sheet.efficiency * 100:.0f}% used</text>"
        )

        for p in sheet.placements:
            px = ox + p.x * scale
            py = oy + p.y * scale
            pw = p.width * scale
            ph = p.height * scale
            fill = colors.get(p.part_name, "#444")
            rot_note = " ↺" if p.rotated else ""

            out.append(
                f'<g><rect x="{px:.1f}" y="{py:.1f}" width="{pw:.1f}" height="{ph:.1f}"'
                f' fill="{fill}" fill-opacity=".75"'
                f' stroke="rgba(255,255,255,.2)" stroke-width=".5"/>'
                f"<title>{p.part_name}{rot_note} — {p.width:.0f}×{p.height:.0f} mm</title>"
            )
            if pw >= 24 and ph >= 12:
                label = p.part_name[:11] + ("…" if len(p.part_name) > 11 else "")
                out.append(
                    f'<text x="{px + pw / 2:.1f}" y="{py + ph / 2:.1f}"'
                    f' text-anchor="middle" dominant-baseline="middle"'
                    f' class="lb">{label}</text>'
                )
            out.append("</g>")

    placed = result.total_parts - len(result.unplaced)
    warn = f"  ·  ⚠ {len(result.unplaced)} unplaced" if result.unplaced else ""
    out.append(
        f'<text x="4" y="{total_h - 3:.0f}" class="lg">'
        f"{n} sheet(s)  ·  {placed}/{result.total_parts} parts"
        f"  ·  {result.overall_efficiency * 100:.1f}% overall{warn}</text>"
    )
    out.append("</svg>")
    return "\n".join(out)
