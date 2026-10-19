"use client";

import { useState, type ReactNode } from "react";
import { m, useReducedMotionConfig } from "motion/react";
import { ARCHETYPE_FACT_ID, type ArchetypeId, type WrappedSlide, type WrappedSlideCopy } from "@/domain/wrapped";
import { ArchetypeEmblem } from "./archetype-emblems";
import { SURFACE_VARS } from "./wrapped-slide-themes";
import { ARCHETYPE_UI } from "./wrapped-ui-copy";
import { archetypeEvidence, type EvidenceRow } from "./wrapped-visual-data-lists";

/**
 * The archetype as a character card. Front: emblem, name, description. Back: the
 * evidence behind the label as percent meters. A native button flips it; it is the
 * only interactive control here and the only `pointer-events-auto` node, so taps on
 * the card itself still fall through to the viewer's nav zones. The faces are
 * `aria-hidden` (the live region reads `copy.srText`, which holds name, description
 * and evidence). The name is the slide title, so the front shows only emblem + description.
 * Motion: a 3D `rotateY` flip with `backface-visibility: hidden` faces. Under reduced
 * motion that structure would leave the pre-rotated back invisible, so BOTH faces
 * crossfade instead: no rotation, no backface, the inactive face `visibility: hidden`
 * (applied once its fade ends).
 * Both faces are white surfaces (`SURFACE_VARS` re-scopes ink to navy), so the card
 * reads the same whatever field it sits on; the button is a white pill on the field.
 */

const FACE = "col-start-1 row-start-1 flex flex-col gap-4 rounded-card bg-(--wr-surface) p-5 text-(--wr-ink) shadow-card";
const STAGGER_S = 0.08;
const FADE_S = 0.2;

function Meter({ row, show, index, reduced }: { row: EvidenceRow; show: boolean; index: number; reduced: boolean | null }) {
  return (
    <li data-evidence={row.id} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{row.label}</span>
        <span className="text-xl font-extrabold tabular-nums">{row.valueText}</span>
      </div>
      {row.meter !== null && (
        <div className="h-2 w-full rounded-full bg-(--wr-track)">
          <m.span
            data-meter
            className="block h-full w-full rounded-full bg-(--wr-accent)"
            style={{ originX: 0 }}
            initial={false}
            animate={{ scaleX: reduced || show ? row.meter : 0 }}
            transition={{ delay: show ? index * STAGGER_S : 0, type: "spring", stiffness: 160, damping: 22 }}
          />
        </div>
      )}
    </li>
  );
}

export function ArchetypeFlipCard({ slide, copy }: { slide: WrappedSlide; copy: WrappedSlideCopy }) {
  const [flipped, setFlipped] = useState(false);
  const reduced = useReducedMotionConfig();

  const idFact = slide.facts.find((f) => f.id === ARCHETYPE_FACT_ID)?.value;
  const description = copy.lines?.find((l) => l.kind === "description")?.text;
  // Only a recognised label (it has a description line) has a back and a button.
  const assigned = description !== undefined && typeof idFact === "string";
  const evidence = assigned ? archetypeEvidence(slide) : [];
  const canFlip = assigned && evidence.length > 0;

  const front = (
    <>
      <ArchetypeEmblem id={assigned ? (idFact as ArchetypeId) : null} />
      {description && <p className="text-base font-medium leading-snug">{description}</p>}
    </>
  );
  const back = (
    <>
      <p className="text-lg font-extrabold leading-tight">{ARCHETYPE_UI.evidenceTitle}</p>
      <ul className="flex flex-col gap-3.5">
        {evidence.map((row, i) => (
          <Meter key={row.id} row={row} show={flipped} index={i} reduced={reduced} />
        ))}
      </ul>
    </>
  );

  let faces: ReactNode;
  if (reduced) {
    const face = (name: string, active: boolean, children: ReactNode) => (
      <m.div
        data-face={name}
        data-wrapped-surface
        className={FACE}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: FADE_S }}
        // The outgoing face turns hidden only after its fade (the delay), the incoming one is visible at once.
        style={{
          ...SURFACE_VARS,
          visibility: active ? "visible" : "hidden",
          transition: `visibility 0s linear ${active ? 0 : FADE_S}s`,
        }}
      >
        {children}
      </m.div>
    );
    faces = (
      <div className="grid">
        {face("front", !flipped, front)}
        {canFlip && face("back", flipped, back)}
      </div>
    );
  } else {
    const hidden = { ...SURFACE_VARS, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" } as const;
    faces = (
      <m.div
        className="grid"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 20 }}
      >
        <div data-face="front" data-wrapped-surface className={FACE} style={hidden}>
          {front}
        </div>
        {canFlip && (
          <div data-face="back" data-wrapped-surface className={FACE} style={{ ...hidden, transform: "rotateY(180deg)" }}>
            {back}
          </div>
        )}
      </m.div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden data-testid="archetype-flip-card" data-flipped={flipped} className="pointer-events-none" style={{ perspective: "1000px" }}>
        {faces}
      </div>
      {canFlip && (
        <button
          type="button"
          aria-pressed={flipped}
          onClick={() => setFlipped((v) => !v)}
          className="pointer-events-auto inline-flex min-h-12 items-center justify-center self-start rounded-pill bg-(--wr-surface) px-6 text-base font-bold text-text shadow-nav transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--wr-surface) focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          {ARCHETYPE_UI.showEvidence}
        </button>
      )}
    </div>
  );
}
