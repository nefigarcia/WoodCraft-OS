/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@woodcraft/shared", "@woodcraft/db"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
};

export default nextConfig;
