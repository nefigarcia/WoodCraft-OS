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
  metadata: z.record(z.unknown()).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z
    .enum(["draft", "in_review", "approved", "in_production", "complete"])
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── Rooms ────────────────────────────────────────────────────────────────────

export const createRoomSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  width: z.number().positive("Width must be positive"),
  height: z.number().positive("Height must be positive"),
  depth: z.number().positive("Depth must be positive"),
  metadata: z.record(z.unknown()).optional(),
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
  parameters: z.record(z.unknown()).default({}),
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
  parameters: z.record(z.unknown()).optional(),
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
  metadata: z.record(z.unknown()).optional(),
});

export const updateMaterialSchema = createMaterialSchema.partial();

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
