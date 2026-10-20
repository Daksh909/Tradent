import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { Header } from "@/components/header";
import { SearchProvider } from "@/components/search-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { demoSignInEnabled, getCurrentUser, listDemoUsers } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const [demoUsers, jar] = await Promise.all([listDemoUsers(), cookies()]);
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";

  return (
    <SearchProvider isDeveloper={user.isDeveloper}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar isDeveloper={user.isDeveloper} user={user} demoUsers={demoUsers} demoMode={demoSignInEnabled()} />
        <SidebarInset className="@container/content">
          <Header />
          <main className="px-4 py-6 @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </SearchProvider>
  );
}
