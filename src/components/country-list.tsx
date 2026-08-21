"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { flagFor } from "@/lib/countries";
import { STATUS_META, type DomainStatus } from "@/lib/domain-status";
import { StatusDot } from "@/components/status-badge";
import type { CountryResult } from "@/lib/use-scan";

/**
 * Folds accents away so "aland" finds Åland and "curacao" finds Curaçao —
 * nobody reaches for the diacritic when they are searching.
 */
function foldAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Free first, then the ones with strings attached, then everything settled. */
const SORT_WEIGHT: Record<DomainStatus, number> = {
  available: 0,
  restricted: 1,
  owned: 2,
  unknown: 3,
  pending: 4,
  taken: 5,
  closed: 6,
};

export function CountryList({
  results,
  query,
  statusFilter,
  selectedIso,
  onSelect,
}: {
  results: Map<string, CountryResult>;
  query: string;
  statusFilter: Set<DomainStatus>;
  selectedIso: string | null;
  onSelect: (iso: string) => void;
}) {
  const rows = useMemo(() => {
    const needle = foldAccents(query.trim());
    return [...results.values()]
      .filter((result) => {
        if (statusFilter.size && !statusFilter.has(result.status)) return false;
        if (!needle) return true;
        return (
          foldAccents(result.country.name).includes(needle) ||
          result.country.iso.toLowerCase().includes(needle) ||
          (result.domain?.includes(needle) ?? false)
        );
      })
      .sort(
        (a, b) =>
          SORT_WEIGHT[a.status] - SORT_WEIGHT[b.status] ||
          a.country.name.localeCompare(b.country.name),
      );
  }, [results, query, statusFilter]);

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground px-3 py-8 text-center text-sm">
        No countries match.
      </p>
    );
  }

  return (
    <ul className="divide-border/60 divide-y">
      {rows.map((result) => (
        <li key={result.iso}>
          <button
            type="button"
            onClick={() => onSelect(result.iso)}
            className={cn(
              "hover:bg-accent flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
              selectedIso === result.iso && "bg-accent",
            )}
          >
            <span className="text-base leading-none" aria-hidden>
              {flagFor(result.iso)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{result.country.name}</span>
              <span className="text-muted-foreground block truncate font-mono text-xs">
                {result.domain ?? "no ccTLD"}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {result.confidence === "low" && result.status !== "closed" ? (
                <span
                  className="text-muted-foreground text-[10px]"
                  title="Inferred from DNS — not confirmed by a registry"
                >
                  ?
                </span>
              ) : null}
              <StatusDot status={result.status} />
              <span className="text-muted-foreground w-16 text-right text-xs">
                {STATUS_META[result.status].label}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
