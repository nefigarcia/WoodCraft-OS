import { NextRequest } from "next/server";
import OpenAI from "openai";

import { getContext } from "@/lib/context";
import { apiError, ok } from "@/lib/errors";
import { compileGeometry, type CompiledGeometry } from "@woodcraft/shared";

type CabinetType = "base" | "wall" | "tall" | "corner" | "drawer_base" | "sink_base" | "island";

interface AICabinetSpec {
  name: string;
  type: CabinetType;
  width: number;
  height: number;
  depth: number;
  posX: number;
  posY: number;
  posZ: number;
  wallSide: "back" | "left" | "right" | "island" | "none";
  parameters: {
    role?: "cabinet" | "opening" | "led_strip" | "open_shelf";
    columns?: number;
    rows?: number;
    doorCount?: number;
    drawerCount?: number;
    shelfCount?: number;
    toeKickHeight?: number;
    constructionMethod?: string;
    hingeType?: string;
    finishStyle?: string;
  };
  notes: string;
}

interface TvZone {
  widthMm: number;
  heightMm: number;
  posX: number;
  posY: number;
}

// ── Server-side validation & normalization ───────────────────────────────────
// The CabinetSpec is the single source of truth: both the image prompt and
// the 3D/DXF geometry read from the SAME validated list. This function turns
// the raw AI output into that canonical list.

const PHANTOM_TV_RE = /\b(tv|television|screen)[\s-]+(opening|recess|niche|cavity|void|cutout|cutting|hole)\b/i;

function isPhantomTvUnit(cab: AICabinetSpec): boolean {
  return PHANTOM_TV_RE.test(`${cab.name} ${cab.notes ?? ""}`);
}

function isGlassUnit(cab: AICabinetSpec): boolean {
  const hint = `${cab.name} ${cab.notes ?? ""}`.toLowerCase();
  return (
    cab.parameters.finishStyle === "glass" ||
    hint.includes("fish tank") ||
    hint.includes("aquarium")
  );
}

// Heuristic to catch open-display units the AI labels as `role: "cabinet"`.
// Strong shelf language wins UNLESS the AI explicitly said "doors/drawers/glass"
// somewhere in the name/notes — then we trust the AI's closed-cabinet intent.
// This lets us fix "Display Shelf" that accidentally got doorCount=2, while still
// preserving "Bookcase with glass doors" as a legitimately closed unit.
function looksLikeOpenShelf(cab: AICabinetSpec): boolean {
  // Never repair sibling roles into open_shelf. LED strips especially get
  // caught by the "led shelf" trigger below — they must keep their own role.
  if (cab.parameters.role === "led_strip") return false;
  if (cab.parameters.role === "opening")   return false;
  if (cab.parameters.role === "open_shelf") return true;

  const text = `${cab.name ?? ""} ${cab.notes ?? ""}`.toLowerCase();

  const hasStrongShelfLanguage =
    text.includes("open shelf")        ||
    text.includes("open shelves")      ||
    text.includes("display shelf")     ||
    text.includes("display shelves")   ||
    text.includes("open display")      ||
    text.includes("cubby")             ||
    text.includes("cubbies")           ||
    text.includes("bookcase")          ||
    text.includes("bookcase bay")      ||
    text.includes("led-backlit shelf") ||
    text.includes("led shelf")         ||
    text.includes("led shelves")       ||
    text.includes("open shelving");
  if (!hasStrongShelfLanguage) return false;

  // Narrow safeguard — bail out ONLY when the AI both set explicit front counts
  // AND explicitly said "doors / drawers / glass" in the name/notes.
  const explicitlyDoored =
    ((cab.parameters.doorCount   ?? 0) > 0 || (cab.parameters.drawerCount ?? 0) > 0) &&
    /\b(doors?|drawers?|glass)\b/.test(text);
  if (explicitlyDoored) return false;

  const hasStrongClosedLanguage =
    text.includes("pantry")             ||
    text.includes("wardrobe")           ||
    text.includes("appliance garage")   ||
    text.includes("closed tall cabinet");
  if (hasStrongClosedLanguage) return false;

  return true;
}

// Denser default grid — 900 mm shelf now → 3 columns × 3 rows instead of 1×3.
// Matches what a real display wall looks like (visible dividers, not one big box).
function defaultColumns(widthMm: number): number {
  if (widthMm > 1200) return 4;
  if (widthMm > 800)  return 3;
  if (widthMm > 450)  return 2;
  return 1;
}
function defaultRows(heightMm: number): number {
  if (heightMm > 1200) return 4;
  if (heightMm > 700)  return 3;
  if (heightMm > 350)  return 2;
  return 1;
}

