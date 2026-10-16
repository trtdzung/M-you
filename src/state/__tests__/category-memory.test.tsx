import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider } from "@/providers/context";
import { CategoryMemoryProvider, useCategoryMemory } from "../category-memory";
import { UNCLASSIFIED } from "@/domain/models";

/**
 * Provider-level coverage for the per-persona category memory. Pure-function
 * behaviour (normalizeMerchantKey/lookupMemory/isMemorableCategory) is already
 * covered in `category-memory-core.test.ts`; this file exercises the React
 * context (persistence, `remember`/`forget` wiring) against the real
 * `<PersonaProvider>` (default persona "stable", cif "CIF_0001").
 */
const CIF_KEY = "msb-pfm.category-memory.CIF_0001";
const wrapper = ({ children }: { children: ReactNode }) => (
  <PersonaProvider>
    <CategoryMemoryProvider>{children}</CategoryMemoryProvider>
  </PersonaProvider>
);

beforeEach(() => {
  window.localStorage.clear();
});

describe("CategoryMemoryProvider", () => {
  it("remember then lookup resolves a normalized merchant", () => {
    const { result } = renderHook(() => useCategoryMemory(), { wrapper });
    act(() => result.current.remember("Highlands Coffee", "dining"));
    expect(result.current.lookup("highlands  coffee")).toBe("dining");
    // persisted under the per-cif key
    expect(window.localStorage.getItem(CIF_KEY)).not.toBeNull();
  });

  it("remember with an invalid category id is a no-op (Red Team #5)", () => {
    const { result } = renderHook(() => useCategoryMemory(), { wrapper });
    act(() => result.current.remember("Ghost Shop", "ghost"));
    act(() => result.current.remember("Sentinel Shop", UNCLASSIFIED));
    expect(result.current.memory).toEqual({});
    expect(result.current.lookup("ghost shop")).toBeUndefined();
    expect(result.current.lookup("sentinel shop")).toBeUndefined();
  });

  it("remembering the same merchant+category twice increments hits", () => {
    const { result } = renderHook(() => useCategoryMemory(), { wrapper });
    act(() => result.current.remember("Highlands Coffee", "dining"));
    act(() => result.current.remember("Highlands Coffee", "dining"));
    expect(result.current.memory["highlands coffee"].hits).toBe(2);
    expect(result.current.memory["highlands coffee"].categoryId).toBe("dining");
  });

  it("forget removes the mapping so lookup misses again", () => {
    const { result } = renderHook(() => useCategoryMemory(), { wrapper });
    act(() => result.current.remember("Highlands Coffee", "dining"));
    expect(result.current.lookup("highlands coffee")).toBe("dining");

    act(() => result.current.forget("Highlands Coffee"));
    expect(result.current.lookup("highlands coffee")).toBeUndefined();
    expect(result.current.memory["highlands coffee"]).toBeUndefined();
  });
});
