export type ProjectStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "in_production"
  | "complete";

export type ProductionRunStatus =
  | "scheduled"
  | "in_progress"
  | "complete"
  | "cancelled";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export interface Client {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  projectId: string;
  orgId: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  orgId: string;
  clientId: string;
  client?: Pick<Client, "id" | "name" | "email">;
  name: string;
  description: string | null;
  status: ProjectStatus;
  metadata: Record<string, unknown> | null;
  rooms?: Room[];
  createdAt: string;
  updatedAt: string;
}

export interface QuoteLineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  id: string;
  orgId: string;
  projectId: string;
  userId: string;
  status: QuoteStatus;
  validUntil: string | null;
  lineItems: QuoteLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstallerFeedback {
  id: string;
  orgId: string;
  projectId: string;
  cabinetId: string | null;
  reportedBy: string;
  severity: "info" | "warning" | "error";
  category: "dimension_mismatch" | "missing_part" | "hardware_issue" | "other";
  description: string;
  photoUrls: string[];
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
