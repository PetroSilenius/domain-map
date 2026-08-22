"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A plain light/dark switch — no "match system" third state.
 *
 * That state used to exist here, but it added a stop between light and dark
 * that showed a monitor icon nobody asked for: `defaultTheme` is already
 * "dark", so "system" was never the baseline, just a detour every click cycle
 * passed through.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // The server can't know the stored preference, so this renders the same
  // "dark" icon it would resolve to by default until hydration confirms the
  // real value — never a distinct in-between icon.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light" : "Switch to dark"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
