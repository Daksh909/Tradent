"use client";

// Ported from shadcn-admin (MIT, src/components/search.tsx).
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-provider";

export function Search({ className }: { className?: string }) {
  const { setOpen } = useSearch();
  return (
    <Button
      variant="outline"
      className={cn(
        "group relative h-8 flex-1 justify-start rounded-md bg-muted/25 text-sm font-normal text-muted-foreground shadow-none hover:bg-accent sm:w-40 sm:pe-12 md:flex-none lg:w-52 xl:w-64",
        className,
      )}
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => setOpen(true)}
    >
      <SearchIcon aria-hidden className="absolute start-1.5 top-1/2 -translate-y-1/2" size={16} />
      <span className="ms-4">Search</span>
      <kbd className="pointer-events-none absolute end-[0.3rem] top-[0.3rem] hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium select-none sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  );
}
