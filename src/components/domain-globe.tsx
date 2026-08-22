"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
} from "maplibre-gl";
// Imported for its side effect, and before the map component: it points
// MapLibre at a self-hosted web worker instead of the CDN default.
import "@/lib/maplibre-worker";
// Aliased: the component name would otherwise shadow the global `Map` type,
// which this file uses for the per-country results.
import {
  Map as MapCanvas,
  MapControls,
  MapGeoJSON,
  useMap,
  type MapRef,
} from "@/components/ui/map";
import { COUNTRIES, flagFor } from "@/lib/countries";
import {
  FILL_OPACITY,
  FILL_OPACITY_DIMMED,
  FILL_OPACITY_HOVER,
  STATUS_META,
  type DomainStatus,
} from "@/lib/domain-status";
import { StatusDot } from "@/components/status-badge";
import { GLOBE_STYLES, OUTLINE } from "@/lib/globe-style";
import type { CountryResult } from "@/lib/use-scan";

type Theme = "light" | "dark";

/** Country properties carried on each feature in `public/world.geojson`. */
type WorldProperties = { iso: string; name: string };

/**
 * Builds a `match` expression that colours every country by its status.
 *
 * Countries are grouped by status first so the expression has one branch per
 * status rather than one per country — MapLibre accepts an array of labels per
 * branch, which turns ~240 branches into six.
 */
function colorExpression(
  results: Map<string, CountryResult>,
  theme: Theme,
): DataDrivenPropertyValueSpecification<string> {
  const byStatus = new Map<DomainStatus, string[]>();
  for (const [iso, result] of results) {
    const group = byStatus.get(result.status);
    if (group) group.push(iso);
    else byStatus.set(result.status, [iso]);
  }

  const branches: (string[] | string)[] = [];
  for (const [status, isos] of byStatus) {
    if (status === "pending" || isos.length === 0) continue; // pending is the default
    branches.push(isos, STATUS_META[status].color[theme]);
  }

  const fallback = STATUS_META.pending.color[theme];
  if (branches.length === 0) return fallback;

  return [
    "match",
    ["get", "iso"],
    ...branches,
    fallback,
  ] as unknown as ExpressionSpecification;
}

/**
 * Builds the `fill-opacity` expression that carries the legend filter onto the
 * map: countries matching a selected status stay solid, everything else fades
 * back into the ocean. Without this the filter only narrowed the list, which is
 * the half of the answer you can already read.
 */
function opacityExpression(
  results: Map<string, CountryResult>,
  statusFilter: Set<DomainStatus>,
): DataDrivenPropertyValueSpecification<number> {
  if (statusFilter.size === 0) return FILL_OPACITY;

  const highlighted: string[] = [];
  for (const [iso, result] of results) {
    if (statusFilter.has(result.status)) highlighted.push(iso);
  }
  // `match` needs at least one branch, and a filter that selects nothing should
  // dim the whole globe rather than throw.
  if (highlighted.length === 0) return FILL_OPACITY_DIMMED;

  return [
    "match",
    ["get", "iso"],
    highlighted,
    FILL_OPACITY,
    FILL_OPACITY_DIMMED,
  ] as unknown as ExpressionSpecification;
}

/**
 * Dots for the countries that cannot be seen or clicked as polygons.
 *
 * About 100 of the world's ccTLDs belong to islands and microstates that are
 * sub-pixel on a globe — .tv, .io, .fm, .ai, .nu — and those are exactly the
 * ones people look for. mapcn's GeoJSON layer draws fills and outlines, so this
 * drops to the MapLibre instance for a circle layer, which is what `useMap` is
 * there for.
 */
