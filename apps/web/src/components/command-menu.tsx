"use client";

// Ported from shadcn-admin (MIT, src/components/command-menu.tsx).
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { navFor } from "@/lib/nav";
import { useSearch } from "./search-provider";

export function CommandMenu({ isDeveloper }: { isDeveloper: boolean }) {
  const nav = navFor(isDeveloper);
  const router = useRouter();
  const { setTheme } = useTheme();
  const { open, setOpen } = useSearch();

  const run = useCallback(
    (command: () => unknown) => {
      setOpen(false);
      command();
    },
    [setOpen],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a page or command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {nav.map((group) => (
          <CommandGroup key={group.title} heading={group.title}>
            {group.items.map((item) => (
              <CommandItem key={item.url} value={item.title} onSelect={() => run(() => router.push(item.url))}>
                <ArrowRight className="text-muted-foreground/80" />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => run(() => setTheme("dark"))}>
            <Moon /> Dark
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("light"))}>
            <Sun /> Light
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("system"))}>
            <Laptop /> System
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
