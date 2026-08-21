// Copies MapLibre's web worker out of node_modules and into public/.
//
// mapcn's map component defaults to loading the worker from unpkg, pinned to
// the installed maplibre-gl version. That makes the map depend on a third-party
// CDN at runtime: if unpkg is unreachable or a Content-Security-Policy blocks
// it, the worker never loads and the map renders an empty canvas with no error.
// Serving it from our own origin removes that failure mode.
//
// Runs from `predev`, `prebuild`, and `postinstall`, so the copy always matches
// the installed version. `src/lib/maplibre-worker.ts` points MapLibre at it.

import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

// The worker is an ES module that imports a shared chunk from alongside itself,
// so both files have to land in public/ or the worker fails to start and the
// map renders nothing.
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

const dist = path.dirname(require.resolve("maplibre-gl/package.json"));
const publicDir = path.resolve(import.meta.dirname, "../public");

await mkdir(publicDir, { recursive: true });

for (const file of FILES) {
  await copyFile(path.join(dist, "dist", file), path.join(publicDir, file));
  // Source maps are optional; a pruned production install may not ship them.
  try {
    await copyFile(
      path.join(dist, "dist", `${file}.map`),
      path.join(publicDir, `${file}.map`),
    );
  } catch {
    // Nothing to copy.
  }
}

console.log(`Copied ${FILES.join(", ")} to public/`);
