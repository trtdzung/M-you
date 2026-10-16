import { ScreenHeader } from "./ScreenHeader";
import { Empty } from "@/components/states";
import { Hammer } from "lucide-react";

/** Reusable placeholder screen for tabs not yet implemented. */
export function PlaceholderScreen({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <ScreenHeader title={title} subtitle={subtitle} />
      <Empty
        icon={<Hammer size={40} strokeWidth={1.5} />}
        title="Đang xây dựng"
        description="Tính năng này sẽ sớm ra mắt."
      />
    </div>
  );
}
