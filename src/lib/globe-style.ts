import type { StyleSpecification } from "maplibre-gl";

/**
 * The globe needs a sphere to sit on. mapcn's `blank` style is transparent,
 * which is right for a flat choropleth but leaves a globe as a set of shapes
 * floating in the page background. These styles are the same tile-less canvas
 * with an ocean painted in, so land reads as land at any rotation.
 */
function ocean(color: string): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "ocean", type: "background", paint: { "background-color": color } }],
  };
}

export const GLOBE_STYLES = {
  light: ocean("#dce7f2"),
  dark: ocean("#0b1524"),
};

/** Country outlines, and the ring drawn around the selected country. */
export const OUTLINE = {
  light: { line: "#ffffff", selected: "#0f172a" },
  dark: { line: "#0b1524", selected: "#f8fafc" },
};
