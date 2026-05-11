// Re-export the singleton from @woodcraft/db so all route handlers
// share the same PrismaClient instance across hot reloads in dev.
export { prisma } from "@woodcraft/db";
