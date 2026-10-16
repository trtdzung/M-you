"use client";

/**
 * Prototype-only persona switcher. Swaps the active mock dataset so the whole
 * app re-renders with a different financial profile. Not a production surface.
 */

import { usePersona } from "@/providers/context";
import { cn } from "@/lib/cn";

export function PersonaSwitcher({ className }: { className?: string }) {
  const { personaId, personas, setPersona } = usePersona();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-col gap-2">
        {personas.map((p) => {
          const active = p.id === personaId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPersona(p.id)}
              aria-pressed={active}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                active ? "border-primary bg-primary/10" : "border-black/10 bg-surface",
              )}
            >
              <span className="block text-sm font-semibold text-text">{p.label}</span>
              <span className="block text-xs text-muted">{p.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
