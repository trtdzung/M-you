"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { backWithTransition } from "@/lib/view-transition";
import { goalReturnHref } from "@/features/goals/ui/routes";
import { GoalDetailScreen, GoalsHeader } from "@/features/goals";

export default function GoalDetailPage() {
  return <Suspense fallback={null}><GoalDetailRoute /></Suspense>;
}

function GoalDetailRoute() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const paramsQuery = useSearchParams();
  const returnHref = goalReturnHref(paramsQuery.get("from"));
  return (
    <>
      <GoalsHeader title="Chi tiết mục tiêu" onBack={() => backWithTransition(() => router.replace(returnHref))} />
      <GoalDetailScreen id={params?.id ?? ""} />
    </>
  );
}
