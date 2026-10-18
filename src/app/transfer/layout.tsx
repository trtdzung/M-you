import { PhoneShell } from "@/components/shell/PhoneShell";

function TransferBackground() {
  return <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[#fce0d5] to-[#fbd0d4]" />;
}

export default function TransferLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneShell background={<TransferBackground />} className="shell-calm transfer-shell" mainClassName="shell-main--transfer">
      {children}
    </PhoneShell>
  );
}
