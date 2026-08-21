"use client";

import { Check, ExternalLink, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { flagFor } from "@/lib/countries";
import { ianaUrl } from "@/data/cctlds";
import { STATUS_META } from "@/lib/domain-status";
import { StatusBadge } from "@/components/status-badge";
import type { Ownership } from "@/lib/domain-status";
import type { CountryResult } from "@/lib/use-scan";

function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Everything known about one country, plus the manual ownership override.
 *
 * The override matters more than it looks: matching a domain to its owner from
 * public data is guesswork, and Route 53 in particular gives every zone its own
 * nameservers, so your own domains can come back as someone else's. One click
 * fixes it, and the correction travels in the share link.
 */
export function CountryDetail({
  result,
  override,
  onOverride,
  onClose,
}: {
  result: CountryResult;
  override: Ownership | undefined;
  onOverride: (ownership: Ownership | null) => void;
  onClose: () => void;
}) {
  const { country } = result;
  const registered = result.status === "owned" || result.status === "taken";
  const registeredOn = formatDate(result.registeredOn);
  const expiresOn = formatDate(result.expiresOn);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="text-2xl leading-none" aria-hidden>
          {flagFor(country.iso)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{country.name}</h2>
          <p className="text-muted-foreground truncate font-mono text-xs">
            {result.domain ?? "no ccTLD delegated"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-7 shrink-0"
          aria-label="Close country details"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={result.status} />
        <span className="text-muted-foreground text-xs">
          {STATUS_META[result.status].blurb}
        </span>
      </div>

      {country.note ? (
        <p className="bg-muted/60 rounded-md px-2.5 py-2 text-xs leading-relaxed">
          {country.note}
        </p>
      ) : null}

      {result.confidence === "low" && result.status !== "closed" ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {country.tld ? `.${country.tld}` : "This registry"} publishes no RDAP
          service, so this is inferred from DNS. A domain that is registered but
          never pointed anywhere looks free from the outside — worth confirming
          with a registrar before you count on it.
        </p>
      ) : null}

      <Separator />

      <dl className="space-y-1.5">
        {country.tld ? (
          <Field label="ccTLD">
            <a
              href={ianaUrl(country.tld)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono underline-offset-2 hover:underline"
            >
              .{country.tld}
              <ExternalLink className="size-3" />
            </a>
          </Field>
        ) : null}
        {result.registrant ? (
          <Field label="Registrant">{result.registrant}</Field>
        ) : null}
        {registeredOn ? <Field label="Registered">{registeredOn}</Field> : null}
        {expiresOn ? <Field label="Expires">{expiresOn}</Field> : null}
        {result.nameservers?.length ? (
          <Field label="Nameservers">
            <span className="font-mono">{result.nameservers.join(", ")}</span>
          </Field>
        ) : null}
        {result.error ? <Field label="Lookup">{result.error}</Field> : null}
        <Field label="Checked via">
          {result.source === "listed"
            ? "You listed it"
            : result.source === "policy"
              ? "Registry policy"
              : result.source === "none"
                ? "Not checked yet"
                : result.source.toUpperCase()}
        </Field>
      </dl>

      {registered ? (
        <>
          <Separator />
          <div className="space-y-2">
            {result.ownershipReason ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {result.ownershipReason}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={override === "yours" ? "default" : "outline"}
                onClick={() => onOverride(override === "yours" ? null : "yours")}
                className="h-7 gap-1.5 text-xs"
              >
                <Check className="size-3.5" />
                It&rsquo;s mine
              </Button>
              <Button
                size="sm"
                variant={override === "theirs" ? "default" : "outline"}
                onClick={() => onOverride(override === "theirs" ? null : "theirs")}
                className="h-7 gap-1.5 text-xs"
              >
                <Minus className="size-3.5" />
                Not mine
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
