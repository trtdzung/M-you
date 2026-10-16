import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { TransferCompose } from "@/components/transfer/TransferCompose";

export default function TransferPage() {
  return (
    <div>
      <ScreenHeader title="Chuyển tiền" subtitle="Tạo bản nháp để tự kiểm tra và xác nhận." />
      <TransferCompose />
    </div>
  );
}
