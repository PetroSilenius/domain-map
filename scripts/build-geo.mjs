// Regenerates the map geometry that ships with the app.
//
//   node scripts/build-geo.mjs
//
// Pulls Natural Earth 50m data, simplifies it enough to stream quickly to the
// browser, and writes two artefacts:
//
//   public/world.geojson          country polygons, keyed by ISO 3166-1 alpha-2
//   src/data/country-points.json  one representative point per country
//
// The point file exists because a globe cannot render Tuvalu or Niue at any
// useful size, yet those are some of the more interesting ccTLDs. Countries
// whose polygons are too small to see get a dot instead.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const NE = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson";
const COUNTRIES = `${NE}/ne_50m_admin_0_countries.geojson`;
const MAP_UNITS = `${NE}/ne_50m_admin_0_map_units.geojson`;

/** Simplification tolerance in degrees. ~5km — invisible at globe zoom. */
const TOLERANCE = 0.05;
/** Rings smaller than this (square degrees) are dropped unless they are a feature's only ring. */
const MIN_RING_AREA = 0.004;
/** Countries with less than this total area (square degrees) are too small to click on a globe, so they get a dot. */
const DOT_AREA_THRESHOLD = 2.5;
const PRECISION = 2;

// Natural Earth encodes "no ISO code assigned" as -99. Every one of these is a
// place people actually register domains in, so they are patched by hand.
const ISO_FIXES = {
  "Kosovo": "XK",
  // Disputed territories are folded into the country whose registry runs the
  // ccTLD, so the globe has no holes in it.
  "N. Cyprus": "CY",
  "Somaliland": "SO",
  "Indian Ocean Ter.": "CC",
  "Ashmore and Cartier Is.": "AU",
  "Siachen Glacier": "IN",
};

