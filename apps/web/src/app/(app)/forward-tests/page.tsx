import type { Metadata } from "next";
import { DeveloperOnly } from "@/components/developer-only";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Forward tests" };

export default function Page() {
  return (
    <DeveloperOnly>
      <PageHeader title="Forward tests" description="Your agent versions running on paper accounts." />
      <ComingSoon what="Each version's live paper record, decisions and listing progress." />
    </DeveloperOnly>
  );
}
