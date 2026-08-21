"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RegistryRecord } from "@/lib/registry-lookup";
import { COUNTRIES, REGISTRABLE, type Country } from "@/lib/countries";
import { domainFor } from "@/data/cctlds";
import {
  deriveStatus,
  type DomainResult,
  type DomainStatus,
} from "@/lib/domain-status";
import { fingerprint, guessOwnership } from "@/lib/ownership";
import type { Project } from "@/lib/project";

/** Must not exceed the API route's own per-request cap. */
const BATCH_SIZE = 40;
/** Batches in flight at once. Three keeps a full world scan under ~10s. */
const PARALLEL_BATCHES = 3;

export type ScanState = {
  /** Registry facts, keyed by domain name. */
  records: Record<string, RegistryRecord>;
  /** 0 to 1 across the countries being scanned. */
  progress: number;
  scanning: boolean;
  error: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchBatch(
  domains: string[],
  signal: AbortSignal,
): Promise<Record<string, RegistryRecord>> {
  const response = await fetch("/api/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ domains }),
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Lookup failed (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { results: Record<string, RegistryRecord> };
  return body.results;
}

/**
 * Runs the world scan and keeps the accumulated registry answers.
 *
 * Results stream in batch by batch rather than landing all at once: a full
 * sweep is ~230 domains across registries that answer at very different
 * speeds, and watching the globe fill in beats watching a spinner.
 */
export function useScan(project: Project) {
  const [state, setState] = useState<ScanState>({
    records: {},
    progress: 0,
    scanning: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  // Abandon an in-flight scan if the component goes away mid-sweep.
  useEffect(() => () => abortRef.current?.abort(), []);

  const scan = useCallback(async (brand: string, owned: string[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const targets = REGISTRABLE.map((country) => domainFor(brand, country)).filter(
      (domain): domain is string => domain !== null,
    );
    // The domains you listed are looked up first and separately: their
    // nameservers and registrant are what every other guess is compared to.
    const ordered = [...new Set([...owned, ...targets])];

    setState({ records: {}, progress: 0, scanning: true, error: null });

    const batches = chunk(ordered, BATCH_SIZE);
    let done = 0;
    let failed = 0;

    try {
      for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
        const wave = batches.slice(i, i + PARALLEL_BATCHES);
        const settled = await Promise.allSettled(
          wave.map((batch) => fetchBatch(batch, controller.signal)),
        );
        if (controller.signal.aborted) return;

        const merged: Record<string, RegistryRecord> = {};
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") {
            Object.assign(merged, result.value);
          } else {
            // One failed batch should not sink the scan; mark its domains
            // unknown and keep going.
            failed += wave[index].length;
            for (const domain of wave[index]) {
              merged[domain] = {
                domain,
                registration: "unknown",
                source: "dns",
                confidence: "low",
                error: "Lookup failed",
              };
            }
          }
        });

        done += wave.reduce((sum, batch) => sum + batch.length, 0);
        setState((previous) => ({
          ...previous,
          records: { ...previous.records, ...merged },
          progress: done / ordered.length,
        }));
      }

      setState((previous) => ({
        ...previous,
        scanning: false,
        progress: 1,
        error: failed
          ? `${failed} ${failed === 1 ? "domain" : "domains"} could not be checked.`
          : null,
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((previous) => ({
        ...previous,
        scanning: false,
        error: error instanceof Error ? error.message : "Scan failed.",
      }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((previous) => ({ ...previous, scanning: false }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ records: {}, progress: 0, scanning: false, error: null });
  }, []);

  /** One row per country, ready to paint and to list. */
  const results = useMemo(
    () => deriveResults(project, state.records),
    [project, state.records],
  );

  return { ...state, scan, cancel, reset, results };
}

export type CountryResult = DomainResult & { country: Country };

/**
 * Turns raw registry answers into a status per country, applying the ownership
 * guess and then any manual correction on top of it.
 */
export function deriveResults(
  project: Project,
  records: Record<string, RegistryRecord>,
): Map<string, CountryResult> {
  const listed = new Set(project.owned);
  const profile = fingerprint(
    project.brand,
    project.owned.map((domain) => records[domain]).filter(Boolean),
  );

  const results = new Map<string, CountryResult>();

  for (const country of COUNTRIES) {
    const domain = project.brand ? domainFor(project.brand, country) : null;

    if (!domain || country.eligibility === "closed") {
      results.set(country.iso, {
        country,
        iso: country.iso,
        domain,
        status: "closed",
        source: "policy",
        confidence: "high",
      });
      continue;
    }

    const record = records[domain];
    if (!record) {
      results.set(country.iso, {
        country,
        iso: country.iso,
        domain,
        status: "pending",
        source: "none",
        confidence: "high",
      });
      continue;
    }

    const guess = guessOwnership(record, profile, listed);
    const override = project.overrides[country.iso];
    const ownership = override ?? guess.ownership;

    results.set(country.iso, {
      country,
      iso: country.iso,
      domain,
      status: deriveStatus({
        eligibility: country.eligibility,
        hasSuffix: true,
        registration: record.registration,
        ownership,
      }),
      source: listed.has(domain) ? "listed" : record.source,
      confidence: record.confidence,
      registrant: record.registrant,
      nameservers: record.nameservers,
      registeredOn: record.registeredOn,
      expiresOn: record.expiresOn,
      error: record.error,
      ownershipReason: override
        ? override === "yours"
          ? "You marked this as yours."
          : "You marked this as not yours."
        : guess.reason,
    });
  }

  return results;
}

/** Counts per status, for the legend and the summary line. */
export function countByStatus(
  results: Map<string, CountryResult>,
): Record<DomainStatus, number> {
  const counts = {
    owned: 0,
    taken: 0,
    available: 0,
    restricted: 0,
    closed: 0,
    unknown: 0,
    pending: 0,
  } satisfies Record<DomainStatus, number>;
  for (const result of results.values()) counts[result.status] += 1;
  return counts;
}
