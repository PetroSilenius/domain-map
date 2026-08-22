import { cn } from "@/lib/utils";
import { STATUS_META, type DomainStatus } from "@/lib/domain-status";

/**
 * Swatches read their colour from the custom properties emitted by
 * `statusColorStyles()`, which come from the same palette the map paints with.
 * On the globe those colours sit at partial opacity over the ocean; here they
 * are shown at full strength, where there is nothing behind them.
 */
export function StatusDot({
  status,
  className,
}: {
  status: DomainStatus;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: `var(--status-${status})` }}
      aria-hidden
    />
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: DomainStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <StatusDot status={status} />
      {STATUS_META[status].label}
    </span>
  );
}
