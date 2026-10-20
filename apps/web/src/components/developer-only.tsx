import { getCurrentUser } from "@/lib/session";

/** Renders its children for developers, and a short notice for everyone else. */
export async function DeveloperOnly({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user?.isDeveloper) return <>{children}</>;
  return <p className="text-muted-foreground">This page is for developers.</p>;
}
