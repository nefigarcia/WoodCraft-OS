export type UserRole = "owner" | "admin" | "designer" | "viewer";

export interface TokenPayload {
  userId: string;
  orgId: string;
  role: UserRole;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  orgId: string;
}

export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface AuthResponse {
  user: AuthUser;
  org: AuthOrg;
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}
