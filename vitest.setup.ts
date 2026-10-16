import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { installMockJarsApi, resetMockJarsApi } from "@/test-utils/mock-jars-fetch";

// `/api/jars*` moved from localStorage to a real fetch call (src/state/jars.tsx),
// which can't resolve a relative URL in this jsdom environment. Every test that
// renders the real provider stack needs this stubbed — see mock-jars-fetch.ts
// for why it fakes only the network boundary, not JarConfigProvider itself.
installMockJarsApi();
beforeEach(() => {
  resetMockJarsApi();
});
