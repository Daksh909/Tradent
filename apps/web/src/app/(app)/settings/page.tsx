import type { Metadata } from "next";
import { setDeveloper } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  const user = (await getCurrentUser())!;
  return (
    <>
      <PageHeader title="Settings" description="Your account and preferences." />
      <section className="max-w-xl space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="font-semibold">Account</h2>
          <p className="text-sm text-muted-foreground">
            {user.displayName} · {user.email}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Developer tools</h2>
            <p className="text-sm text-muted-foreground">Build agents in Studio and forward-test them on paper accounts, with up to $10 of free AI use a month.</p>
          </div>
          <form action={setDeveloper.bind(null, !user.isDeveloper)}>
            <Button type="submit" variant={user.isDeveloper ? "outline" : "default"} data-testid="developer-toggle">
              {user.isDeveloper ? "Turn off" : "Turn on"}
            </Button>
          </form>
        </div>
      </section>
    </>
  );
}
