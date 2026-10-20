import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Library" };

export default function Page() {
  return (
    <>
      <PageHeader title="Library" description="Agents and strategies you can follow or build on." />
      <ComingSoon what="Agents and Strategies tabs, with each listed agent's forward-test record." />
    </>
  );
}
