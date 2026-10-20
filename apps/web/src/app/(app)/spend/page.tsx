import type { Metadata } from "next";
import { DeveloperOnly } from "@/components/developer-only";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Spend" };

export default function Page() {
  return (
    <DeveloperOnly>
      <PageHeader title="Spend" description="Your AI spend this month against the free $10 cap." />
      <ComingSoon what="Spend by agent and model, and what's left of this month's cap." />
    </DeveloperOnly>
  );
}
