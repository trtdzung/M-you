"use client";

import { useRouter } from "next/navigation";
import { backWithTransition } from "@/lib/view-transition";
import { GoalsHeader } from "@/features/goals";
import { CreateGoalFlow } from "@/features/goals/ui/screens/CreateGoalFlow";
import { GOALS_TAB_HREF } from "@/features/goals/ui/routes";

export default function CreateGoalPage() {
  const router = useRouter();
  return (
    <>
      <GoalsHeader title="Tạo mục tiêu" onBack={() => backWithTransition(() => router.replace(GOALS_TAB_HREF))} />
      <div className="py-5">
        <CreateGoalFlow inline onClose={() => {}} onCreated={(id) => router.replace(`/goals/${id}`)} />
      </div>
    </>
  );
}
