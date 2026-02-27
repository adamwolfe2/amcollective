/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
  serverExternalPackages: ["@neondatabase/serverless"],
};

export default nextConfig;
