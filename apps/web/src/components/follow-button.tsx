"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { followAgent, unfollowAgent } from "@/app/(app)/portfolio/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = {
  versionId: string;
  agentName: string;
  following: { followId: string; virtualAmount: number } | null;
  min: number;
  max: number;
  suggested: number;
};

export function FollowButton({ versionId, agentName, following, min, max, suggested }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(suggested));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  if (following)
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="secondary" data-testid="following">
          <Link href="/portfolio">Following with {usd(following.virtualAmount)}</Link>
        </Button>
        <UnfollowButton followId={following.followId} />
      </div>
    );

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button data-testid="follow-button">Follow on paper</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await followAgent(versionId, Number(amount));
              if (r.ok) setOpen(false);
              else setError(r.error);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Follow {agentName} on paper</DialogTitle>
            <DialogDescription>
              Virtual money only. You start with a scaled copy of what the agent holds now, then mirror every trade it makes, scaled to your amount. No real orders are placed and no brokerage account is needed.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span>Virtual amount (USD)</span>
            <Input type="number" inputMode="numeric" min={min} max={max} step={100} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="follow-amount" required />
            <span className="text-xs text-muted-foreground">
              {usd(min)} to {usd(max)}
            </span>
          </label>
          {error && (
            <p className="text-sm text-loss" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending} data-testid="follow-confirm">
              {pending ? "Following…" : "Start following"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UnfollowButton({ followId }: { followId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        data-testid="unfollow-button"
        onClick={() =>
          startTransition(async () => {
            const r = await unfollowAgent(followId);
            if (!r.ok) setError(r.error);
          })
        }
      >
        Stop following
      </Button>
      {error && <span className="text-xs text-loss">{error}</span>}
    </span>
  );
}
