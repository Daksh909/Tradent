"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchDemoUser } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import type { CurrentUser } from "@/lib/session";

const LABELS = { google: "Continue with Google", github: "Continue with GitHub" } as const;

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.2 4.7 18.2 5 18.2 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z" />
    </svg>
  );
}

export function SocialSignIn({ providers }: { providers: ("google" | "github")[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (providers.length === 0) return null;
  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <Button
          key={p}
          variant="outline"
          className="w-full"
          disabled={busy !== null}
          onClick={async () => {
            setBusy(p);
            setError(null);
            const res = await authClient.signIn.social({ provider: p, callbackURL: "/library" });
            if (res.error) {
              setError(res.error.message ?? "Sign-in failed");
              setBusy(null);
            }
          }}
        >
          {p === "google" ? <GoogleMark /> : <GitHubMark />}
          {LABELS[p]}
        </Button>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function GuestSignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await authClient.signIn.anonymous();
          if (res.error) {
            setError(res.error.message ?? "Couldn't start a guest session");
            setBusy(false);
            return;
          }
          router.push("/library");
          router.refresh();
        }}
      >
        Continue as guest
      </Button>
      <p className="text-center text-xs text-muted-foreground">No sign-up. Your guest account lives in this browser, so clearing its cookies or signing out ends it.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function DemoSignIn({ users }: { users: CurrentUser[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3" data-testid="demo-sign-in">
      <p className="text-xs text-muted-foreground">Demo sign-in (development only): pick a user.</p>
      {users.map((u) => (
        <Button
          key={u.id}
          variant="ghost"
          className="w-full justify-start"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await switchDemoUser(u.id);
              router.push("/library");
            })
          }
        >
          {u.displayName}
          <span className="text-muted-foreground">{u.isDeveloper ? "Developer" : "Investor"}</span>
        </Button>
      ))}
    </div>
  );
}
