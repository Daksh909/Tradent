"use client";

// Ported from shadcn-admin (MIT, src/context/search-provider.tsx).
import { createContext, useContext, useEffect, useState } from "react";
import { CommandMenu } from "./command-menu";

interface SearchContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function SearchProvider({ isDeveloper, children }: { isDeveloper: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <SearchContext value={{ open, setOpen }}>
      {children}
      <CommandMenu isDeveloper={isDeveloper} />
    </SearchContext>
  );
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch has to be used within SearchProvider");
  return ctx;
}
