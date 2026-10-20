import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { Header } from "@/components/header";
import { SearchProvider } from "@/components/search-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCurrentUser, listDemoUsers } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tradent", template: "%s · Tradent" },
  description: "Build, forward-test and paper-follow AI trading agents. Paper trading only.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, demoUsers, jar] = await Promise.all([getCurrentUser(), listDemoUsers(), cookies()]);
  const isDeveloper = user?.isDeveloper ?? false;
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <SearchProvider isDeveloper={isDeveloper}>
              <SidebarProvider defaultOpen={sidebarOpen}>
                <AppSidebar isDeveloper={isDeveloper} user={user} demoUsers={demoUsers} />
                <SidebarInset className="@container/content">
                  <Header />
                  <main className="px-4 py-6 @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl">{children}</main>
                </SidebarInset>
              </SidebarProvider>
            </SearchProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
