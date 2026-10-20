import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Your account and preferences." />
      <ComingSoon what="Profile, theme and notification settings." />
    </>
  );
}