function repairDisplayShelfRole(cab: AICabinetSpec): AICabinetSpec {
  // Belt-and-suspenders: never touch sibling roles even if some future edit to
  // looksLikeOpenShelf misses one. LED and TV opening are their own thing.
  if (cab.parameters.role === "led_strip") return cab;
  if (cab.parameters.role === "opening")   return cab;

  if (!looksLikeOpenShelf(cab)) return cab;
  if (cab.parameters.role === "open_shelf") return cab; // already correct

  const columns = typeof cab.parameters.columns === "number" && cab.parameters.columns > 0
    ? cab.parameters.columns
    : defaultColumns(cab.width);
  const rows = typeof cab.parameters.rows === "number" && cab.parameters.rows > 0
    ? cab.parameters.rows
    : defaultRows(cab.height);

  return {
    ...cab,
    parameters: {
      ...cab.parameters,
      role: "open_shelf",
      columns,
      rows,
      doorCount: 0,
      drawerCount: 0,
    },
    notes: cab.notes
      ? `${cab.notes} | repaired as open display shelf`
      : "repaired as open display shelf",
  };
}

function validateAndRepairSpec(design: CopilotResult): {
  cabinets: AICabinetSpec[];
  tvZone: TvZone | null;
} {
  // Prefer a proper role="opening" entry for the TV zone. Fall back to a legacy
  // phantom-named unit if the AI didn't use the role field yet.
  const opening = design.cabinetList.find((c) => c.parameters.role === "opening");
  const legacyPhantom =
    opening ?? design.cabinetList.find((c) => isPhantomTvUnit(c) && c.parameters.role !== "led_strip");

  const tvZone: TvZone | null = legacyPhantom
    ? {
        widthMm: legacyPhantom.width,
        heightMm: legacyPhantom.height,
        posX: legacyPhantom.posX ?? 0,
        posY: legacyPhantom.posY ?? 610,
      }
    : null;

  // Keep role="opening", "led_strip", and "open_shelf" units — they render
  // specially in 3D and each has its own DXF export behavior. Only drop LEGACY
  // unlabeled phantoms (units named like "TV Recess" but never set parameters.role).
  const cabinets = design.cabinetList
    .filter(
      (c) =>
        c.parameters.role === "opening" ||
        c.parameters.role === "led_strip" ||
        c.parameters.role === "open_shelf" ||
        !isPhantomTvUnit(c),
    )
    // Repair mislabeled display shelves BEFORE finish normalization so downstream
    // role checks see the corrected value.
    .map(repairDisplayShelfRole)
    .map((c) => ({
      ...c,
      parameters: {
        ...c.parameters,
        role: c.parameters.role ?? "cabinet",
        finishStyle: isGlassUnit(c) ? "glass" : design.primaryFinish,
      },
    }));

  return { cabinets, tvZone };
}

// ── Image prompt builder — reads from the validated CabinetSpec ──────────────
// The image is derived FROM the geometry, not from the user prompt, so the
// render describes exactly what the 3D/DXF will contain.

function mmToIn(mm: number, digits = 0): string {
  return `${(mm / 25.4).toFixed(digits)}"`;
}

