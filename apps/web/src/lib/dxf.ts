// ── DXF export / import for AI Co-pilot cabinets ─────────────────────────────
// AutoCAD R12 ASCII format with 3DFACE entities, one layer per cabinet.
// Compatible with CabinetVision "3D Faces" import.
//
// Coordinate mapping:
//   Our app (mm):   posX = right, posY = up,             posZ = into room
//   DXF file (in):  X    = right, Y    = depth into room, Z    = up
//
// So on export we swap Y↔Z; on import we swap back.

import type { AICabinetSpec } from "@/components/editor/AICopilotPanel";
import { compileGeometry, type CompiledGeometry, type CompiledUnit } from "@woodcraft/shared";

const MM_PER_INCH = 25.4;

// ── Small formatting helpers ──────────────────────────────────────────────────

function sanitizeLayer(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "_").toUpperCase().slice(0, 28);
}

function pair(code: number, value: string | number): string {
  return `${code}\n${value}`;
}

function fmt(n: number): string {
  return n.toFixed(4);
}

// One 3DFACE entity — quad with 4 corners
function dxfFace(
  layer: string,
  c1: [number, number, number],
  c2: [number, number, number],
  c3: [number, number, number],
  c4: [number, number, number],
): string {
  return [
    pair(0, "3DFACE"),
    pair(8, layer),
    pair(10, fmt(c1[0])), pair(20, fmt(c1[1])), pair(30, fmt(c1[2])),
    pair(11, fmt(c2[0])), pair(21, fmt(c2[1])), pair(31, fmt(c2[2])),
    pair(12, fmt(c3[0])), pair(22, fmt(c3[1])), pair(32, fmt(c3[2])),
    pair(13, fmt(c4[0])), pair(23, fmt(c4[1])), pair(33, fmt(c4[2])),
  ].join("\n");
}

// Emit 6 faces (bottom, top, front, back, left, right) for a box.
// (x,y,z) is the back-left-bottom corner; (w,d,h) are extents in DXF axes.
function dxfBox(
  layer: string,
  x: number, y: number, z: number,
  w: number, d: number, h: number,
): string {
  const p000: [number, number, number] = [x,     y,     z];
  const p100: [number, number, number] = [x + w, y,     z];
  const p110: [number, number, number] = [x + w, y + d, z];
  const p010: [number, number, number] = [x,     y + d, z];
  const p001: [number, number, number] = [x,     y,     z + h];
  const p101: [number, number, number] = [x + w, y,     z + h];
  const p111: [number, number, number] = [x + w, y + d, z + h];
  const p011: [number, number, number] = [x,     y + d, z + h];

  return [
    dxfFace(layer, p000, p100, p110, p010), // bottom (Z-)
    dxfFace(layer, p001, p101, p111, p011), // top    (Z+)
    dxfFace(layer, p010, p110, p111, p011), // front  (Y+)
    dxfFace(layer, p000, p100, p101, p001), // back   (Y-)
    dxfFace(layer, p000, p010, p011, p001), // left   (X-)
    dxfFace(layer, p100, p110, p111, p101), // right  (X+)
  ].join("\n");
}

// ── DXF axis conventions ──────────────────────────────────────────────────────
// Standard CAD:  X = right (width),  Y = depth (into wall),  Z = up (height)
// CabinetVision: X = right (width),  Y = up (height),        Z = depth
//
// Our internal coord system uses posX=right, posY=up, posZ=depth. The exporter
// maps into whichever DXF convention the target CAD expects.

type DxfAxis = "cad" | "cabinet_vision";

