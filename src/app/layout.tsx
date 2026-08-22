import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { statusColorStyles } from "@/lib/domain-status";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

// Domain names are the thing people read most closely on this page, so they get
// a mono with unambiguous zeroes and a clear l/1/I.
const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Domain Map — where your name is still free",
  description:
    "Check one brand against every country's ccTLD on a globe: which domains you already own, which are taken, which are free, and which need local presence to register.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // next-themes writes the theme class on the client before paint, which
      // the server render cannot match.
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        {/* Inline so the status palette is present before first paint. */}
        <style>{statusColorStyles()}</style>
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
