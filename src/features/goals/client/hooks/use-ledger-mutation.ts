"use client";

import { usePersonaCif } from "@/providers/context";
import type { LedgerEntryInput } from "../../model/types";
import { addLedgerEntry } from "../goals-api";
import { useAction } from "./use-action";

/** Deposit into / withdraw from a goal. Result is null without a cif. */
export function useLedgerMutation() {
  const cif = usePersonaCif();
  const { run, pending, errors, reset } = useAction();
  return {
    pending,
    errors,
    reset,
    add: (id: string, entry: Partial<LedgerEntryInput>) =>
      cif ? run(() => addLedgerEntry(cif, id, entry)) : null,
  };
}