function toDxfCoords(
  axis: DxfAxis,
  posX_mm: number, posY_mm: number, posZ_mm: number,
  w_mm: number, h_mm: number, d_mm: number,
): { x: number; y: number; z: number; w: number; d: number; h: number } {
  const px = posX_mm / MM_PER_INCH;
  const py = posY_mm / MM_PER_INCH;   // "up" in mm
  const pz = posZ_mm / MM_PER_INCH;   // "depth" in mm
  const w  = w_mm    / MM_PER_INCH;
  const h  = h_mm    / MM_PER_INCH;
  const d  = d_mm    / MM_PER_INCH;
  if (axis === "cabinet_vision") {
    // DXF Y = up, DXF Z = depth
    return { x: px, y: py, z: pz, w, d, h };
  }
  // Standard CAD: DXF Y = depth, DXF Z = up
  return { x: px, y: pz, z: py, w, d: d, h: h };
}

// ── Export: compiled geometry → DXF text ──────────────────────────────────────
// Emits carcass + toe kick + countertop + door + drawer as separate 3DFACE
// groups on sub-layers per cabinet, so CabinetVision sees real face breakouts
// (not opaque blocks).

interface DxfExportOptions {
  axis?: DxfAxis;               // default "cad"
  breakoutFronts?: boolean;     // default true — emit doors/drawers on sub-layers
}

function emitBox(
  layer: string,
  axis: DxfAxis,
  posX: number, posY: number, posZ: number,
  w: number, h: number, d: number,
): string {
  const c = toDxfCoords(axis, posX, posY, posZ, w, h, d);
  return dxfBox(layer, c.x, c.y, c.z, c.w, c.d, c.h);
}

// Map compiled shelf/frame `kind` to a short DXF sub-layer tag.
const SHELF_KIND_TAG: Record<string, string> = {
  horizontal_shelf: "SHELF",
  vertical_divider: "DIVIDER",
  back_panel:       "BACKPANEL",
  left_panel:       "LEFTPANEL",
  right_panel:      "RIGHTPANEL",
  top_panel:        "TOPPANEL",
  bottom_panel:     "BOTTOMPANEL",
};

function unitToBlocks(
  unit: CompiledUnit,
  baseLayer: string,
  axis: DxfAxis,
  breakoutFronts: boolean,
  layerNames: string[],
): string[] {
  const blocks: string[] = [];

  // Skip openings and LED strips — not physical millwork
  if ((unit.role !== "cabinet" && unit.role !== "open_shelf") || !unit.features) return blocks;

  // Solid carcass — only for closed cabinets. Open shelves emit their frame
  // as individual panels (see the shelves loop below).
  const isOpenShelf = unit.role === "open_shelf";
  const toeH = unit.features.toeKickHeightMm;

  if (!isOpenShelf) {
    const carcassLayer = `${baseLayer}__CARCASS`;
    layerNames.push(carcassLayer);
    const carcassH = unit.height - toeH;
    blocks.push(emitBox(carcassLayer, axis, unit.posX, unit.posY + toeH, unit.posZ, unit.width, carcassH, unit.depth));
  }

  if (toeH > 0) {
    const toeLayer = `${baseLayer}__TOEKICK`;
    layerNames.push(toeLayer);
    blocks.push(emitBox(toeLayer, axis, unit.posX, unit.posY, unit.posZ, unit.width, toeH, unit.depth));
  }

  if (unit.features.countertop) {
    const ct = unit.features.countertop;
    const ctLayer = `${baseLayer}__COUNTERTOP`;
    layerNames.push(ctLayer);
    blocks.push(emitBox(
      ctLayer, axis,
      unit.posX - ct.overhangSidesMm,
      unit.posY + unit.height,
      unit.posZ,
      unit.width + 2 * ct.overhangSidesMm,
      ct.thicknessMm,
      unit.depth + ct.overhangFrontMm,
    ));
  }

  // Compiled shelf/frame panels (open shelves) — emit each on its own sub-layer
  unit.features.shelves.forEach((s, i) => {
    const tag = SHELF_KIND_TAG[s.kind] ?? "PANEL";
    const layer = `${baseLayer}__${tag}_${String(i + 1).padStart(2, "0")}`;
    layerNames.push(layer);
    blocks.push(emitBox(
      layer, axis,
      unit.posX + s.x,
      unit.posY + s.y,
      unit.posZ + s.z,
      s.widthMm,
      s.heightMm,
      s.depthMm,
    ));
  });

  if (breakoutFronts) {
    unit.features.fronts.forEach((f, i) => {
      const layer = `${baseLayer}__${f.kind === "door" ? "DOOR" : "DRAWER"}_${String(i + 1).padStart(2, "0")}`;
      layerNames.push(layer);
      // Front panel sits on the FRONT face of the cabinet
      // Local (x,y) offset within the cabinet, projected to world space
      blocks.push(emitBox(
        layer, axis,
        unit.posX + f.x,
        unit.posY + f.y,
        unit.posZ + unit.depth - f.thicknessMm,
        f.widthMm,
        f.heightMm,
        f.thicknessMm,
      ));
    });
  }

  return blocks;
}