// The image prompt is derived from the COMPILED GEOMETRY (not the raw spec),
// so every panel/door/drawer/handle count already exists as concrete numbers.
// This is the same struct the 3D scene and DXF exporter consume — one source of truth.
function describeDesignForImage(
  geometry: CompiledGeometry,
  designConcept: string,
  fv: { desc: string; negative: string },
): string {
  const { overall, summary, units, tvRecess } = geometry;
  const towers  = units.filter((u) => u.rowClass === "tower");
  // Rows include both closed cabinets and open shelves — they're the physical millwork.
  const isMillwork = (u: { role: string }) => u.role === "cabinet" || u.role === "open_shelf";
  const baseRow = units.filter((u) => isMillwork(u) && u.rowClass === "base");
  const midRow  = units.filter((u) => isMillwork(u) && u.rowClass === "middle");
  const topRow  = units.filter((u) => isMillwork(u) && u.rowClass === "upper");

  const parts: string[] = [
    `Photorealistic front-elevation architectural render of ${fv.desc} built-in ${overall.roomType} cabinetry.`,
    `Design intent: ${designConcept}`,
    `Overall wall: ${mmToIn(overall.widthMm)} wide × ${mmToIn(overall.maxHeightMm)} tall × ${mmToIn(overall.depthMm)} deep.`,
    `Element counts (exact — the render must show this many of each): ${summary.doorCount} closed doors, ${summary.drawerCount} drawer fronts, ${summary.towerCount} tall towers, ${summary.ledStripCount} LED strip${summary.ledStripCount === 1 ? "" : "s"}, ${summary.tvRecessCount} TV recess${summary.tvRecessCount === 1 ? "" : "es"}.`,
  ];

  if (towers.length >= 2) {
    const t = towers[0];
    const towerDoors = t.features?.fronts.filter((f) => f.kind === "door").length ?? 0;
    parts.push(
      `Two full-height tall side towers at the left and right ends of the wall, each ${mmToIn(t.width)} wide × ${mmToIn(t.height)} tall × ${mmToIn(t.depth)} deep, each with ${towerDoors} vertical closed door${towerDoors === 1 ? "" : "s"}.`,
    );
  } else if (towers.length === 1) {
    parts.push(`One full-height tall tower, ${mmToIn(towers[0].width)} × ${mmToIn(towers[0].height)}.`);
  }

  if (baseRow.length > 0) {
    const b = baseRow[0];
    const totalDrawers = baseRow.reduce((n, u) => n + (u.features?.fronts.filter((f) => f.kind === "drawer").length ?? 0), 0);
    const isDrawer = baseRow.some((u) => u.type === "drawer_base") || totalDrawers > 0;
    parts.push(
      `Base row between the towers: ${baseRow.length} ${isDrawer ? "drawer bank" : "cabinet"} sections side-by-side, each about ${mmToIn(b.width)} wide × ${mmToIn(b.height)} tall × ${mmToIn(b.depth)} deep, ${totalDrawers} total drawer fronts across the row with slim horizontal metal handles.`,
    );
  }

  if (midRow.length > 0) {
    const m = midRow[0];
    parts.push(
      `Middle row above the base: ${midRow.length} unit${midRow.length === 1 ? "" : "s"}${tvRecess ? " flanking a central TV mount recess" : ""}, each about ${mmToIn(m.width)} wide × ${mmToIn(m.height)} tall × ${mmToIn(m.depth)} deep.`,
    );
  }

  // Per-unit open-shelf breakdown — tells the image model the EXACT cubby grid
  // to render, unit by unit. If no open shelves exist, explicitly forbid the
  // model from inventing any.
  const openShelves = units.filter((u) => u.role === "open_shelf");
  if (openShelves.length > 0) {
    const shelfLines = openShelves.map((u) => {
      const hShelves  = u.features?.shelves.filter((s) => s.kind === "horizontal_shelf").length ?? 0;
      const vDividers = u.features?.shelves.filter((s) => s.kind === "vertical_divider").length ?? 0;
      const rows      = hShelves + 1;
      const cols      = vDividers + 1;
      const cubbies   = rows * cols;
      return `"${u.name}" (${mmToIn(u.width)}W × ${mmToIn(u.height)}H): ${cols} column${cols === 1 ? "" : "s"} × ${rows} row${rows === 1 ? "" : "s"} = ${cubbies} cubbies`;
    });
    parts.push(
      `Open display shelf units — render EXACTLY as specified, no more, no fewer: ${openShelves.length} total. ${shelfLines.join(" · ")}. Each cubby is a rectangular open compartment with visible horizontal shelf and vertical divider edges. NO doors, NO drawer fronts, NO glass covering any cubby opening.`,
    );
  } else {
    parts.push(
      `IMPORTANT: There are NO open display shelves in this design. Do NOT invent open cubbies, shelf grids, or open shelving of any kind. Every visible cabinet has doors or drawers.`,
    );
  }

  if (tvRecess) {
    parts.push(
      `Central TV recess: exactly ${mmToIn(tvRecess.widthMm)} wide × ${mmToIn(tvRecess.heightMm)} tall — a flat-screen TV wall-mounted inside this empty recess, NO cabinet doors or shelves inside the recess itself, dark inset back panel.`,
    );
  }

  if (topRow.length > 0) {
    const t = topRow[0];
    parts.push(
      `Upper overhead bridge row above the shelves: ${topRow.length} cabinets, each about ${mmToIn(t.width)} wide × ${mmToIn(t.height)} tall.`,
    );
  }

  if (summary.ledStripCount > 0) {
    parts.push(
      `Warm integrated LED lighting: ${summary.ledStripCount} strip${summary.ledStripCount === 1 ? "" : "s"} casting a soft honey-amber glow that grazes the shelf interiors and highlights the wood grain.`,
    );
  }

  parts.push(`Every panel, door, drawer front, tower, and shelf is ${fv.desc}.`);
  if (fv.negative) parts.push(`IMPORTANT: ${fv.negative}.`);
  parts.push(
    `Symmetric front-elevation composition, beautiful even natural lighting, professional architectural photography, showroom quality.`,
    `No text, no dimension labels, no annotations in the image.`,
  );

  return parts.join(" ");
}

