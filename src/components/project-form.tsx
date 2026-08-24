"use client";

import { useState } from "react";
import { Link2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidBrand, parseDomainList, type Project } from "@/lib/project";

/**
 * The whole input surface. Brand comes first and is the field that matters —
 * it's what gets checked in every country. The domains you already own are
 * secondary: optional, and only there to help spot which results are yours.
 *
 * The two used to be coupled — brand auto-filled from the first owned domain —
 * but that assumes the same name everywhere, which isn't always true (you can
 * own `dataatti.fi` and still be checking availability for a different brand,
 * `lyyti`). Independent fields handle both cases without asking which one you meant.
 */
export function ProjectForm({
  project,
  onSubmit,
  onCancel,
  onShare,
  scanning,
  progress,
}: {
  project: Project;
  onSubmit: (project: Project) => void;
  onCancel: () => void;
  /** Copies the current brand and domain list into a link. Disabled until there is one to share. */
  onShare: () => void;
  scanning: boolean;
  progress: number;
}) {
  // Seeded once from `project`. The parent remounts this form when a project
  // arrives from a link or from storage, which is cheaper and less surprising
  // than mirroring props into state on every change.
  const [brand, setBrand] = useState(project.brand);
  const [domainsText, setDomainsText] = useState(project.owned.join(", "));

  const domains = parseDomainList(domainsText);
  const ready = isValidBrand(brand);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    // Overrides are keyed by country, not by domain, because the country is
    // all the map ever shows. "Yours" recorded against, say, France meant
    // `lyyti.fr` — carrying it forward under a new brand would silently
    // apply it to `google.fr` instead, which nobody asked for. Only a
    // resubmit of the same brand (editing the owned-domains list, retrying
    // after a cancel) keeps the corrections; changing the brand starts clean.
    const overrides = brand === project.brand ? project.overrides : {};
    onSubmit({ brand, owned: domains, overrides });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="brand">Brand</Label>
        <Input
          id="brand"
          value={brand}
          onChange={(event) => setBrand(event.target.value.toLowerCase())}
          placeholder="google"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          className="h-12 font-mono text-lg"
        />
        {brand && !ready ? (
          <p className="text-destructive text-xs">
            Only letters, digits, and hyphens.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="owned" className="text-muted-foreground font-normal">
          Already own a domain? (optional)
        </Label>
        <Input
          id="owned"
          value={domainsText}
          onChange={(event) => setDomainsText(event.target.value)}
          placeholder="google.com, google.us, google.fi"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {scanning ? (
          <Button type="button" variant="secondary" onClick={onCancel} className="gap-2">
            <Loader2 className="size-4 animate-spin" />
            Scanning {Math.round(progress * 100)}% — stop
          </Button>
        ) : (
          <Button type="submit" disabled={!ready} className="gap-2">
            <Search className="size-4" />
            Check every country
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onShare}
          disabled={!ready}
          className="gap-2"
        >
          <Link2 className="size-4" />
          Share
        </Button>
      </div>
    </form>
  );
}
