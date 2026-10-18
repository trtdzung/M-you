"use client";

import { useState } from "react";
import { usePersona } from "@/providers/context";
import { Action, Panel } from "../../settings-ui";

export function CaseUpdatePanel() {
  const { persona } = usePersona();
  const [message, setMessage] = useState("");
  async function update() {
    try {
      const response = await fetch(`/api/security/cases?cif=${encodeURIComponent(persona.cif)}`);
      if (!response.ok) throw new Error();
      const { cases } = await response.json();
      if (!cases.length) return setMessage("Chưa có hồ sơ.");
      const result = await fetch("/api/security/cases", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif: persona.cif, id: cases[0].id, action: "update" }) });
      setMessage(result.ok ? "Đã gửi thông báo cho khách (giả lập)." : "Không thể cập nhật hồ sơ.");
    } catch { setMessage("Không thể cập nhật hồ sơ."); }
  }
  return <Panel title="Hồ sơ tra soát"><Action onClick={() => void update()}>Giả lập: hồ sơ có cập nhật</Action>{message && <p className="py-3 text-sm" role="status">{message}</p>}</Panel>;
}
