# Proactive Insight context and source policy

The named `07_field_mapping.md`, `04_insight_dynamic_memory.md`, `01_architecture.md`, `02_memory_model_and_policy.md`, `05_implementation_runbook.md`, and `wireframe_customer_detail.png` were not present in the inspected `pfm` and `personal-pfm-agent` local repositories on 2026-09-23. This file records only the supplied conversation principles; it is not a substitute for a verified PFM data contract.

- Canonical current financial values come from the PFM provider/DB plus accepted local overlays, then the deterministic engine. Do not use conversational memory as a balance, obligation, or cache source.
- Insight is derived analytics with its own lifecycle and storage. It is distinct from canonical facts and conversational memory.
- Context Composer sends only rule-relevant structured facts to the copywriter, never a full customer row or raw transaction history.
- The model writes Vietnamese copy only. Features, thresholds, risk priority, eligibility, and severity are deterministic.
- Risk precedes opportunity. Active P0/P1 suppresses P4/P5. P4 requires actual obligation and buffer coverage; CASA or unallocated pool alone is insufficient.
- Persist insight versions and cache by exact relevant feature fingerprint and semantic state. An unchanged exact fingerprint makes zero model calls; metric-only changes can reuse a safe copy template.
- `wireframe_customer_detail.png` belongs to the Sales Assistant Customer Detail context and does not establish any PFM Home field.

Current code wins if earlier brainstorming differs. In particular, `docs/INSIGHT_FEATURE_ARCHIVE.md` is archived implementation text, not a mounted widget or current source contract. See `proactive_insight_implementation_plan.md` for verified lineage and discrepancies.