function assembleDxf(geometry: CompiledGeometry, options: DxfExportOptions = {}): string {
  const axis            = options.axis ?? "cad";
  const breakoutFronts  = options.breakoutFronts ?? true;
  const layerNames: string[] = [];
  const geometryBlocks: string[] = [];

  geometry.units.forEach((unit, i) => {
    const baseLayer = `CAB_${String(i + 1).padStart(2, "0")}_${sanitizeLayer(unit.name || "UNIT")}`;
    geometryBlocks.push(...unitToBlocks(unit, baseLayer, axis, breakoutFronts, layerNames));
  });

  const layerTable = layerNames
    .map((name) =>
      [
        pair(0, "LAYER"),
        pair(2, name),
        pair(70, 0),
        pair(62, 7),
        pair(6, "CONTINUOUS"),
      ].join("\n"),
    )
    .join("\n");

  return [
    pair(0, "SECTION"),
      pair(2, "HEADER"),
      pair(9, "$ACADVER"), pair(1, "AC1009"),
      pair(9, "$INSUNITS"), pair(70, 1),
    pair(0, "ENDSEC"),

    pair(0, "SECTION"),
      pair(2, "TABLES"),
      pair(0, "TABLE"),
        pair(2, "LAYER"),
        pair(70, layerNames.length),
        layerTable,
      pair(0, "ENDTAB"),
    pair(0, "ENDSEC"),

    pair(0, "SECTION"),
      pair(2, "ENTITIES"),
      ...geometryBlocks,
    pair(0, "ENDSEC"),

    pair(0, "EOF"),
  ].join("\n") + "\n";
}

// ── Public API ────────────────────────────────────────────────────────────────

// Ensure we have compiled geometry — either the caller already has it, or we
// compile from the raw specs. Both paths produce identical output.
function ensureGeometry(input: AICabinetSpec[] | CompiledGeometry): CompiledGeometry {
  if (!Array.isArray(input)) return input;
  const roomWidth  = Math.max(0, ...input.map((c) => (c.posX ?? 0) + c.width));
  const roomDepth  = Math.max(0, ...input.map((c) => (c.posZ ?? 0) + c.depth));
  const primary    = input.find((c) => c.parameters.finishStyle)?.parameters.finishStyle ?? "natural_wood";
  return compileGeometry(
    input,
    { suggestedRoomWidth: roomWidth, suggestedRoomDepth: roomDepth },
    primary,
    "room",
  );
}

/** Output C — Standard CAD DXF (Z-up). Doors/drawers on sub-layers. */
export function cabinetsToDxf(input: AICabinetSpec[] | CompiledGeometry): string {
  return assembleDxf(ensureGeometry(input), { axis: "cad", breakoutFronts: true });
}

/** Output D — CabinetVision-flavored DXF (Y-up, per CV axis convention). */
export function cabinetsToCabinetVisionDxf(input: AICabinetSpec[] | CompiledGeometry): string {
  return assembleDxf(ensureGeometry(input), { axis: "cabinet_vision", breakoutFronts: true });
}

// ── Import: DXF text → cabinet specs ──────────────────────────────────────────

interface RawFace {
  layer: string;
  corners: [number, number, number][];
}

