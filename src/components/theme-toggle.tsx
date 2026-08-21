"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const ORDER = ["system", "light", "dark"] as const;
const ICONS = { system: Monitor, light: Sun, dark: Moon };
const LABELS = { system: "Match system", light: "Light", dark: "Dark" };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // The server cannot know the stored preference, so the button renders its
  // neutral state until hydration rather than guessing and flipping. The store
  // never changes, so the only re-render is the one hydration causes anyway.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const current = (mounted ? theme : "system") as (typeof ORDER)[number];
  const Icon = ICONS[current] ?? Monitor;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => setTheme(next)}
      title={`Theme: ${LABELS[current] ?? "Match system"}`}
      aria-label={`Theme: ${LABELS[current] ?? "Match system"}. Switch to ${LABELS[next]}.`}
    >
      <Icon className="size-4" />
    </Button>
  );
}
