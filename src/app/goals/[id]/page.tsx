"use client";

import { useParams, useRouter } from "next/navigation";
import { GoalDetailScreen, GoalsHeader } from "@/features/goals";

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  return (
    <>
      <GoalsHeader title="Chi tiết mục tiêu" onBack={() => router.push("/pfm?tab=goals")} />
      <GoalDetailScreen id={params?.id ?? ""} />
    </>
  );
}
