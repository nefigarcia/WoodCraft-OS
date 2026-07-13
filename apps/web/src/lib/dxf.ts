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

// ── Export: cabinet specs → DXF text ──────────────────────────────────────────

export function cabinetsToDxf(cabinets: AICabinetSpec[]): string {
  const layerNames: string[] = [];
  const geometryBlocks: string[] = [];

  // Openings (TV recesses) and LED strips are not physical millwork — skip them.
  const millwork = cabinets.filter(
    (c) => c.parameters.role !== "opening" && c.parameters.role !== "led_strip",
  );

  millwork.forEach((cab, i) => {
    const layer = `CAB_${String(i + 1).padStart(2, "0")}_${sanitizeLayer(cab.name || "UNIT")}`;
    layerNames.push(layer);

    // Convert mm → inches AND swap Y ↔ Z (DXF Z is up)
    const x = (cab.posX ?? 0) / MM_PER_INCH;
    const y = (cab.posZ ?? 0) / MM_PER_INCH; // our Z (depth) → DXF Y
    const z = (cab.posY ?? 0) / MM_PER_INCH; // our Y (height) → DXF Z
    const w = cab.width  / MM_PER_INCH;
    const d = cab.depth  / MM_PER_INCH;      // depth in DXF Y
    const h = cab.height / MM_PER_INCH;      // height in DXF Z

    geometryBlocks.push(dxfBox(layer, x, y, z, w, d, h));
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
