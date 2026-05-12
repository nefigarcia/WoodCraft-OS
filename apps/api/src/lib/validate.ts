import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  orgName: z.string().min(2, "Company name must be at least 2 characters").max(255),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

export function parseBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message ?? "Validation error",
    };
  }
  return { success: true, data: result.data };
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export const createClientSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  address: z.string().max(2000).optional(),
  notes: z.string().optional(),
});

export const updateClientSchema = createClientSchema.partial();

// ─── Projects ─────────────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  clientId: z.string().cuid("Invalid client ID"),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z
    .enum(["draft", "in_review", "approved", "in_production", "complete"])
    .optional(),
  metadata: z.record(z.any()).optional(),
});

// ─── Rooms ────────────────────────────────────────────────────────────────────

export const createRoomSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  width: z.number().positive("Width must be positive"),
  height: z.number().positive("Height must be positive"),
  depth: z.number().positive("Depth must be positive"),
  metadata: z.record(z.any()).optional(),
});

export const updateRoomSchema = createRoomSchema.partial();

// ─── Cabinets ─────────────────────────────────────────────────────────────────

export const CABINET_TYPES = ["base", "wall", "tall", "corner", "island"] as const;

export const createCabinetSchema = z.object({
  type: z.enum(CABINET_TYPES),
  name: z.string().min(1, "Name is required").max(255),
  width: z.number().positive("Width must be positive"),
  height: z.number().positive("Height must be positive"),
  depth: z.number().positive("Depth must be positive"),
  posX: z.number().default(0),
  posY: z.number().default(0),
  posZ: z.number().default(0),
  parameters: z.record(z.any()).default({}),
  materialId: z.string().cuid().optional(),
});

export const updateCabinetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  posX: z.number().optional(),
  posY: z.number().optional(),
  posZ: z.number().optional(),
  // Merged (not replaced) into existing parameters
  parameters: z.record(z.any()).optional(),
  materialId: z.string().cuid().nullable().optional(),
});

// ─── Materials ────────────────────────────────────────────────────────────────

export const MATERIAL_TYPES = [
  "plywood",
  "mdf",
  "solid_wood",
  "melamine",
  "laminate",
] as const;

export const createMaterialSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(MATERIAL_TYPES),
  thickness: z.number().positive(),
  sheetWidth: z.number().positive(),
  sheetHeight: z.number().positive(),
  costPerSheet: z.number().min(0),
  supplier: z.string().max(255).optional(),
  sku: z.string().max(100).optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateMaterialSchema = createMaterialSchema.partial();

// ─── Machine Profiles ────────────────────────────────────────────────────────

export const MACHINE_TYPES = ["cnc_router", "panel_saw", "edge_bander"] as const;

export const createMachineProfileSchema = z.object({
  name: z.string().min(1).max(255),
  manufacturer: z.string().min(1).max(255),
  model: z.string().min(1).max(255),
  type: z.enum(MACHINE_TYPES),
  config: z.record(z.any()).default({}),
  postProcessor: z.string().min(1).max(100),
});

export const updateMachineProfileSchema = createMachineProfileSchema.partial();

// ─── CNC Export ───────────────────────────────────────────────────────────────

export const cncExportSchema = z.object({
  machineProfileId: z.string().cuid("Invalid machine profile ID"),
  roomIds: z.array(z.string().cuid()).optional(), // undefined = all rooms
  format: z.enum(["gcode", "dxf", "both"]).default("both"),
});

// ─── Quotes ──────────────────────────────────────────────────────────────────

export const quoteLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
});

export const createQuoteSchema = z.object({
  lineItems: z.array(quoteLineItemSchema).min(1, "At least one line item is required"),
  taxRate: z.number().min(0).max(1).default(0),
  notes: z.string().optional(),
  validUntil: z.string().datetime().optional(),
});

export const updateQuoteSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
  lineItems: z.array(quoteLineItemSchema).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
  validUntil: z.string().datetime().nullable().optional(),
});

// ─── Revisions ────────────────────────────────────────────────────────────────

export const createRevisionSchema = z.object({
  message: z.string().max(500).optional(),
});

// ─── Hardware ────────────────────────────────────────────────────────────────

export const HARDWARE_TYPES = [
  "hinge",
  "drawer_slide",
  "handle",
  "screw",
  "cam_lock",
  "shelf_pin",
  "soft_close",
  "other",
] as const;

export const createHardwareSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(HARDWARE_TYPES),
  sku: z.string().max(100).optional(),
  supplier: z.string().max(255).optional(),
  costPerUnit: z.number().min(0),
  metadata: z.record(z.any()).optional(),
});

export const updateHardwareSchema = createHardwareSchema.partial();

// ─── Installer Feedback ───────────────────────────────────────────────────────

export const createFeedbackSchema = z.object({
  cabinetId: z.string().cuid().optional(),
  reportedBy: z.string().min(1, "Reporter name is required").max(255),
  severity: z.enum(["info", "warning", "error"]),
  category: z.enum(["dimension_mismatch", "missing_part", "hardware_issue", "other"]),
  description: z.string().min(1, "Description is required"),
  photoUrls: z.array(z.string().url()).optional(),
});

export const updateFeedbackSchema = z.object({
  resolved: z.boolean().optional(),
  severity: z.enum(["info", "warning", "error"]).optional(),
});

// ─── Production Runs ──────────────────────────────────────────────────────────

export const createProductionRunSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const updateProductionRunSchema = z.object({
  status: z.enum(["scheduled", "in_progress", "complete", "cancelled"]).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  notes: z.string().optional(),
});

// ─── Team / User Management ──────────────────────────────────────────────────

export const inviteTeamMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(["admin", "designer", "viewer"]),
  temporaryPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateTeamMemberSchema = z.object({
  role: z.enum(["admin", "designer", "viewer"]),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type CreateCabinetInput = z.infer<typeof createCabinetSchema>;
export type UpdateCabinetInput = z.infer<typeof updateCabinetSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type CreateMachineProfileInput = z.infer<typeof createMachineProfileSchema>;
export type CncExportInput = z.infer<typeof cncExportSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type CreateHardwareInput = z.infer<typeof createHardwareSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type CreateProductionRunInput = z.infer<typeof createProductionRunSchema>;
export type UpdateProductionRunInput = z.infer<typeof updateProductionRunSchema>;
