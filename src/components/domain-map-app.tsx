"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { DomainStatus, Ownership } from "@/lib/domain-status";
import {
  EMPTY_PROJECT,
  fromSearchParams,
  loadProject,
  saveProject,
  toSearchParams,
  type Project,
} from "@/lib/project";
import { countByStatus, useScan } from "@/lib/use-scan";
import { ProjectForm } from "@/components/project-form";
import { StatusLegend } from "@/components/status-legend";
import { CountryList } from "@/components/country-list";
import { CountryDetail } from "@/components/country-detail";
import { ThemeToggle } from "@/components/theme-toggle";

// MapLibre reaches for `window` at module scope, so the globe is client-only.
const DomainGlobe = dynamic(
  () => import("@/components/domain-globe").then((module) => module.DomainGlobe),
  {
    ssr: false,
    loading: () => <Skeleton className="size-full rounded-none" />,
  },
);

export function DomainMapApp() {
  const [project, setProject] = useState<Project>(EMPTY_PROJECT);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [focusIso, setFocusIso] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<DomainStatus>>(new Set());

  const { records, results, progress, scanning, error, scan, cancel } = useScan(project);

  /**
   * A shared link wins over local storage: someone following a link expects to
   * see what they were sent, not whatever they last looked at themselves.
   *
   * This has to run after hydration rather than during render. Neither the
   * query string nor `localStorage` exists on the server, so reading either one
   * while rendering would produce different markup on the two sides.
   */
  useEffect(() => {
    const shared = fromSearchParams(new URLSearchParams(window.location.search));
    const stored = shared ?? loadProject();
    if (stored?.brand) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      setProject(stored);
      scan(stored.brand, stored.owned);
    }
  }, [scan]);

  // The brand guard also covers the first render, where the project is still
  // empty and must not overwrite what is in storage.
  useEffect(() => {
    if (project.brand) saveProject(project);
  }, [project]);

  const counts = useMemo(() => countByStatus(results), [results]);
  const selected = selectedIso ? results.get(selectedIso) : undefined;

  const handleSubmit = useCallback(
    (next: Project) => {
      setProject(next);
      setSelectedIso(null);
      scan(next.brand, next.owned);
    },
    [scan],
  );

  const handleSelect = useCallback((iso: string | null) => {
    setSelectedIso(iso);
    // A fresh object each time, so re-selecting the same country flies again.
    setFocusIso(iso);
  }, []);

  const handleOverride = useCallback(
    (iso: string, ownership: Ownership | null) => {
      setProject((previous) => {
        const overrides = { ...previous.overrides };
        if (ownership) overrides[iso] = ownership;
        else delete overrides[iso];
        return { ...previous, overrides };
      });
    },
    [],
  );

  const toggleStatus = useCallback((status: DomainStatus) => {
    setStatusFilter((previous) => {
      const next = new Set(previous);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const share = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?${toSearchParams(project)}`;
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", {
        description: "Anyone with it sees this map, no account needed.",
      });
    } catch {
      // Clipboard access needs a secure context and a user gesture; the URL
      // bar now holds the link either way.
      toast.info("Link is in the address bar", {
        description: "Copying was blocked, so copy it from there.",
      });
    }
  }, [project]);

  const scanned = Object.keys(records).length > 0;

  return (
    // Reversed on small screens so the globe — the point of the page — is the
    // first thing on screen, with the controls and the list scrolling under it.
    <div className="flex h-dvh flex-col-reverse lg:flex-row">
      <aside className="border-border flex min-h-0 flex-1 flex-col overflow-y-auto border-t lg:h-dvh lg:flex-none lg:w-[27rem] lg:overflow-hidden lg:border-t-0 lg:border-r">
        <header className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <Globe className="size-5" />
            <h1 className="flex-1 text-lg font-semibold tracking-tight">
              Domain Map
            </h1>
            <ThemeToggle />
          </div>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Check your brand&rsquo;s domain, country by country.
          </p>
        </header>

        <div className="px-5 pb-4">
          <ProjectForm
            // Remounting is how the form picks up a project restored from a
            // link or from storage, instead of syncing props into state.
            key={`${project.brand}:${project.owned.join(",")}`}
            project={project}
            onSubmit={handleSubmit}
            onCancel={cancel}
            onShare={share}
            scanning={scanning}
            progress={progress}
          />
          {error ? (
            <p className="text-muted-foreground mt-3 text-xs">{error}</p>
          ) : null}
        </div>

        {scanned ? (
          <>
            <Separator />
            <div className="space-y-3 px-5 py-4">
              <StatusLegend
                counts={counts}
                active={statusFilter}
                onToggle={toggleStatus}
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a country…"
                className="h-8 text-sm"
                autoComplete="off"
              />
            </div>

            {selected ? (
              <>
                <Separator />
                <div className="px-5 py-4">
                  <CountryDetail
                    result={selected}
                    override={project.overrides[selected.iso]}
                    onOverride={(ownership) => handleOverride(selected.iso, ownership)}
                    onClose={() => handleSelect(null)}
                  />
                </div>
              </>
            ) : null}

            <Separator />
            <div className="min-h-0 flex-1 lg:overflow-y-auto">
              <CountryList
                results={results}
                query={query}
                statusFilter={statusFilter}
                selectedIso={selectedIso}
                onSelect={handleSelect}
              />
            </div>
          </>
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center px-5 pb-6 text-xs leading-relaxed">
            {scanning ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Asking every registry…
              </span>
            ) : (
              <p>
                Nothing is stored on a server. Your list lives in this browser,
                and the Share button puts it in a link.
              </p>
            )}
          </div>
        )}
      </aside>

      <main className="relative h-[46dvh] min-h-[18rem] shrink-0 lg:h-full lg:min-h-0 lg:flex-1">
        <DomainGlobe
          results={results}
          statusFilter={statusFilter}
          selectedIso={selectedIso}
          onSelect={handleSelect}
          focusIso={focusIso}
        />
        {!scanned && !scanning ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-6">
            <p className="bg-background/85 text-muted-foreground rounded-full border px-4 py-2 text-center text-xs shadow-sm backdrop-blur">
              Type a brand to colour the globe.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
