"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Dark first (CLAUDE.md build step 5); light and system are in the command palette and user menu.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
