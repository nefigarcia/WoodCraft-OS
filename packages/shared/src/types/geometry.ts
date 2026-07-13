// ── WoodCraft OS Geometry Compiler ────────────────────────────────────────────
// Turns a validated CabinetSpec (the JSON the AI produces + validation cleans up)
// into a deterministic, parametric CompiledGeometry that every downstream tool
// reads from — 3D scene, DXF export, image prompt, elevation preview.
//
// Rule: the compiler is the ONLY place that decides "how many drawer fronts does
// a 24-inch drawer_base have" or "does this cabinet get a countertop". Downstream
// consumers just render what the compiler produced.

import type { CabinetType } from "./cabinet";

// ── Input (a subset of AICabinetSpec — every consumer already has this shape) ─

export interface CabinetSpecInput {
  name: string;
  type: CabinetType;
  width: number;
  height: number;
  depth: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  parameters: {
    role?: "cabinet" | "opening" | "led_strip";
    doorCount?: number;
    drawerCount?: number;
    shelfCount?: number;
    toeKickHeight?: number;
    finishStyle?: string;
    [key: string]: unknown;
  };
  notes?: string;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface CompiledHandle {
  x: number;               // mm from cabinet's back-left-bottom
  y: number;               // mm from cabinet's back-left-bottom
  orientation: "horizontal" | "vertical";
  lengthMm: number;
}

export interface CompiledFrontPanel {
  kind: "door" | "drawer";
  x: number;               // mm, local to cabinet, X = along width
  y: number;               // mm, local to cabinet, Y = vertical
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  hasShakerInset: boolean; // false for gloss slab, true for shaker style
  handle: CompiledHandle | null;
}

export interface CompiledCountertop {
  thicknessMm: number;
  overhangFrontMm: number;
  overhangSidesMm: number;
}

export interface CompiledFeatures {
  toeKickHeightMm: number;                 // 0 = none
  countertop: CompiledCountertop | null;
  fronts: CompiledFrontPanel[];
}

export type RowClass =
  | "base"     // floor-level base / drawer_base / sink_base
  | "middle"   // wall units between base and top rows (open shelves etc.)
  | "upper"    // upper bridge / overhead wall units
  | "tower"    // full-height tall units
  | "island"   // free-standing islands
  | "other";

export interface CompiledUnit {
  id: string;
  name: string;
  type: CabinetType;
  role: "cabinet" | "opening" | "led_strip";
  finishStyle: string;
  // World-space bounding box (mm) with origin = back-left corner of the room at floor
  posX: number; posY: number; posZ: number;
  width: number; height: number; depth: number;
  features: CompiledFeatures | null; // null for openings and LED strips
  rowClass: RowClass;
}

export interface CompiledSummary {
  unitCount: number;      // role === "cabinet" only
  towerCount: number;
  baseRowCount: number;
  midRowCount: number;
  topRowCount: number;
  doorCount: number;
  drawerCount: number;
  ledStripCount: number;
  tvRecessCount: number;
}

export interface CompiledOverall {
  widthMm: number;
  maxHeightMm: number;
  depthMm: number;
  primaryFinish: string;
  roomType: string;
}

export interface TvRecess {
  widthMm: number;
  heightMm: number;
  posX: number;
  posY: number;
}

export interface CompiledGeometry {
  overall: CompiledOverall;
  summary: CompiledSummary;
  units: CompiledUnit[];
  tvRecess: TvRecess | null;
}

// ── Deterministic constants (mirror the 3D renderer's cabinet detail constants) ─

const TOE_MM         = 89;   // 3.5" toe-kick height
const DOOR_T_MM      = 19;   // door / drawer slab thickness
const HANDLE_L_MM    = 96;   // handle bar length
const HANDLE_INSET_MM = 35;  // distance from door edge to handle centerline
const PGAP_MM        = 2;    // reveal gap between adjacent front panels
const COUNTERTOP_MM  = 38;
const COUNTERTOP_OVF = 19;   // front overhang (kitchen base)
const COUNTERTOP_OVI = 38;   // all-sides overhang (island)

function isKitchenHeight(heightMm: number): boolean {
  return heightMm >= 800 && heightMm <= 950;
}

function classifyRow(type: CabinetType, posY: number): RowClass {
  if (type === "tall")   return "tower";
  if (type === "island") return "island";
  if (posY < 300)        return "base";
  if (posY < 1400)       return "middle";
  return "upper";
}

function needsToeKick(type: CabinetType): boolean {
  return type === "base" || type === "drawer_base" || type === "sink_base" || type === "island" || type === "tall";
}

function needsCountertop(type: CabinetType, heightMm: number): boolean {
  if (type === "island") return true;
  if (!isKitchenHeight(heightMm)) return false;
  return type === "base" || type === "sink_base";
}

function autoDoorCount(width: number, explicit?: number): number {
  if (typeof explicit === "number" && explicit > 0) return explicit;
  return width > 650 ? 2 : 1;
}

function autoDrawerCount(type: CabinetType, explicit?: number): number {
  if (typeof explicit === "number" && explicit >= 0) return explicit;
  return type === "drawer_base" ? 3 : 0;
}

// ── Front-panel layout (single source of truth used by 3D + DXF + preview) ────
// Mirrors buildFrontPanels() in CabinetEditor.tsx but expressed in mm instead of
// metres and returns richer per-panel data (handle positions, shaker flag).

function compileFrontPanels(
  cab: CabinetSpecInput,
  toeKickHeightMm: number,
): CompiledFrontPanel[] {
  const w = cab.width;
  const h = cab.height;
  const type = cab.type;

  const doors   = autoDoorCount(w, cab.parameters.doorCount);
  const drawers = autoDrawerCount(type, cab.parameters.drawerCount);

  const bodyH   = Math.max(0, h - toeKickHeightMm);
  const dc      = Math.min(drawers, 5);
  const drawerH = dc > 0 ? Math.min(210, (bodyH * 0.45) / dc) : 0;
  const drawerTot = dc * (drawerH + PGAP_MM);
  const doorH   = bodyH - drawerTot;

  const fronts: CompiledFrontPanel[] = [];

  // Drawers stack near the top of the cabinet body
  for (let i = 0; i < dc; i++) {
    const dy = toeKickHeightMm + doorH + i * (drawerH + PGAP_MM);
    const dw = w - 2 * PGAP_MM;
    fronts.push({
      kind: "drawer",
      x: PGAP_MM,
      y: dy,
      widthMm: dw,
      heightMm: drawerH,
      thicknessMm: DOOR_T_MM,
      hasShakerInset: false,
      handle: {
        x: w / 2 - HANDLE_L_MM / 2,
        y: dy + drawerH / 2 - 4,
        orientation: "horizontal",
        lengthMm: HANDLE_L_MM,
      },
    });
  }

  // Doors fill the remaining space along the bottom
  const fc = Math.max(1, Math.min(doors, 4));
  if (doorH > 80) {
    const doorW = (w - (fc + 1) * PGAP_MM) / fc;
    for (let i = 0; i < fc; i++) {
      const dx = PGAP_MM + i * (doorW + PGAP_MM);
      fronts.push({
        kind: "door",
        x: dx,
        y: toeKickHeightMm + PGAP_MM,
        widthMm: doorW,
        heightMm: doorH - 2 * PGAP_MM,
        thicknessMm: DOOR_T_MM,
        hasShakerInset: true,
        handle: {
          x: dx + doorW - HANDLE_INSET_MM,
          y: toeKickHeightMm + doorH - doorH / 4,
          orientation: "vertical",
          lengthMm: HANDLE_L_MM,
        },
      });
    }
  }

  return fronts;
}

// ── The compiler ──────────────────────────────────────────────────────────────

export function compileGeometry(
  cabinets: CabinetSpecInput[],
  roomLogic: { suggestedRoomWidth: number; suggestedRoomDepth: number },
  primaryFinish: string,
  roomType: string,
): CompiledGeometry {
  const units: CompiledUnit[] = cabinets.map((cab, idx) => {
    const role     = (cab.parameters.role ?? "cabinet") as CompiledUnit["role"];
    const rowClass = classifyRow(cab.type, cab.posY ?? 0);
    const finish   = cab.parameters.finishStyle ?? primaryFinish;

    // Openings and LED strips carry no cabinet features
    if (role !== "cabinet") {
      return {
        id: `unit_${idx + 1}`,
        name: cab.name,
        type: cab.type,
        role,
        finishStyle: finish,
        posX: cab.posX ?? 0,
        posY: cab.posY ?? 0,
        posZ: cab.posZ ?? 0,
        width: cab.width,
        height: cab.height,
        depth: cab.depth,
        features: null,
        rowClass,
      };
    }

    const toeH = needsToeKick(cab.type) ? TOE_MM : 0;
    const isIsland = cab.type === "island";
    const countertop: CompiledCountertop | null = needsCountertop(cab.type, cab.height)
      ? {
          thicknessMm: COUNTERTOP_MM,
          overhangFrontMm: isIsland ? COUNTERTOP_OVI : COUNTERTOP_OVF,
          overhangSidesMm: isIsland ? COUNTERTOP_OVI : 0,
        }
      : null;

    const fronts = compileFrontPanels(cab, toeH);

    return {
      id: `unit_${idx + 1}`,
      name: cab.name,
      type: cab.type,
      role,
      finishStyle: finish,
      posX: cab.posX ?? 0,
      posY: cab.posY ?? 0,
      posZ: cab.posZ ?? 0,
      width: cab.width,
      height: cab.height,
      depth: cab.depth,
      features: { toeKickHeightMm: toeH, countertop, fronts },
      rowClass,
    };
  });

  // Summary — counts of everything the compiler produced
  const summary: CompiledSummary = {
    unitCount:      units.filter((u) => u.role === "cabinet").length,
    towerCount:     units.filter((u) => u.rowClass === "tower").length,
    baseRowCount:   units.filter((u) => u.role === "cabinet" && u.rowClass === "base").length,
    midRowCount:    units.filter((u) => u.role === "cabinet" && u.rowClass === "middle").length,
    topRowCount:    units.filter((u) => u.role === "cabinet" && u.rowClass === "upper").length,
    doorCount:      units.reduce((n, u) => n + (u.features?.fronts.filter((f) => f.kind === "door").length ?? 0), 0),
    drawerCount:    units.reduce((n, u) => n + (u.features?.fronts.filter((f) => f.kind === "drawer").length ?? 0), 0),
    ledStripCount:  units.filter((u) => u.role === "led_strip").length,
    tvRecessCount:  units.filter((u) => u.role === "opening").length,
  };

  const opening = units.find((u) => u.role === "opening");
  const tvRecess: TvRecess | null = opening
    ? { widthMm: opening.width, heightMm: opening.height, posX: opening.posX, posY: opening.posY }
    : null;

  const maxHeightMm = units.length > 0
    ? Math.max(...units.map((u) => u.posY + u.height))
    : 0;

  const overall: CompiledOverall = {
    widthMm: roomLogic.suggestedRoomWidth,
    maxHeightMm,
    depthMm: roomLogic.suggestedRoomDepth,
    primaryFinish,
    roomType,
  };

  return { overall, summary, units, tvRecess };
}
