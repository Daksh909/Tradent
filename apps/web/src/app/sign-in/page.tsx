import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { PaperBadge } from "@/components/paper-badge";
import { DemoSignIn, SocialSignIn } from "@/components/sign-in-buttons";
import { enabledProviders } from "@/lib/auth";
import { demoSignInEnabled, getCurrentUser, listDemoUsers } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/library");
  const demo = demoSignInEnabled();
  const demoUsers = demo ? await listDemoUsers() : [];

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-end px-4">
        <PaperBadge />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-14">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Activity className="size-5" />
            </div>
            <h1 className="text-xl font-semibold">Sign in to Tradent</h1>
            <p className="text-sm text-muted-foreground">Build, forward-test and paper-follow AI trading agents. Paper trading only, no real money.</p>
          </div>
          <SocialSignIn providers={enabledProviders} />
          {enabledProviders.length === 0 && !demo && (
            <p className="text-center text-sm text-muted-foreground">Sign-in isn&apos;t configured yet: set the Google or GitHub OAuth keys.</p>
          )}
          {demo && <DemoSignIn users={demoUsers} />}
        </div>
      </main>
    </div>
  );
}
