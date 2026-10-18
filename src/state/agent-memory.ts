"use client";

/**
 * What the agent itself remembered about the active persona from chat
 * (`GET /memory/preferences`, proxied by `/api/agent/memory`) — read-only plus
 * per-row delete. Separate from `useAgentPreferences` (the form the customer fills in).
 */

import { useCallback, useEffect, useState } from "react";
import { deleteAgentMemory, getAgentMemory, type AgentMemoryRecord } from "@/lib/agent-api";
import { usePersona } from "@/providers/context";

export function useAgentMemory() {
  const { persona } = usePersona();
  const cif = persona.cif;
  const [records, setRecords] = useState<AgentMemoryRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(() => {
    setStatus("loading");
    getAgentMemory(cif)
      .then((r) => {
        setRecords(r);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [cif]);

  useEffect(() => {
    load();
  }, [load]);

  /** Throws on failure so the caller can show why; the row stays until the delete really succeeded. */
  const remove = useCallback(
    async (recordId: string) => {
      await deleteAgentMemory(cif, recordId);
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
    },
    [cif],
  );

  return { records, status, remove, reload: load };
}
