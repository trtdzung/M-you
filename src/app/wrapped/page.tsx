import { notFound } from "next/navigation";
import { WrappedScreen } from "@/components/wrapped/WrappedScreen";
import { WRAPPED_ENABLED } from "@/lib/wrapped-flag";

/**
 * PFM Wrapped — the recap of the last 6 completed months, as a manual story.
 * Flag-gated: with `WRAPPED_ENABLED` off the route does not exist (404).
 */
export default function WrappedPage() {
  if (!WRAPPED_ENABLED) notFound();
  return <WrappedScreen />;
}
