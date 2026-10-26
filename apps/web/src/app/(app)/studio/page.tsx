import type { Metadata } from "next";
import { CADENCES, emptyDraft, estimateMonthlyCostUsd, forkDraft, listLibraryAgents, listSmokeTests, listStudioAgents, loadDraft, monthlySpend } from "@tradent/agent";
import { defaultModel } from "@/lib/anthropic";
import { AGENT_MODELS, MONTHLY_AI_SPEND_CAP_USD } from "@tradent/core";
import { DeveloperOnly } from "@/components/developer-only";
import { PageHeader } from "@/components/page-header";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

type Search = { version?: string; fork?: string; new?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <DeveloperOnly>
      <PageHeader title="Studio" description="Describe a strategy, shape it on the canvas, smoke-test it, then start its forward test." />
      <Workspace q={await searchParams} />
    </DeveloperOnly>
  );
}

async function Workspace({ q }: { q: Search }) {
  const user = (await getCurrentUser())!;
  const db = getDb();
  const agents = await listStudioAgents(db, user.id);

  // ?version= opens your own version, ?fork= a listed agent's public parts; otherwise your newest version, or a new draft.
  const newest = agents[0]?.versions[0]?.versionId;
  const draft =
    (q.version && UUID.test(q.version) ? await loadDraft(db, user.id, q.version) : null) ??
    (q.fork && UUID.test(q.fork) ? await forkDraft(db, user.id, q.fork) : null) ??
    (!q.new && !q.fork && newest ? await loadDraft(db, user.id, newest) : null) ??
    emptyDraft(defaultModel());

  const library = (await listLibraryAgents(db)).filter((v) => !agents.some((a) => a.agentId === v.agentId)).map((v) => ({ versionId: v.versionId, label: `${v.agentName} v${v.version}` }));
  const smokeTests = draft.baseVersionId ? await listSmokeTests(db, user.id, draft.baseVersionId) : [];
  const costTable = Object.fromEntries(AGENT_MODELS.map((m) => [m, Object.fromEntries(CADENCES.map((c) => [c, estimateMonthlyCostUsd(m, c)]))]));

  return (
    <StudioWorkspace
      // Remount when a different version or fork opens, so the client state starts from it.
      key={draft.baseVersionId ?? `new-${q.fork ?? ""}`}
      initialDraft={draft}
      agents={agents}
      library={library}
      smokeTests={smokeTests.map((t) => ({ runId: t.runId, startedAt: t.startedAt.toISOString(), result: t.result }))}
      costTable={costTable}
      cadences={[...CADENCES]}
      spentThisMonth={await monthlySpend(db, user.id, new Date())}
      cap={MONTHLY_AI_SPEND_CAP_USD}
    />
  );
}
