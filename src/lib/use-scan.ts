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
 * Domains per streaming request. `/api/lookup` writes back a line of JSON
 * per domain the instant its lookup finishes, so this isn't sized to keep a
 * response small — it's sized to keep one request's *worst case* duration
 * well inside a typical serverless function's execution limit. A domain with
 * no RDAP server that also stalls on DNS can burn most of two timeouts (DNS,
 * then the WHOIS fallback) before answering; a request holding the whole
 * ~230-domain scan risks the host killing the connection partway through,
 * which reads as everything after that point going "Unknown" at once. A
 * batch this size keeps that risk to one batch, not the whole scan.
 */
const BATCH_SIZE = 30;
/** Batches in flight at once — registry-polite, and enough to keep overall throughput close to one big request. */
const PARALLEL_BATCHES = 3;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Streams one batch, calling `onRecord` the instant each line parses.
 * Returns how many domains in this batch never got an answer — a non-OK
 * response, a network error, or a stream that ended short of the full batch
 * all count, and are reported to the caller rather than thrown, so one bad
 * batch doesn't take the rest of the scan down with it.
 */
async function streamBatch(
  domains: string[],
  signal: AbortSignal,
  onRecord: (record: RegistryRecord) => void,
): Promise<number> {
  const seen = new Set<string>();

  try {
    const response = await fetch("/api/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domains }),
      signal,
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

      for (const line of lines) {
        if (!line) continue;
        const record = JSON.parse(line) as RegistryRecord;
        seen.add(record.domain);
        onRecord(record);
      }
    }
    if (carry.trim()) {
      const record = JSON.parse(carry) as RegistryRecord;
      seen.add(record.domain);
      onRecord(record);
    }
  } catch (error) {
    if (signal.aborted) throw error; // let an intentional cancel propagate, not get swallowed as a partial failure
    // Fall through: whatever this batch never got to is reported as missing below.
  }

  const missing = domains.filter((domain) => !seen.has(domain));
  for (const domain of missing) {
    // A domain this batch never got an answer for — the request failed
    // outright, or the connection ended mid-stream — reads the same as a
    // lookup failure rather than being left stuck on "not checked" forever.
    onRecord({
      domain,
      registration: "unknown",
      source: "dns",
      confidence: "low",
      error: "Lookup failed",
    });
  }
  return missing.length;
}

/**
 * Runs the world scan and keeps the accumulated registry answers.
 *
 * The ~230-domain scan is split into small batches, several in flight at
 * once, and each batch streams its own results back line by line rather
 * than waiting to collect a full response. That combination is the point:
 * per-domain streaming is what makes the first result appear in well under a
 * second instead of waiting on a whole batch; keeping batches small is what
 * keeps one slow or interrupted request from taking a big chunk of the scan
 * down with it (see `BATCH_SIZE` above).
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
    // The domains you listed go in the first batch: their nameservers and
    // registrant are what every other guess gets compared to.
    const ordered = [...new Set([...owned, ...targets])];

    setState({ records: {}, progress: 0, scanning: true, error: null });

    const received: Record<string, RegistryRecord> = {};
    let done = 0;
    let failed = 0;

    function onRecord(record: RegistryRecord) {
      received[record.domain] = record;
      done++;
      setState((previous) => ({
        ...previous,
        records: { ...received },
        progress: done / ordered.length,
      }));
    }

    const batches = chunk(ordered, BATCH_SIZE);
    let nextBatch = 0;

    async function worker() {
      while (nextBatch < batches.length) {
        const batch = batches[nextBatch++];
        failed += await streamBatch(batch, controller.signal, onRecord);
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker),
      );
      if (controller.signal.aborted) return;

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
