// HTTP clients for internal AWS-hosted services.
// Vercel API routes call these to delegate heavy work.

const CAD_URL = process.env.CAD_SERVICE_URL ?? "http://localhost:8001";
const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8002";
const CNC_URL = process.env.CNC_SERVICE_URL ?? "http://localhost:8003";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "";
const TIMEOUT_MS = 30_000;

async function post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": INTERNAL_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status}: ${err}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

async function postBytes(baseUrl: string, path: string, body: unknown): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": INTERNAL_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status}: ${err}`);
    }
    return res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

// ─── CAD Service Types ────────────────────────────────────────────────────────

export interface CadGeometryRequest {
  cabinet_id: string;
  type: string;
  width: number;
  height: number;
  depth: number;
  parameters: Record<string, unknown>;
  material_thickness?: number;
}

export interface CadPart {
  name: string;
  part_type: string;
  width: number;
  height: number;
  thickness: number;
  quantity: number;
  grain_dir?: string | null;
  edge_banding?: Record<string, boolean> | null;
  cut_params?: Record<string, unknown> | null;
}

export interface CadGeometryResponse {
  cabinet_id: string;
  parts: CadPart[];
  step_file_url: string | null;
  warnings: string[];
}

// ─── AI Service Types ─────────────────────────────────────────────────────────

export interface AiValidationRequest {
  cabinet: {
    cabinet_id: string;
    type: string;
    width: number;
    height: number;
    depth: number;
    parameters: Record<string, unknown>;
    parts: CadPart[];
  };
  room_width?: number;
  room_height?: number;
}

export interface AiValidationIssue {
  code: string;
  message: string;
  field: string | null;
  severity: "error" | "warning";
}

export interface AiValidationResponse {
  cabinet_id: string;
  status: "pass" | "warning" | "fail";
  errors: AiValidationIssue[];
  warnings: AiValidationIssue[];
  ai_model: string | null;
  raw_response: Record<string, unknown> | null;
}

// ─── CNC Service Types ────────────────────────────────────────────────────────

export interface CncGcodeRequest {
  jobId: string;
  machineProfile: { postProcessor: string; config: Record<string, unknown> };
  parts: Array<{
    name: string;
    width: number;
    height: number;
    thickness: number;
    quantity: number;
  }>;
}

export interface CncGcodeResponse {
  jobId: string;
  gcode: string;
  lineCount: number;
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export const cadService = {
  computeGeometry: (req: CadGeometryRequest) =>
    post<CadGeometryResponse>(CAD_URL, "/cabinets/geometry", req),
  exportStep: (cabinetId: string, req: CadGeometryRequest) =>
    postBytes(CAD_URL, `/cabinets/${cabinetId}/step`, req),
  exportDrawing: (cabinetId: string, req: CadGeometryRequest) =>
    postBytes(CAD_URL, `/cabinets/${cabinetId}/drawing`, req),
  exportMesh: (cabinetId: string, req: CadGeometryRequest) =>
    postBytes(CAD_URL, `/cabinets/${cabinetId}/mesh`, req),
};

export const aiService = {
  validateCabinet: (req: AiValidationRequest) =>
    post<AiValidationResponse>(AI_URL, "/validate/cabinet", req),
};

export const cncService = {
  generateGcode: (req: CncGcodeRequest) =>
    post<CncGcodeResponse>(CNC_URL, "/gcode/generate", req),
};