export interface CopilotResult {
  roomType: string;
  designConcept: string;
  primaryFinish: string;
  imageUrl?: string;
  requirements: string[];
  cabinetList: AICabinetSpec[];
  /** Deterministic compiled geometry — same source of truth used for 3D, DXF, and image prompt. */
  compiledGeometry?: CompiledGeometry;
  roomLogic: {
    suggestedRoomWidth: number;
    suggestedRoomDepth: number;
    layout: string;
  };
  standards: string[];
  designNotes: string[];
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  getContext(req);
  void params;

  const body = (await req.json()) as { prompt: string };
  if (!body.prompt?.trim()) return apiError("prompt is required");

  const client = getOpenAI();

  // Finish style → assertive image-model description with negative cues to
  // override gpt-image-1's warm-oak default bias for "living room" scenes.
  const FINISH_VISUAL: Record<string, { desc: string; negative: string }> = {
    light_oak:     { desc: "light oak wood with visible natural wood grain, warm honey tones, matte finish", negative: "no dark stains, no black, no gloss lacquer" },
    natural_wood:  { desc: "warm medium-brown natural wood with visible grain, matte finish",                 negative: "no gloss, no painted surfaces" },
    dark_walnut:   { desc: "rich dark walnut wood with visible grain, deep espresso tones, matte finish",     negative: "no light wood, no gloss" },
    white_painted: { desc: "crisp white painted cabinetry, smooth matte painted surfaces, flat panels",       negative: "NO wood grain visible, NOT wood, no oak, no walnut" },
    modern_gloss:  { desc: "high-gloss anthracite black lacquer cabinetry, glossy reflective flat surfaces, seamless slab doors", negative: "NO wood grain, NOT oak, NOT warm wood, no matte finish, no visible wood texture" },
    metal:         { desc: "brushed stainless-steel and matte-metal cabinetry, industrial look",              negative: "no wood, no paint" },
    glass:         { desc: "natural wood frame with clear glass display panels",                              negative: "" },
  };

