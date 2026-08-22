import type { StyleSpecification } from "maplibre-gl";

/**
 * The globe needs a sphere to sit on. mapcn's `blank` style is transparent,
 * which is right for a flat choropleth but leaves a globe as a set of shapes
 * floating in the page background. These styles are the same tile-less canvas
 * with an ocean painted in.
 *
 * The ocean is neutral grey rather than blue on purpose: country fills sit
 * slightly transparent on top of it, so whatever is underneath tints every
 * status. Grey keeps the palette honest; blue would push all six toward it.
 */
function ocean(color: string): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "ocean", type: "background", paint: { "background-color": color } }],
  };
}

/**
 * The ocean is deliberately a step *lighter* than the page behind it. On a
 * near-black background an equally dark ocean makes the sphere read as a hole
 * rather than an object, and its silhouette disappears entirely wherever no
 * coastline happens to fall.
 */
export const GLOBE_STYLES = {
  light: ocean("#e3e3e7"),
  dark: ocean("#1e1e22"),
};

/** Country outlines, and the ring drawn around the selected country. */
/**
 * Borders are drawn in the ocean colour, so they vanish at the coast and show
 * up only where two countries meet — which is the only place they carry
 * information.
 */
export const OUTLINE = {
  light: { line: "#e3e3e7", selected: "#18181b" },
  dark: { line: "#1e1e22", selected: "#fafafa" },
};
