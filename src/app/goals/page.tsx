import { redirect } from "next/navigation";
import { GOALS_TAB_HREF } from "@/features/goals";

/** Goals moved into the "Mục tiêu" tab of /pfm; old links land there. */
export default function GoalsPage() {
  redirect(GOALS_TAB_HREF);
}
