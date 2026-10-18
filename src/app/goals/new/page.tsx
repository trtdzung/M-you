"use client";

import { useRouter } from "next/navigation";
import { GoalsHeader } from "@/features/goals";
import { CreateGoalFlow } from "@/features/goals/ui/screens/CreateGoalFlow";
import { GOALS_TAB_HREF } from "@/features/goals/ui/routes";

export default function CreateGoalPage() {
  const router = useRouter();
  return (
    <>
      <GoalsHeader title="Tạo mục tiêu" onBack={() => router.push(GOALS_TAB_HREF)} />
      <div className="py-5">
        <CreateGoalFlow inline onClose={() => {}} onCreated={(id) => router.replace(`/goals/${id}`)} />
      </div>
    </>
  );
}