  try {
    // ── Step 1: Generate design text first so we can use primaryFinish in the image prompt ──
    const designResponse = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert interior designer and millwork specialist.
You design custom built-in cabinetry and furniture for ANY room type: kitchens, living rooms, bedrooms, home offices, dining rooms, bathrooms, etc.
Detect the room type from the user's prompt and generate a complete, positioned layout tailored to that room.
Always call generate_room_design with your complete findings.`,
          },
          {
            role: "user",
            content: `Design request: "${body.prompt}"

CRITICAL GEOMETRY RULE — DO NOT VIOLATE
Any visible open cubby, open display shelf, LED-backlit shelf, bookcase bay, or
open shelving unit MUST be emitted with:
    parameters.role         = "open_shelf"
    parameters.columns      = number of vertical bays (1–4)
    parameters.rows         = number of horizontal rows (1–5)
    parameters.doorCount    = 0
    parameters.drawerCount  = 0

NEVER represent an open display shelf as role="cabinet". NEVER put doorCount on
an open shelf. If your concept mentions "display shelves", "open shelves",
"cubbies", "LED shelves", or "open shelving", the geometry MUST be role="open_shelf".
Closed cabinets with doors keep role="cabinet".

STEP 1 — DETECT ROOM TYPE
Identify the room from the prompt (kitchen, living room, bedroom, office, etc.). Default to "kitchen" only if explicitly mentioned or no room is specified.

STEP 2 — GENERATE DESIGN CONCEPT
Write a 1–2 sentence design concept describing the overall style, materials, and layout.

STEP 3 — DIMENSION STANDARDS (1 ft = 304.8 mm · 1 in = 25.4 mm)

Kitchen:
  Base cabinets:     varies W × 876 mm H × 610 mm D
  Wall cabinets:     varies W × 762 mm H × 305 mm D
  Tall/pantry:       varies W × 2134 mm H × 610 mm D
  Sink base:         914 mm W × 876 mm H × 610 mm D
  Island:            use prompt dimensions or 1524 mm W × 914 mm H × 762 mm D

Living room / entertainment:
  TV console (base): varies W × 457 mm H × 457 mm D
  Side tower (tall): varies W × 2134 mm H × 406 mm D
  Upper shelf (wall): varies W × 305 mm H × 305 mm D  — posY = height of unit below
  Drawer unit (drawer_base): varies W × 610 mm H × 457 mm D

Bedroom:
  Wardrobe (tall):   varies W × 2134 mm H × 610 mm D
  Nightstand (base): 500 mm W × 600 mm H × 450 mm D
  Dresser (drawer_base): varies W × 914 mm H × 508 mm D

Office:
  Desk unit (base):  varies W × 762 mm H × 610 mm D
  Bookcase (tall):   varies W × 2134 mm H × 305 mm D
  Overhead (wall):   varies W × 457 mm H × 305 mm D — posY = height of desk

STEP 3b — MINIMUM COMPONENT REQUIREMENTS (CRITICAL — do not skip)
The output must be as detailed as a professional showroom render. A wall unit is
NEVER just 2 towers + 1 short console — it is a full integrated built-in with
multiple layered rows.

Living room / Entertainment / Display wall (MUST produce 10–15 units, layered):

  ROW 1 — BASE (posY = 0, height 610 mm, depth 406 mm)
    · 3–5 drawer_base sections side-by-side across the middle span
    · Each 600–900 mm wide
    · Notes: "base drawer unit"

  ROW 2 — MIDDLE OPEN SHELVES / TV (posY = 610, height 610–914 mm, depth 305 mm)
    Every unit in this row that is an OPEN DISPLAY SHELF (cubbies, no doors)
    MUST have parameters.role = "open_shelf" and specify columns and rows.
    Examples:
      · A wide shelf next to a TV: role="open_shelf", columns=2, rows=3
      · A single tall cubby column: role="open_shelf", columns=1, rows=4
    If you leave role as "cabinet" the unit renders WITH doors — that's wrong
    for display shelves.

    IF NO TV in the prompt:
      · Compute middleSpan = roomWidth − leftTower.width − rightTower.width
      · You MUST fully fill middleSpan with open shelves — NO dead center gap.
      · Emit 3–4 wall-type OPEN DISPLAY SHELVES, sum of their widths = middleSpan
        (each ~ middleSpan / 3, rounded to 100 mm; adjust the last one to
        absorb any rounding remainder so the sum matches exactly).
      · Each has role="open_shelf". Use columns 2–3 and rows 2–3 so the grid is
        visible (not a single-column empty box).
      · Notes: "open display shelf" or "LED-backlit shelf"
      · Verify: leftTower.width + Σ(shelf widths) + rightTower.width === roomWidth

    IF THE PROMPT MENTIONS A TV — follow this recipe EXACTLY:
      · Compute middleSpan = roomWidth − leftTower.width − rightTower.width
      · Compute tvOpening = clamp(1200, 1000, middleSpan − 600)
      · Compute sideShelfWidth = (middleSpan − tvOpening) / 2
      · Emit 2 wall-type OPEN SHELVES flanking the TV (role="open_shelf",
        columns=1, rows=3):
          shelf_L: posX = leftTower.width,                 width = sideShelfWidth
          shelf_R: posX = leftTower.width + sideShelfWidth + tvOpening,  width = sideShelfWidth
      · Also emit ONE explicit OPENING unit for the TV recess itself:
          name = "TV Recess", type = "wall", parameters.role = "opening"
          posX = leftTower.width + sideShelfWidth
          posY = row-2 posY  (typically 610)
          width = tvOpening,   height = row-2 height,   depth = 51
          finishStyle = primaryFinish (only used for the outline color)
      · The opening tells downstream tools "TV mounts here, don't put a cabinet".
        It renders as a subtle outlined recess in 3D and is skipped by the DXF exporter.

    Always set finishStyle = primaryFinish for shelves (NOT glass) — they are wood.

STEP 3c — LED LIGHTING (optional, adds ambience)
  If the prompt mentions "LED", "backlit", "ambient", or "lighting", emit ONE OR MORE
  led_strip units representing where the light lives. Each one is a real entry:
    name = "LED Strip — <where>", type = "wall", parameters.role = "led_strip"
    Dimensions describe the STRIP itself: length × 20 mm tall × 10 mm deep
    Position at the top edge of each display shelf's opening, or under the upper row,
    or around the TV recess perimeter.
    finishStyle = primaryFinish (ignored — the strip renders as a warm glow)
  LED strips are skipped by the DXF exporter (they are not millwork).

  ROW 3 — UPPER OVERHEAD (posY = 610 + row-2 height, height 305–457 mm, depth 305 mm)
    · 2–3 wall-type sections spanning the width above the shelves
    · Each 600–1200 mm wide
    · Notes: "upper overhead cabinet"

  SIDES — TALL TOWERS (posY = 0, height 2134 mm, depth 406 mm, ~600 mm wide)
    · One on the left (posX = 0) and one on the right
      (posX = roomWidth − tower width)
    · These span all three rows on the sides

  Verify: base row (drawers) + tower widths = roomWidth
  Verify: middle-row shelves + tower widths = roomWidth
  Verify: upper-row cabinets + tower widths = roomWidth
  Verify: total unit count is at least 10

Kitchen (MUST produce 8–15 units):
  · A run of base cabinets across the back wall (split every 600–900 mm)
  · Matching wall cabinets above at posY = 1371 (split every 600–900 mm)
  · At least one sink base and one tall pantry / oven tower
  · If the prompt mentions an island, add it as a separate unit

Bedroom (MUST produce 5–10 units):
  · Two matching nightstands flanking the bed area
  · One or two dressers (drawer_base)
  · Wardrobe / closet tall units on one wall
  · Optional upper overhead cabinets above the bed

Home office (MUST produce 6–10 units):
  · Desk base unit(s) at 762 mm H
  · Bookcase tall unit(s) at 2134 mm H
  · Overhead wall cabinets above the desk (posY = 762)
  · Optional file drawer_base units

NEVER leave the room half empty. If a room is 3.6 m wide and you only emit 3 units,
you are wrong — split each large run into multiple realistically-sized sections.

STEP 4 — COORDINATE SYSTEM
  Origin (0,0,0) = back-left corner of the room, at floor level
  X+ = right along the back wall · Y+ = up · Z+ = into the room

  posX: mm from origin to LEFT edge of unit's footprint
  posY: mm from floor to BOTTOM of unit
        — All floor-level units → posY = 0
        — Upper units resting on lower units → posY = height of lower unit
        — Kitchen wall cabinets at 54" AFF → posY = 1371
  posZ: mm from back wall to BACK edge (0 for back-wall units)
        — Left/right-wall units: posX = 0 or (roomWidth − depth)

STEP 5 — EXACT POSITION CHAINING (no gaps, no overlaps — READ CAREFULLY)
  For units along the same wall, chain posX exactly:
    unit[n+1].posX = unit[n].posX + unit[n].width
  Verify: sum of widths = total run length (room width or the relevant wall run).

  CRITICAL — base cabinets that share a wall with a tower MUST start AFTER
  the tower's right edge. NEVER put a base cabinet at posX=0 when the left
  tower is also at posX=0 — they will overlap.

  Worked example — living room, room=3000mm, two 600mm towers:
    Left Tower:     posX = 0,    width = 600      → spans 0-600
    Base Drawer 1:  posX = 600,  width = 600      → spans 600-1200
                    ↑ starts where left tower ends. NOT posX = 0.
    Base Drawer 2:  posX = 1200, width = 600      → spans 1200-1800
    Base Drawer 3:  posX = 1800, width = 600      → spans 1800-2400
                    ↑ ends where right tower starts.
    Right Tower:    posX = 2400, width = 600      → spans 2400-3000
    ✓ 600 (tower) + 3×600 (bases) + 600 (tower) = 3000 = roomWidth

  For symmetric layouts (e.g. left-tower + center + right-tower):
    left and right units must have EQUAL width and depth.
    rightUnit.posX = roomWidth − rightUnit.width
    centerUnit.posX = leftUnit.width
    centerUnit.width = roomWidth − leftUnit.width − rightUnit.width

STEP 6 — FINISH CONSISTENCY (CRITICAL)
  Choose ONE primaryFinish for ALL non-glass units that best matches the design concept.

    "light_oak"     → light/blonde/Scandinavian/oak/warm wood look (DEFAULT for living rooms unless otherwise specified)
    "natural_wood"  → medium brown natural wood tones
    "dark_walnut"   → dark walnut, espresso, dark stains
    "white_painted" → painted white, off-white, Shaker white
    "modern_gloss"  → high-gloss lacquer, contemporary dark/anthracite (use ONLY if user
                      explicitly says "gloss", "lacquer", "black", or "high-shine")
    "metal"         → industrial metal/steel look

  Rules:
  · Set primaryFinish = the dominant finish for the room.
  · Your designConcept MUST verbally describe the same finish — e.g. if primaryFinish
    is "light_oak", the concept must mention "light oak" or "warm oak" (NOT "gloss lacquer").
  · Do NOT pick "modern_gloss" for cozy/warm/inviting rooms — pick a wood finish.
  · Every cabinet's parameters.finishStyle MUST equal primaryFinish — EXCEPT fish tanks,
    aquariums, and glass display cases which MUST use "glass".
  · NEVER mix finishes across cabinets unless the user explicitly asked for two-tone.

STEP 7 — RAISED UNIT POSITIONING
  Fish tanks, aquariums, and wall-mounted feature units are NEVER at posY = 0.
  A fish tank / aquarium sits ON TOP of a base console/drawer unit.
  Set its posY = height of the base unit directly below it (e.g. 457 for a TV console).
  Its type should be "wall" (not "tall"), and it shares the same posX / posZ as the base below.

STEP 8 — COVER ALL COMPONENTS SEPARATELY
  Output each distinct section as its own entry in cabinetList.
  If the design has upper and lower units at the same X position, create two entries with different posY values.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_room_design",
              description: "Generate a complete room built-in design from a natural language description",
              parameters: {
                type: "object",
                properties: {
                  roomType: {
                    type: "string",
                    description: "Room type (e.g. 'kitchen', 'living room', 'bedroom', 'home office')",
                  },
                  designConcept: {
                    type: "string",
                    description: "1–2 sentence design concept describing style, materials, and layout",
                  },
                  primaryFinish: {
                    type: "string",
                    enum: ["light_oak","natural_wood","dark_walnut","white_painted","modern_gloss","glass","metal"],
                    description: "The single dominant finish applied to ALL non-glass cabinets in this design. Every cabinet's finishStyle must equal this value unless it is a fish tank / aquarium (which uses 'glass').",
                  },
                  requirements: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key requirements extracted from the user prompt",
                  },
                  cabinetList: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name:     { type: "string" },
                        type:     { type: "string", enum: ["base","wall","tall","corner","drawer_base","sink_base","island"] },
                        width:    { type: "number", description: "Width in mm" },
                        height:   { type: "number", description: "Height in mm" },
                        depth:    { type: "number", description: "Depth in mm" },
                        posX:     { type: "number", description: "mm from back-left origin to LEFT edge. Must chain exactly with adjacent units." },
                        posY:     { type: "number", description: "mm from floor to bottom of unit. 0 for floor-level. Use actual stacked height for upper units." },
                        posZ:     { type: "number", description: "mm from back wall to back edge (0 for back-wall units)" },
                        wallSide: { type: "string", enum: ["back","left","right","island","none"] },
                        parameters: {
                          type: "object",
                          properties: {
                            role: {
                              type: "string",
                              enum: ["cabinet", "opening", "led_strip", "open_shelf"],
                              description: "Functional role. 'cabinet' = CLOSED millwork with doors/drawers. 'open_shelf' is REQUIRED for display shelves, cubbies, LED shelving, bookcase bays, or any visible open shelf grid — DO NOT use 'cabinet' for these. 'opening' = intentional empty space, e.g. a TV mount recess. 'led_strip' = decorative LED lighting strip, rendered as a warm glow in 3D and skipped by DXF.",
                            },
                            columns: {
                              type: "number",
                              description: "For role='open_shelf' only. Number of vertical bays (1–4). Vertical dividers = columns − 1.",
                            },
                            rows: {
                              type: "number",
                              description: "For role='open_shelf' only. Number of horizontal rows (1–5). Horizontal shelves = rows − 1.",
                            },
                            doorCount:          { type: "number" },
                            drawerCount:        { type: "number" },
                            shelfCount:         { type: "number" },
                            toeKickHeight:      { type: "number" },
                            constructionMethod: { type: "string" },
                            hingeType:          { type: "string" },
                            finishStyle: {
                              type: "string",
                              enum: ["light_oak","natural_wood","dark_walnut","white_painted","modern_gloss","glass","metal"],
                              description: "Visual finish that matches the design concept. Use 'glass' for fish tanks, aquariums, or display cases.",
                            },
                          },
                        },
                        notes: { type: "string" },
                      },
                      required: ["name","type","width","height","depth","posX","posY","posZ","wallSide","parameters","notes"],
                    },
                  },
                  roomLogic: {
                    type: "object",
                    properties: {
                      suggestedRoomWidth: { type: "number", description: "Room width in mm" },
                      suggestedRoomDepth: { type: "number", description: "Room depth in mm" },
                      layout:             { type: "string", description: "Layout description (e.g. 'L-shape kitchen', 'Symmetric entertainment wall')" },
                    },
                    required: ["suggestedRoomWidth","suggestedRoomDepth","layout"],
                  },
                  standards: {
                    type: "array",
                    items: { type: "string" },
                    description: "Applicable construction and industry standards",
                  },
                  designNotes: {
                    type: "array",
                    items: { type: "string" },
                    description: "Important clearances, recommendations, and design observations",
                  },
                },
                required: ["roomType","designConcept","primaryFinish","requirements","cabinetList","roomLogic","standards","designNotes"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_room_design" } },
      });

    const toolCall = designResponse.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "generate_room_design") {
      return apiError("AI failed to generate a design. Try again.", 503, "AI_ERROR");
    }

    const design = JSON.parse(toolCall.function.arguments) as CopilotResult;

    // Dev-only debug: what did the AI actually emit? (before any repair)
    if (process.env.NODE_ENV !== "production") {
      console.log("[AI-COPILOT][RAW_UNITS]", {
        primaryFinish: design.primaryFinish,
        units: design.cabinetList.map((c) => ({
          name: c.name,
          type: c.type,
          role: c.parameters?.role,
          columns: c.parameters?.columns,
          rows: c.parameters?.rows,
          doorCount: c.parameters?.doorCount,
          drawerCount: c.parameters?.drawerCount,
          notes: c.notes,
        })),
      });
    }

    // ── Step 2: Validation + Normalization ────────────────────────────────────
    // Filter phantom TV placeholders, force finish consistency, extract TV zone,
    // and repair mislabeled display shelves.
    const { cabinets } = validateAndRepairSpec(design);
    design.cabinetList = cabinets;

    // Dev-only debug: what did validation change?
    if (process.env.NODE_ENV !== "production") {
      console.log("[AI-COPILOT][REPAIRED_UNITS]", {
        units: cabinets.map((c) => ({
          name: c.name,
          type: c.type,
          role: c.parameters?.role,
          columns: c.parameters?.columns,
          rows: c.parameters?.rows,
          doorCount: c.parameters?.doorCount,
          drawerCount: c.parameters?.drawerCount,
          notes: c.notes,
        })),
      });
    }

    // ── Step 3: Geometry Compiler ─────────────────────────────────────────────
    // Turn the validated spec into deterministic parametric geometry. Every
    // downstream output — image prompt, 3D scene, DXF export, elevation preview —
    // consumes THIS struct. It is the single source of truth.
    const geometry = compileGeometry(
      cabinets,
      design.roomLogic,
      design.primaryFinish,
      design.roomType,
    );
    design.compiledGeometry = geometry;

    // Dev-only debug: what did the compiler produce?
    if (process.env.NODE_ENV !== "production") {
      console.log("[AI-COPILOT][COMPILED_UNITS]", {
        summary: geometry.summary,
        units: geometry.units.map((u) => ({
          name: u.name,
          type: u.type,
          role: u.role,
          rowClass: u.rowClass,
          fronts:  u.features?.fronts.map((f) => f.kind)  ?? [],
          shelves: u.features?.shelves.map((s) => s.kind) ?? [],
        })),
      });
    }

    // ── Step 4: Outputs branch off the compiled geometry ──────────────────────
    // Output E: AI concept render. The image prompt describes the compiled
    // geometry (exact door/drawer counts, opening dimensions, LED positions),
    // so the render can no longer invent extra shelves or different proportions.
    const fv = FINISH_VISUAL[design.primaryFinish] ?? FINISH_VISUAL.natural_wood;
    const imagePrompt = describeDesignForImage(geometry, design.designConcept, fv);

    const imageResponse = await client.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt,
      size: "1536x1024",
      quality: "medium",
      n: 1,
    }).catch((err) => {
      console.warn("[ai-copilot] image generation failed (non-fatal):", err);
      return null;
    });

    const b64 = imageResponse?.data?.[0]?.b64_json;
    const imageUrl = b64 ? `data:image/png;base64,${b64}` : undefined;

    // Outputs A/B/C/D (elevation preview, 3D scene, DXF, CabinetVision DXF) are
    // built by the client from the SAME `compiledGeometry` we return here.
    return ok({ ...design, imageUrl });
  } catch (err) {
    console.error("[ai-copilot] OpenAI error:", err);
    return apiError("AI service unavailable. Try again later.", 503, "AI_UNAVAILABLE");
  }
}
