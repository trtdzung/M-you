"use client";

import { AlertTriangle } from "lucide-react";
import "./shield-ui.css";

export function ShieldReopen({ message, onReopen }: { message: string; onReopen: () => void }) {
  return (
    <div className="shield-reopen" role="status">
      <AlertTriangle size={20} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" onClick={onReopen}>Xem lại</button>
    </div>
  );
}
