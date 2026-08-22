"use client";

import { useState } from "react";
import { Link2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  brandFromDomain,
  isValidBrand,
  parseDomainList,
  type Project,
} from "@/lib/project";

/**
 * The whole input surface: the domains you already own, and the brand label
 * everything else is checked under.
 *
 * The brand is derived from the first domain you list, because typing it twice
 * is the kind of thing that makes people close a tab. It stays editable for the
 * cases where the derivation is wrong — a domain like `getdataatti.com` when
 * the brand you want to check is `dataatti`.
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
  const [domainsText, setDomainsText] = useState(project.owned.join(", "));
  /**
   * `null` means the field has never been touched, so it follows the first
   * domain. Anything else is what the person typed and is shown verbatim —
   * including an empty string, so the field can actually be cleared.
   */
  const [typedBrand, setTypedBrand] = useState<string | null>(project.brand || null);

  const domains = parseDomainList(domainsText);
  const derivedBrand = domains[0] ? brandFromDomain(domains[0]) : "";
  const brand = typedBrand ?? derivedBrand;
  const ready = isValidBrand(brand);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    onSubmit({ brand, owned: domains, overrides: project.overrides });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="owned">Domains you already own</Label>
        <Input
          id="owned"
          value={domainsText}
          onChange={(event) => setDomainsText(event.target.value)}
          placeholder="dataatti.fi, dataatti.se"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        <p className="text-muted-foreground text-xs">
          List one or more. They are treated as yours, and their nameservers are
          used to recognise your other domains.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="brand">Brand to check everywhere</Label>
        <Input
          id="brand"
          value={brand}
          onChange={(event) => setTypedBrand(event.target.value.toLowerCase())}
          placeholder={derivedBrand || "dataatti"}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        {brand && !ready ? (
          <p className="text-destructive text-xs">
            A brand can only contain letters, digits, and hyphens.
          </p>
        ) : null}
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
