import "server-only";

/**
 * Read-only signal probe for the test-tool scenario cards. Does not write
 * events, interventions, or call the fraud agent.
 */

import { buildIncomingContext, buildTransferContext, type TransferReview } from "./signal-context";
import { computeIncomingSignals, computeSignals, type Signal } from "./signals";

export type SignalProbe = { code: string; evidence: string };

const pack = (signals: Signal[]): SignalProbe[] => signals.map(signal => ({ code: signal.code, evidence: signal.evidence }));

export function previewTransfer(cif: string, review: TransferReview): SignalProbe[] {
  return pack(computeSignals(buildTransferContext(cif, review)));
}

export function previewIncoming(cif: string): SignalProbe[] {
  return pack(computeIncomingSignals(buildIncomingContext(cif)));
}
