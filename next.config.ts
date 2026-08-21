import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The world geometry is ~470 KB and changes only when
        // `npm run build:geo` regenerates it, so it is worth caching hard.
        // Not `immutable`, since the filename carries no content hash.
        source: "/world.geojson",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=604800",
          },
        ],
      },
      {
        // Copied out of node_modules at build time and pinned to the installed
        // maplibre-gl version, so it only changes when that dependency does.
        source: "/:file(maplibre-gl-(?:worker|shared)\\.mjs)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
