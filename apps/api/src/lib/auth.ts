import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { TokenPayload } from "@woodcraft/shared";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES ?? "15m";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? "7d";

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error(
    "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in environment"
  );
}

const enc = new TextEncoder();
const accessKey = enc.encode(ACCESS_SECRET);
const refreshKey = enc.encode(REFRESH_SECRET);

type BasePayload = Omit<TokenPayload, "iat" | "exp">;

export async function signAccessToken(payload: BasePayload): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRES)
    .sign(accessKey);
}

export async function signRefreshToken(payload: BasePayload): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRES)
    .sign(refreshKey);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, accessKey);
  return payload as unknown as TokenPayload;
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, refreshKey);
  return payload as unknown as TokenPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export const hashToken = hashPassword;
export const compareToken = comparePassword;

export function makeOrgSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
