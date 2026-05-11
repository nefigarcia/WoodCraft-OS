export type CabinetType = "base" | "wall" | "tall" | "corner" | "island";

export type PartType =
  | "left_panel"
  | "right_panel"
  | "top_panel"
  | "bottom_panel"
  | "back_panel"
  | "shelf"
  | "door"
  | "drawer_front"
  | "drawer_box"
  | "toe_kick"
  | "filler"
  | "crown_molding"
  | "light_rail";

export type GrainDirection = "horizontal" | "vertical" | "none";

export interface EdgeBanding {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface CabinetParameters {
  doorCount?: number;
  drawerCount?: number;
  shelfCount?: number;
  hingeType?: string;
  drawerSlideType?: string;
  doorOverlay?: number;
  faceFrameWidth?: number;
  constructionType?: "frameless" | "face_frame";
  [key: string]: unknown;
}

export interface CabinetPart {
  id: string;
  cabinetId: string;
  orgId: string;
  name: string;
  partType: PartType;
  width: number;
  height: number;
  thickness: number;
  quantity: number;
  materialId: string | null;
  grainDir: GrainDirection | null;
  edgeBanding: EdgeBanding | null;
  cutParams: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Cabinet {
  id: string;
  roomId: string;
  orgId: string;
  type: CabinetType;
  name: string;
  width: number;
  height: number;
  depth: number;
  posX: number;
  posY: number;
  posZ: number;
  parameters: CabinetParameters;
  materialId: string | null;
  parts: CabinetPart[];
  createdAt: string;
  updatedAt: string;
}

export interface CabinetUpdateRequest {
  name?: string;
  width?: number;
  height?: number;
  depth?: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  parameters?: Partial<CabinetParameters>;
  materialId?: string;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  severity: "error" | "warning";
}

export interface ValidationReport {
  id: string;
  cabinetId: string;
  status: "pass" | "warning" | "fail";
  errors: ValidationError[];
  warnings: ValidationError[];
  aiModel: string | null;
  createdAt: string;
}
