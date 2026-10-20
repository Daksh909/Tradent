"use client";

// Layout ported from shadcn-admin (MIT, src/components/layout/app-sidebar.tsx and nav-group.tsx).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { navFor } from "@/lib/nav";
import type { CurrentUser } from "@/lib/session";
import { NavUser } from "./nav-user";

export function AppSidebar({ isDeveloper, user, demoUsers, demoMode }: { isDeveloper: boolean; user: CurrentUser | null; demoUsers: CurrentUser[]; demoMode: boolean }) {
  const nav = navFor(isDeveloper);
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/library">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Activity className="size-4" />
                </div>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">Tradent</span>
                  <span className="truncate text-xs text-muted-foreground">Agentic paper trading</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {nav.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={pathname === item.url || pathname.startsWith(`${item.url}/`)}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>{user && <NavUser user={user} demoUsers={demoUsers} demoMode={demoMode} />}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
