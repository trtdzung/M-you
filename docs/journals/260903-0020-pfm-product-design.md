---
type: journal
date: 2026-09-03
topic: MSB AI personal financial management product design
---

# MSB AI PFM Product Design

## Context

The repository was empty apart from `.git`, so the design was created as a standalone mock-data-first product baseline.

## Decisions

- Structure the product into three progressive levels: money visibility, wealth/liabilities, and guided decisions.
- Use a modular monolith with replaceable data providers.
- Keep financial calculations deterministic and independently testable.
- Constrain AI to structured, read-only tools, explanation, and simulation.
- Defer autonomous financial actions and high-risk investment advice.
- Store product documentation in `docs/` and the backlog in `plans/`.

## Impact

The prototype can move quickly with synthetic fixtures while preserving boundaries for future MSB core, card, savings, and investment integrations. Trust requirements—source, freshness, consent, assumptions, and auditability—are part of the foundation rather than a later add-on.

## Next

Implement only after stack selection and the Level 1 backlog is approved.
