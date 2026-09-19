import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // TMDB serves every poster/still/backdrop off this one CDN host.
    remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" }],
  },
};

export default nextConfig;