function CountryDots({
  results,
  statusFilter,
  onSelect,
  onHover,
}: {
  results: Map<string, CountryResult>;
  statusFilter: Set<DomainStatus>;
  onSelect: (iso: string) => void;
  onHover: (iso: string | null) => void;
}) {
  const { map, isLoaded, resolvedTheme } = useMap();

  // The click handler is registered once, on mount, so it reads the current
  // callback through a ref rather than forcing the layer to be rebuilt every
  // time the parent re-renders.
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onHoverRef.current = onHover;
  }, [onSelect, onHover]);

  const SOURCE = "country-dots";
  const LAYER = "country-dots-circles";

  // The points never change, only their colour, so the source is built once.
  const points = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: COUNTRIES.filter((country) => country.dot).map((country) => ({
        type: "Feature" as const,
        id: country.iso,
        properties: { iso: country.iso, name: country.name },
        geometry: { type: "Point" as const, coordinates: [country.lon, country.lat] },
      })),
    }),
    [],
  );

  useEffect(() => {
    if (!isLoaded || !map) return;
    if (map.getSource(SOURCE)) return;

    map.addSource(SOURCE, { type: "geojson", data: points, promoteId: "iso" });
    map.addLayer({
      id: LAYER,
      type: "circle",
      source: SOURCE,
      paint: {
        // Small enough not to crowd the globe, large enough to hit.
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 4, 5, 8, 9],
        "circle-stroke-width": 1,
      },
    });

    const handleClick = (event: { features?: { properties?: { iso?: string } }[] }) => {
      const iso = event.features?.[0]?.properties?.iso;
      if (iso) onSelectRef.current(iso);
    };
    const enter = (event: { features?: { properties?: { iso?: string } }[] }) => {
      map.getCanvas().style.cursor = "pointer";
      const iso = event.features?.[0]?.properties?.iso;
      if (iso) onHoverRef.current(iso);
    };
    const leave = () => {
      map.getCanvas().style.cursor = "";
      onHoverRef.current(null);
    };

    map.on("click", LAYER, handleClick);
    map.on("mouseenter", LAYER, enter);
    map.on("mouseleave", LAYER, leave);

    return () => {
      map.off("click", LAYER, handleClick);
      map.off("mouseenter", LAYER, enter);
      map.off("mouseleave", LAYER, leave);
      try {
        if (map.getLayer(LAYER)) map.removeLayer(LAYER);
        if (map.getSource(SOURCE)) map.removeSource(SOURCE);
      } catch {
        // The style may be reloading after a theme change.
      }
    };
  }, [isLoaded, map, points]);

  useEffect(() => {
    if (!isLoaded || !map || !map.getLayer(LAYER)) return;
    const opacity = opacityExpression(results, statusFilter);
    map.setPaintProperty(LAYER, "circle-color", colorExpression(results, resolvedTheme));
    map.setPaintProperty(LAYER, "circle-stroke-color", OUTLINE[resolvedTheme].line);
    // Dots fade with the polygons so a filtered globe reads as one picture.
    map.setPaintProperty(LAYER, "circle-opacity", opacity);
    map.setPaintProperty(LAYER, "circle-stroke-opacity", opacity);
  }, [isLoaded, map, results, statusFilter, resolvedTheme]);

  return null;
}

export type DomainGlobeProps = {
  results: Map<string, CountryResult>;
  /** Statuses selected in the legend. Empty means no filter. */
  statusFilter: Set<DomainStatus>;
  selectedIso: string | null;
  onSelect: (iso: string | null) => void;
  /** Set when the globe should rotate to a country, e.g. after a list click. */
  focusIso?: string | null;
};

