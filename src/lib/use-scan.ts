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

export type ScanState = {
  /** Registry facts, keyed by domain name. */
  records: Record<string, RegistryRecord>;
  /** 0 to 1 across the countries being scanned. */
  progress: number;
  scanning: boolean;
  error: string | null;
};

/**
 * Runs the world scan and keeps the accumulated registry answers.
 *
 * One streaming request covers the whole scan. `/api/lookup` writes back a
 * line of JSON per domain as each lookup finishes rather than waiting to
 * collect a full response — a world sweep is ~230 domains against registries
 * that answer at wildly different speeds, and the fastest of them land well
 * under a second. Waiting for a batch to fully resolve before painting
 * anything, the previous design, meant the whole UI sat idle until the
 * single slowest lookup in that batch finished.
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
    // The domains you listed are sent first: their nameservers and
    // registrant are what every other guess gets compared to, though the
    // server processes the whole list concurrently regardless of order.
    const ordered = [...new Set([...owned, ...targets])];

    setState({ records: {}, progress: 0, scanning: true, error: null });

    const received: Record<string, RegistryRecord> = {};
    let failed = 0;

    /** One place to fill in whatever never got a line — a clean stream end short of the full list, or a request that failed outright. */
    function fillMissing(message: string) {
      for (const domain of ordered) {
        if (domain in received) continue;
        failed++;
        received[domain] = {
          domain,
          registration: "unknown",
          source: "dns",
          confidence: "low",
          error: message,
        };
      }
    }

    try {
      const response = await fetch("/api/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domains: ordered }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? `Lookup failed (HTTP ${response.status})`);
      }
      if (!response.body) throw new Error("This browser can't stream the response.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // A read() chunk can split a line across two reads, so the trailing
      // partial line is held over rather than parsed early.
      let carry = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        carry += decoder.decode(value, { stream: true });
        const lines = carry.split("\n");
        carry = lines.pop() ?? "";
        if (lines.length === 0) continue;

        for (const line of lines) {
          if (!line) continue;
          const record = JSON.parse(line) as RegistryRecord;
          received[record.domain] = record;
        }
        setState((previous) => ({
          ...previous,
          records: { ...received },
          progress: Object.keys(received).length / ordered.length,
        }));
      }
      if (carry.trim()) {
        const record = JSON.parse(carry) as RegistryRecord;
        received[record.domain] = record;
      }

      // A domain the server never got to sending — the connection dropped
      // mid-stream, say — reads the same as a lookup failure rather than
      // staying stuck on "not checked" forever.
      fillMissing("Lookup failed");

      setState((previous) => ({
        ...previous,
        records: { ...received },
        scanning: false,
        progress: 1,
        error: failed
          ? `${failed} ${failed === 1 ? "domain" : "domains"} could not be checked.`
          : null,
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      fillMissing("Lookup failed");
      setState((previous) => ({
        ...previous,
        records: { ...received },
        scanning: false,
        progress: 1,
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

    // "Yours" is a claim of fact, not a vote alongside the lookup's guess: you
    // cannot own a domain that isn't registered, so saying it's yours settles
    // both questions at once. Without this, marking a domain the app
    // couldn't classify (or misread as free) as "mine" had no visible effect —
    // deriveStatus still fell through to "unknown"/"available" because it
    // only ever consults ownership once registration itself reads "registered".
    const status =
      override === "yours"
        ? "owned"
        : deriveStatus({
            eligibility: country.eligibility,
            hasSuffix: true,
            registration: record.registration,
            ownership,
          });

    results.set(country.iso, {
      country,
      iso: country.iso,
      domain,
      status,
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
