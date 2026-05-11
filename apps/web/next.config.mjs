/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@woodcraft/shared"],
  experimental: {
    optimizePackageImports: ["three", "@react-three/fiber", "@react-three/drei"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;
