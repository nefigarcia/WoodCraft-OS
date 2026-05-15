export type CabinetType =
  | "base"
  | "wall"
  | "tall"
  | "corner"
  | "drawer_base"
  | "sink_base"
  | "island";

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
  | "mid_rail"
  | "filler"
  | "face_frame_stile"
  | "face_frame_rail"
  | "face_frame_mullion"
  | "crown_molding"
  | "light_rail"
  | "custom";

export type GrainDirection = "horizontal" | "vertical" | "none";

export type AssemblyGroup = "carcass" | "face_frame" | "door" | "drawer" | "shelf";

export type ConstructionMethod = "frameless" | "face_frame";

export interface EdgeBanding {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface JoinerySpec {
  type: "dado" | "rabbet" | "pocket_screw" | "shelf_pins" | "dowel" | "biscuit";
  depth_mm?: number;
  location?: string;
  fits_into?: string;
  spacing_mm?: number;
  screws_per_joint?: number;
  pin_diameter_mm?: number;
}

export interface HardwareSpec {
  type: "hinge" | "drawer_slide" | "pull" | "knob";
  style?: string;
  count?: number;
  length_mm?: number;
  cup_diameter_mm?: number;
  boring_depth_mm?: number;
  plate_inset_mm?: number;
  positions_from_top_mm?: number[];
  side_space_mm?: number;
}

export interface ShelfPinSpec {
  spacing_mm: number;
  row_inset_mm: number;
  rows: number;
}

export interface CutParams {
  joinery?: JoinerySpec;
  hardware?: HardwareSpec;
  shelf_pins?: ShelfPinSpec;
  [key: string]: unknown;
}

export interface CabinetParameters {
  doorCount?: number;
  drawerCount?: number;
  shelfCount?: number;
  toeKickHeight?: number;
  doorOverlay?: number;
  constructionMethod?: ConstructionMethod;
  stileWidth?: number;
  railWidth?: number;
  faceFrameThickness?: number;
  blindPanelWidth?: number;
  hingeType?: string;
  drawerSlideType?: string;
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
  cutParams: CutParams | null;
  assemblyGroup: AssemblyGroup | null;
  isManual: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartUpdateRequest {
  name?: string;
  partType?: PartType;
  width?: number;
  height?: number;
  thickness?: number;
  quantity?: number;
  materialId?: string | null;
  grainDir?: GrainDirection | null;
  edgeBanding?: Partial<EdgeBanding> | null;
  cutParams?: Partial<CutParams> | null;
  assemblyGroup?: AssemblyGroup | null;
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
