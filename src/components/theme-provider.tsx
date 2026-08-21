"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * The globe and the page have to agree on a theme.
 *
 * mapcn's map component resolves `system` itself from `prefers-color-scheme`,
 * while Tailwind switches on a `.dark` class. Left alone, the two disagree
 * whenever the class is not in sync with the media query — a light page around
 * a dark globe. Everything below reads the theme from here instead.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