export function DomainGlobe({
  results,
  statusFilter,
  selectedIso,
  onSelect,
  focusIso,
}: DomainGlobeProps) {
  const mapRef = useRef<MapRef | null>(null);
  // Handing the map the resolved theme keeps the ocean in step with the page,
  // instead of letting it read `prefers-color-scheme` on its own.
  const { resolvedTheme } = useTheme();
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);
  const hovered = hoveredIso ? results.get(hoveredIso) : undefined;

  const handleCountryClick = useCallback(
    (event: { feature: { properties: WorldProperties } }) => {
      onSelect(event.feature.properties.iso);
    },
    [onSelect],
  );

  // Rotate to whichever country the list or search selected.
  useEffect(() => {
    if (!focusIso) return;
    const country = COUNTRIES.find((c) => c.iso === focusIso);
    const map = mapRef.current;
    if (!country || !map) return;
    map.flyTo({
      center: [country.lon, country.lat],
      zoom: Math.max(map.getZoom(), country.dot ? 4 : 3),
      duration: 900,
    });
  }, [focusIso]);

  const fillPaint = useMemo(
    () => ({
      "fill-color": colorExpression(results, "light"),
      "fill-opacity": opacityExpression(results, statusFilter),
    }),
    [results, statusFilter],
  );
  const darkFillPaint = useMemo(
    () => ({
      "fill-color": colorExpression(results, "dark"),
      "fill-opacity": opacityExpression(results, statusFilter),
    }),
    [results, statusFilter],
  );

  return (
    <div className="relative size-full">
      <MapCanvas
        ref={mapRef}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        styles={GLOBE_STYLES}
        projection={{ type: "globe" }}
        center={[10, 25]}
        zoom={1.75}
        // Stops the globe shrinking into a marble surrounded by empty page.
        minZoom={1.3}
        maxZoom={9}
        className="size-full"
      >
        <GlobeLayers
          lightPaint={fillPaint}
          darkPaint={darkFillPaint}
          selectedIso={selectedIso}
          onCountryClick={handleCountryClick}
          onCountryHover={setHoveredIso}
        />
        <CountryDots
          results={results}
          statusFilter={statusFilter}
          onSelect={onSelect}
          onHover={setHoveredIso}
        />
        <MapControls position="bottom-right" showZoom />
      </MapCanvas>

      {hovered ? (
        <div className="bg-background/90 pointer-events-none absolute top-3 left-3 flex items-center gap-2.5 rounded-lg border px-3 py-2 shadow-sm backdrop-blur">
          <span className="text-lg leading-none" aria-hidden>
            {flagFor(hovered.iso)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight font-medium">
              {hovered.country.name}
            </span>
            <span className="text-muted-foreground block truncate font-mono text-xs">
              {hovered.domain ?? "no ccTLD"}
            </span>
          </span>
          <span className="flex items-center gap-1.5 pl-1 text-xs whitespace-nowrap">
            <StatusDot status={hovered.status} />
            {STATUS_META[hovered.status].label}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Split from `DomainGlobe` so it can read the resolved theme from context and
 * pick the matching palette — the map resolves `system` itself, and the page
 * has no other way to learn what it decided.
 */
function GlobeLayers({
  lightPaint,
  darkPaint,
  selectedIso,
  onCountryClick,
  onCountryHover,
}: {
  lightPaint: Record<string, unknown>;
  darkPaint: Record<string, unknown>;
  selectedIso: string | null;
  onCountryClick: (event: { feature: { properties: WorldProperties } }) => void;
  onCountryHover: (iso: string | null) => void;
}) {
  const { resolvedTheme } = useMap();
  const outline = OUTLINE[resolvedTheme];

  const linePaint = useMemo(() => {
    // An ISO code is always two letters, so the empty string never matches and
    // acts as "nothing selected".
    const selected = selectedIso ?? "";
    return {
      "line-color": [
        "case",
        ["==", ["get", "iso"], selected],
        outline.selected,
        outline.line,
      ] as ExpressionSpecification,
      "line-width": [
        "case",
        ["==", ["get", "iso"], selected],
        2,
        0.5,
      ] as ExpressionSpecification,
    };
  }, [selectedIso, outline]);

  return (
    <MapGeoJSON<WorldProperties>
      data="/world.geojson"
      id="world"
      promoteId="iso"
      interactive
      fillPaint={resolvedTheme === "dark" ? darkPaint : lightPaint}
      linePaint={linePaint}
      fillHoverPaint={{ "fill-opacity": FILL_OPACITY_HOVER }}
      onClick={onCountryClick}
      onHover={(event) => onCountryHover(event?.feature.properties.iso ?? null)}
    />
  );
}
