"use client";

// Ported from shadcn-admin (MIT, src/components/layout/header.tsx).
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { MarketStatus } from "./market-status";
import { PaperBadge } from "./paper-badge";
import { Search } from "./search";

export function Header() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const onScroll = () => setOffset(document.documentElement.scrollTop || document.body.scrollTop);
    document.addEventListener("scroll", onScroll, { passive: true });
    return () => document.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("sticky top-0 z-40 h-14", offset > 10 ? "shadow" : "shadow-none")}>
      <div className={cn("relative flex h-full items-center gap-3 px-4 sm:gap-4", "after:absolute after:inset-0 after:-z-10 after:bg-background/80 after:backdrop-blur-lg")}>
        <SidebarTrigger variant="outline" />
        <Separator orientation="vertical" className="h-6!" />
        <Search />
        <div className="ms-auto flex items-center gap-4">
          <MarketStatus />
          <PaperBadge />
        </div>
      </div>
    </header>
  );
}
