"use client";

// Ported from shadcn-admin (MIT, src/components/layout/nav-user.tsx), with a demo user switcher in demo mode.
import { useTransition } from "react";
import { Check, ChevronsUpDown, Laptop, LogOut, Moon, Sun, Users } from "lucide-react";
import { useTheme } from "next-themes";
import { signOut, switchDemoUser } from "@/app/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import type { CurrentUser } from "@/lib/session";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function roles(u: CurrentUser) {
  return [u.isDeveloper && "Developer", u.isInvestor && "Investor", u.isAdmin && "Admin"].filter(Boolean).join(" · ");
}

export function NavUser({ user, demoUsers, demoMode }: { user: CurrentUser; demoUsers: CurrentUser[]; demoMode: boolean }) {
  const { isMobile } = useSidebar();
  const { setTheme } = useTheme();
  const [pending, startTransition] = useTransition();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" data-testid="user-menu" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials(user.displayName)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{user.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{roles(user)}</span>
              </div>
              <ChevronsUpDown className="ms-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="font-normal">
              <div className="grid text-sm leading-tight">
                <span className="truncate font-semibold">{user.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{user.isAnonymous ? "Guest account" : user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {demoMode && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={pending}>
                  <Users /> Switch demo user
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {demoUsers.map((u) => (
                    <DropdownMenuItem key={u.id} onSelect={() => startTransition(() => switchDemoUser(u.id))}>
                      {u.id === user.id ? <Check /> : <span className="size-4" />}
                      <span>
                        {u.displayName} <span className="text-muted-foreground">({roles(u)})</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Moon /> Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => setTheme("dark")}>
                    <Moon /> Dark
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTheme("light")}>
                    <Sun /> Light
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTheme("system")}>
                    <Laptop /> System
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => startTransition(() => signOut())}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
