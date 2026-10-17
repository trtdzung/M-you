"use client";

import { useParams } from "next/navigation";
import { GoalDetailScreen, GoalsHeader } from "@/features/goals";

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <GoalsHeader />
      <GoalDetailScreen id={params?.id ?? ""} />
    </>
  );
}
