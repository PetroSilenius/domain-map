import * as MapLibreGL from "maplibre-gl";

/**
 * Serves MapLibre's web worker from our own origin.
 *
 * mapcn's map component falls back to unpkg for the worker, but only if no URL
 * has been set yet. Importing this module before `@/components/ui/map` claims
 * that slot first, which keeps the fix working across `shadcn add` updates that
 * rewrite the component.
 *
 * `scripts/copy-maplibre-worker.mjs` puts the file in `public/` and keeps it in
 * step with the installed maplibre-gl version.
 */
if (typeof window !== "undefined" && !MapLibreGL.getWorkerUrl()) {
  MapLibreGL.setWorkerUrl("/maplibre-gl-worker.mjs");
}
