import { PhoneShell } from "@/components/shell/PhoneShell";

function ConfirmBackground() {
  return <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[#fce0d5] to-[#fbd0d4]" />;
}

export default function TransferConfirmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneShell background={<ConfirmBackground />} className="shell-calm transfer-shell" mainClassName="shell-main--transfer">
      {children}
    </PhoneShell>
  );
}
