"use client";

import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER, type DomainStatus } from "@/lib/domain-status";
import { StatusDot } from "@/components/status-badge";

/**
 * The legend doubles as the filter, since "show me only the free ones" is the
 * question the map exists to answer.
 */
export function StatusLegend({
  counts,
  active,
  onToggle,
}: {
  counts: Record<DomainStatus, number>;
  active: Set<DomainStatus>;
  onToggle: (status: DomainStatus) => void;
}) {
  const filtering = active.size > 0;

  return (
    <ul className="grid grid-cols-2 gap-1">
      {STATUS_ORDER.map((status) => {
        const count = counts[status];
        const meta = STATUS_META[status];
        const selected = active.has(status);
        return (
          <li key={status}>
            <button
              type="button"
              onClick={() => onToggle(status)}
              aria-pressed={selected}
              disabled={count === 0}
              title={meta.blurb}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                "hover:bg-accent disabled:pointer-events-none disabled:opacity-40",
                selected ? "border-foreground/30 bg-accent" : "border-transparent",
                filtering && !selected && "opacity-55",
              )}
            >
              <StatusDot status={status} />
              <span className="min-w-0 flex-1 truncate text-xs">{meta.label}</span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {count}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
