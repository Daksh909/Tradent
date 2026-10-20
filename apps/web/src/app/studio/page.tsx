import type { Metadata } from "next";
import { DeveloperOnly } from "@/components/developer-only";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Studio" };

export default function Page() {
  return (
    <DeveloperOnly>
      <PageHeader title="Studio" description="Build an agent from strategies, tools and risk limits." />
      <ComingSoon what="Chat builder, drag-and-connect canvas and a smoke test for your agent." />
    </DeveloperOnly>
  );
}
