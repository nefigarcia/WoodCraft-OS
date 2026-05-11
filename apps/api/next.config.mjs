/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@woodcraft/shared", "@woodcraft/db"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
  // Declare all server-side env vars so Next.js doesn't warn about them.
  // AWS/Redis/service vars are only needed at runtime (Docker services),
  // not at Vercel build time — they all have ?? fallbacks in the code.
  env: {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "",
    JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES ?? "15m",
    JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES ?? "7d",
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ?? "",
    CAD_SERVICE_URL: process.env.CAD_SERVICE_URL ?? "http://localhost:8001",
    AI_SERVICE_URL: process.env.AI_SERVICE_URL ?? "http://localhost:8002",
    CNC_SERVICE_URL: process.env.CNC_SERVICE_URL ?? "http://localhost:8003",
    RENDER_SERVICE_URL: process.env.RENDER_SERVICE_URL ?? "http://localhost:8004",
    COLLAB_SERVICE_URL: process.env.COLLAB_SERVICE_URL ?? "http://localhost:8005",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "",
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME ?? "",
    S3_CDN_URL: process.env.S3_CDN_URL ?? "",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  },
};

export default nextConfig;