// Two ISO codes have no Natural Earth feature at all. Both registries are
// closed, but the map claims to cover every country, so they get a point.
const MANUAL_POINTS = {
  BV: { lon: 3.35, lat: -54.42 },  // Bouvet Island
  UM: { lon: 166.63, lat: 19.28 }, // US Minor Outlying Islands (Wake Island)
};

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function perpendicularDistance([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / Math.hypot(dx, dy);
}

/** Ramer-Douglas-Peucker, iterative so that long coastlines cannot blow the stack. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const distance = perpendicularDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Shoelace area of a ring, in square degrees. Sign is discarded. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

function round(coordinate) {
  return coordinate.map(([x, y]) => [
    Number(x.toFixed(PRECISION)),
    Number(y.toFixed(PRECISION)),
  ]);
}

/** Simplifies one ring, keeping it a closed polygon of at least four points. */
function processRing(ring) {
  let simplified = simplify(ring, TOLERANCE);
  if (simplified.length < 4) {
    // Too small to survive simplification — fall back to the ring's bounding box
    // so the shape still occupies space on the map.
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const [x1, x2] = [Math.min(...xs), Math.max(...xs)];
    const [y1, y2] = [Math.min(...ys), Math.max(...ys)];
    simplified = [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
  }
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) simplified.push(first);
  return round(simplified);
}

/** Returns { polygons, area } for one feature, dropping negligible islands. */
function processGeometry(geometry) {
  const source =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  const scored = source
    .map((polygon) => ({ polygon, area: ringArea(polygon[0]) }))
    .sort((a, b) => b.area - a.area);

  const kept = scored.filter((p, i) => i === 0 || p.area >= MIN_RING_AREA);
  const totalArea = scored.reduce((sum, p) => sum + p.area, 0);

  const polygons = kept.map(({ polygon }) =>
    polygon.map(processRing).filter((ring) => ring.length >= 4),
  );

  return { polygons: polygons.filter((p) => p.length > 0), area: totalArea };
}

function isoOf(properties) {
  const code = properties.ISO_A2_EH ?? properties.ISO_A2;
  if (code && code !== "-99") return code;
  return ISO_FIXES[properties.NAME] ?? null;
}

/** Centroid of a ring, weighted by area, so it lands inside concave shapes more often. */
function ringCentroid(ring) {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    area += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  area /= 2;
  if (area === 0) return ring[0];
  return [cx / (6 * area), cy / (6 * area)];
}

async function main() {
  const root = path.resolve(import.meta.dirname, "..");
  console.log("Fetching Natural Earth data...");
  const [countries, mapUnits] = await Promise.all([
    getJson(COUNTRIES),
    getJson(MAP_UNITS),
  ]);

  const features = [];
  const areas = new Map();

  for (const feature of countries.features) {
    const iso = isoOf(feature.properties);
    if (!iso) {
      console.warn(`  skipping (no ISO code): ${feature.properties.NAME}`);
      continue;
    }
    const { polygons, area } = processGeometry(feature.geometry);
    if (polygons.length === 0) continue;

    areas.set(iso, (areas.get(iso) ?? 0) + area);
    features.push({
      type: "Feature",
      // MapLibre's promoteId needs a value it can use as a feature id, and the
      // ISO code doubles as the join key against the ccTLD table.
      properties: { iso, name: feature.properties.NAME, area },
      geometry:
        polygons.length === 1
          ? { type: "Polygon", coordinates: polygons[0] }
          : { type: "MultiPolygon", coordinates: polygons },
    });
  }

  // Merge duplicate ISO codes (Natural Earth splits a few countries into
  // several features) so each country is a single joinable feature.
  const merged = new Map();
  for (const feature of features) {
    const existing = merged.get(feature.properties.iso);
    if (!existing) {
      merged.set(feature.properties.iso, feature);
      continue;
    }
    const toMulti = (g) =>
      g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    existing.geometry = {
      type: "MultiPolygon",
      coordinates: [...toMulti(existing.geometry), ...toMulti(feature.geometry)],
    };
    // The larger part names the country, so folding Somaliland into Somalia
    // does not relabel the whole country.
    if (feature.properties.area > existing.properties.area) {
      existing.properties.name = feature.properties.name;
    }
    existing.properties.area += feature.properties.area;
  }

  for (const feature of merged.values()) delete feature.properties.area;

  const world = {
    type: "FeatureCollection",
    features: [...merged.values()],
  };

  // Representative points come from map units, which cover ~10 more territories
  // than the countries file and split them more finely.
  const points = {};
  for (const feature of mapUnits.features) {
    const iso = isoOf(feature.properties);
    if (!iso) continue;
    const rings =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates[0]]
        : feature.geometry.coordinates.map((p) => p[0]);
    const largest = rings.sort((a, b) => ringArea(b) - ringArea(a))[0];
    const area = rings.reduce((sum, r) => sum + ringArea(r), 0);
    const existing = points[iso];
    if (existing && existing.area >= area) continue;
    const [lon, lat] = ringCentroid(largest);
    points[iso] = {
      area,
      lon: Number(lon.toFixed(PRECISION)),
      lat: Number(lat.toFixed(PRECISION)),
    };
  }

  for (const [iso, point] of Object.entries(MANUAL_POINTS)) {
    points[iso] ??= { ...point, area: 0 };
  }

  const countryPoints = {};
  for (const [iso, point] of Object.entries(points).sort()) {
    const area = Math.max(point.area, areas.get(iso) ?? 0);
    countryPoints[iso] = {
      lon: point.lon,
      lat: point.lat,
      // Countries that are hard to see on a globe get a dot marker.
      dot: area < DOT_AREA_THRESHOLD,
    };
  }

  await mkdir(path.join(root, "src/data"), { recursive: true });
  const worldJson = JSON.stringify(world);
  await writeFile(path.join(root, "public/world.geojson"), worldJson);
  await writeFile(
    path.join(root, "src/data/country-points.json"),
    JSON.stringify(countryPoints, null, 2) + "\n",
  );

  const dots = Object.values(countryPoints).filter((p) => p.dot).length;
  console.log(
    `public/world.geojson         ${world.features.length} countries, ${(worldJson.length / 1024).toFixed(0)} KB`,
  );
  console.log(
    `src/data/country-points.json ${Object.keys(countryPoints).length} points (${dots} drawn as dots)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