function parseFaces(dxfText: string): RawFace[] {
  const lines = dxfText.split(/\r?\n/);
  const faces: RawFace[] = [];
  let i = 0;

  while (i < lines.length - 1) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1] ?? "";

    if (code === 0 && value.trim() === "3DFACE") {
      let layer = "0";
      const corners: [number, number, number][] = [[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
      i += 2;

      while (i < lines.length - 1) {
        const c = parseInt(lines[i].trim(), 10);
        const v = lines[i + 1] ?? "";
        if (c === 0) break; // start of next entity — leave i pointing at it

        if      (c === 8)  layer = v.trim();
        else if (c === 10) corners[0][0] = parseFloat(v);
        else if (c === 20) corners[0][1] = parseFloat(v);
        else if (c === 30) corners[0][2] = parseFloat(v);
        else if (c === 11) corners[1][0] = parseFloat(v);
        else if (c === 21) corners[1][1] = parseFloat(v);
        else if (c === 31) corners[1][2] = parseFloat(v);
        else if (c === 12) corners[2][0] = parseFloat(v);
        else if (c === 22) corners[2][1] = parseFloat(v);
        else if (c === 32) corners[2][2] = parseFloat(v);
        else if (c === 13) corners[3][0] = parseFloat(v);
        else if (c === 23) corners[3][1] = parseFloat(v);
        else if (c === 33) corners[3][2] = parseFloat(v);

        i += 2;
      }

      faces.push({ layer, corners });
    } else {
      i += 2;
    }
  }

  return faces;
}

function prettyName(layer: string, fallbackIdx: number): string {
  // "CAB_01_LEFT_TOWER" → "Left Tower"
  const m = layer.match(/^CAB_\d+_(.+)$/);
  const raw = m ? m[1] : layer;
  const words = raw.replace(/_/g, " ").toLowerCase().trim();
  if (!words) return `Cabinet ${fallbackIdx}`;
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Group faces by layer, compute bounding box per group → one cabinet each.
// Non-cabinet layers (REFERENCE, PANELS from generic DXFs) are still imported so
// the user sees the whole geometry, but treated as simple base boxes.
export function parseDxfCabinets(dxfText: string): AICabinetSpec[] {
  const faces = parseFaces(dxfText);
  if (faces.length === 0) return [];

  const groups = new Map<string, RawFace[]>();
  for (const f of faces) {
    const list = groups.get(f.layer);
    if (list) list.push(f);
    else groups.set(f.layer, [f]);
  }

  const result: AICabinetSpec[] = [];
  let idx = 0;

  for (const [layer, layerFaces] of groups) {
    if (layer.toUpperCase() === "REFERENCE") continue;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const f of layerFaces) {
      for (const [x, y, z] of f.corners) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }

    const wIn = maxX - minX;
    const dIn = maxY - minY;
    const hIn = maxZ - minZ;
    if (wIn < 0.05 || dIn < 0.05 || hIn < 0.05) continue;

    idx++;
    const name = prettyName(layer, idx);

    // DXF X → our X (right), DXF Y → our Z (depth), DXF Z → our Y (height)
    result.push({
      name,
      type: hIn > 60 ? "tall" : hIn < 20 ? "wall" : "base",
      width:  Math.round(wIn * MM_PER_INCH),
      height: Math.round(hIn * MM_PER_INCH),
      depth:  Math.round(dIn * MM_PER_INCH),
      posX:   Math.round(minX * MM_PER_INCH),
      posY:   Math.round(minZ * MM_PER_INCH),
      posZ:   Math.round(minY * MM_PER_INCH),
      wallSide: "back",
      parameters: {},
      notes: `Imported from DXF layer ${layer}`,
    });
  }

  return result;
}

// ── Browser download helper ───────────────────────────────────────────────────

export function downloadDxf(filename: string, dxfText: string): void {
  const blob = new Blob([dxfText], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".dxf") ? filename : `${filename}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
