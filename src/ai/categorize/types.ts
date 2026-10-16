/**
 * Contracts for the categorize pipeline. The classifier is a single injectable
 * FUNCTION type (Red Team #10) — not an interface with two classes — so tests
 * inject a fake and the real/heuristic paths are just different functions.
 *
 * The classifier returns only `{ txnId, categoryId, confidence }`. It NEVER
 * returns an amount or any number the engine consumes (invariant #1): its output
 * is a category *suggestion* that the service validates before it becomes an
 * overlay assignment.
 */

export interface ClassifyInput {
  txnId: string;
  /** Normalized merchant (the classifier's main signal). Treated as DATA. */
  merchant: string;
  amount: number;
  direction: "credit" | "debit";
  /** Transaction type — used for the semantic (kind↔type) validation gate. */
  type: string;
  /** Optional free-text memo. DATA, never an instruction (prompt-injection safe). */
  note?: string;
}

export interface ClassifyResult {
  txnId: string;
  categoryId: string;
  /** Model/heuristic self-reported confidence in [0, 1]; gates applied vs pending. */
  confidence: number;
}

/** The single injectable classifier shape. */
export type ClassifyFn = (inputs: ClassifyInput[]) => Promise<ClassifyResult[]>;

/** Which pipeline produced an assignment — drives the provenance badge. */
export type ClassifyOrigin = "ai" | "heuristic";
