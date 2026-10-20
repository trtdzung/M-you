"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { PreviewState } from "../model/state";
import type { ScreenEntry, ScreenId, ScreenParams } from "../model/screens";
import type { ToastTone } from "../model/types";
import type { PreviewAction } from "./actions";
import { initialPreviewState, previewReducer } from "./reducer";
import { ActionQueue, GOALS_CHANGED_EVENT, fetchWorld, isLocalOnlyAction, pollMarket, requestMarketRefresh, type GoalIdResolution, type WorldPayload } from "./server-sync";
import { syncGoalInsights } from "../client/goal-insight-store";
import { hydrateMarket } from "../data/market";
import { usePersonaCif } from "@/providers/context";
import { usePanelActive } from "@/components/shell/PanelActive";

import { loanProductFor } from "../data/products";
import { loanPurposeFor } from "../engine";

export interface PendingLoanApplication {
  goalId: string;
  principal: number;
  termMonths: number;
  submittedAt: number;
  /** Chưa có nghĩa là đang chờ phê duyệt. "approved": đã duyệt, chờ khách bấm chuyển sang giai đoạn trả vay. */
  status?: "pending" | "approved";
  approvedAt?: number;
}

/** Thời gian mô phỏng phê duyệt hồ sơ vay. */
export const LOAN_APPROVAL_MS = 20_000;

/** Window event the shell's edge-swipe back fires on /goals-preview (see AppChrome). */
export const PREVIEW_BACK_EVENT = "goals-preview:back";

export interface PreviewNav {
  stack: ScreenEntry[];
  current: ScreenEntry;
  canGoBack: boolean;
  updateParams: (params: ScreenParams) => void;
  push: (screen: ScreenId, params?: ScreenParams) => void;
  replace: (screen: ScreenId, params?: ScreenParams) => void;
  pop: (count?: number) => void;
  popWith: (params: ScreenParams) => void;
  popTo: (screen: ScreenId) => void;
  reset: (screen?: ScreenId, params?: ScreenParams) => void;
}

interface PreviewContextValue {
  submitLoanApplication: (record: PendingLoanApplication) => void;
  /** Hồ sơ vay chưa chuyển sang giai đoạn trả vay của khách đang xem (đang chờ hoặc đã phê duyệt). */
  loanApplications: PendingLoanApplication[];
  /** Hồ sơ đã được phê duyệt: giải ngân khoản vay và chuyển mục tiêu sang giai đoạn trả vay. */
  startRepayment: (goalId: string) => void;
  state: PreviewState;
  dispatch: (action: PreviewAction) => void;
  nav: PreviewNav;
  toast: (message: string, tone?: ToastTone) => void;
  /** True once the server world of the active customer has loaded. */
  hydrated: boolean;
  /** "loading" until the first server world arrives; "error" when that GET failed. */
  loadStatus: LoadStatus;
  /** Retries the world GET after an error. */
  reload: () => void;
  /** Asks the server to re-fetch market prices in the background; never blocks. */
  refreshPrices: () => void;
  /** True while a price refresh started by `refreshPrices` is still running. */
  pricesRefreshing: boolean;
}

export type LoadStatus = "loading" | "ready" | "error";

const PreviewContext = createContext<PreviewContextValue | null>(null);

/**
 * Loads the server world for the active persona, then keeps every business action in sync:
 * the local reducer runs first (the UI never waits) and the action is queued to the server.
 * The old `goals-preview:v1` localStorage key is no longer read or written (and not deleted).
 */
function useServerWorld(
  rawDispatch: (a: PreviewAction) => void,
  stateRef: MutableRefObject<PreviewState>,
  cif: string | null,
  entryScreen?: ScreenId,
): {
  loadStatus: LoadStatus;
  reload: () => void;
  dispatch: (a: PreviewAction) => void;
  refreshPrices: () => void;
  pricesRefreshing: boolean;
} {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [pricesRefreshing, setPricesRefreshing] = useState(false);
  const queueRef = useRef<ActionQueue | null>(null);
  const cancelPollRef = useRef<(() => void) | null>(null);

  const applyPayload = useCallback(
    (payload: WorldPayload, ids?: GoalIdResolution) => {
      hydrateMarket(payload.market.instruments);
      syncGoalInsights(cif);
      rawDispatch({ type: "world/sync", world: payload.world, goalIdMap: ids?.goalIdMap, unsavedGoalIds: ids?.unsavedGoalIds });
      if (payload.market.refreshing && !cancelPollRef.current) {
        cancelPollRef.current = pollMarket(
          () => {
            const { nav: _nav, toasts: _toasts, lastCreatedGoalId: _l, navSeq: _n, ...world } = stateRef.current;
            rawDispatch({ type: "world/sync", world });
          },
          () => {
            cancelPollRef.current = null;
          },
        );
      }
    },
    [rawDispatch, stateRef, cif],
  );

  useEffect(() => {
    let alive = true;
    queueRef.current?.dispose();
    queueRef.current = null;
    cancelPollRef.current?.();
    cancelPollRef.current = null;
    setPricesRefreshing(false);
    // New customer (or retry): drop the previous world/nav and wait for the server world.
    setLoadStatus("loading");
    rawDispatch({ type: "hydrate", state: initialPreviewState() });
    if (entryScreen) rawDispatch({ type: "nav/reset", screen: entryScreen });
    if (!cif) return;
    fetchWorld(cif)
      .then((payload) => {
        if (!alive) return;
        applyPayload(payload);
        setLoadStatus("ready");
        queueRef.current = new ActionQueue(cif, {
          onWorld: applyPayload,
          onError: (message) => {
            const last = stateRef.current.toasts[stateRef.current.toasts.length - 1];
            if (last?.message !== message) rawDispatch({ type: "toast/push", message, tone: "error" });
          },
          onInfo: (message) => rawDispatch({ type: "toast/push", message, tone: "warning" }),
        });
      })
      .catch(() => {
        if (alive) setLoadStatus("error");
      });
    return () => {
      alive = false;
      queueRef.current?.dispose();
      queueRef.current = null;
      cancelPollRef.current?.();
    };
  }, [cif, entryScreen, reloadKey, rawDispatch, applyPayload, stateRef]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // A chat card (create / edit goal, choose a roadmap...) changed the goals on the server: re-read them quietly, keeping the screen.
  useEffect(() => {
    if (!cif || loadStatus !== "ready") return;
    let alive = true;
    const onChanged = () => {
      fetchWorld(cif)
        .then((payload) => {
          if (alive) applyPayload(payload);
        })
        .catch(() => {});
    };
    window.addEventListener(GOALS_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(GOALS_CHANGED_EVENT, onChanged);
    };
  }, [cif, loadStatus, applyPayload]);

  const dispatch = useCallback(
    (action: PreviewAction) => {
      const local = isLocalOnlyAction(action);
      // No server world yet (loading / failed): business actions are locked, nothing runs locally or is queued.
      if (!local && !queueRef.current) return;
      // The temporary id the reducer gives a new goal (pure reducer: same result as the dispatch below).
      const localGoalId = action.type === "createGoal" ? previewReducer(stateRef.current, action).lastCreatedGoalId : undefined;
      rawDispatch(action);
      if (!local) queueRef.current?.enqueue(action, localGoalId);
    },
    [rawDispatch, stateRef],
  );

  /** "Cập nhật lại": starts a server price sync (not awaited by the UI), then polls like the first load. */
  const refreshPrices = useCallback(() => {
    if (!cif || pricesRefreshing) return;
    setPricesRefreshing(true);
    const resync = () => {
      const { nav: _nav, toasts: _toasts, lastCreatedGoalId: _l, navSeq: _n, ...world } = stateRef.current;
      rawDispatch({ type: "world/sync", world });
    };
    void requestMarketRefresh()
      .then((market) => {
        hydrateMarket(market.instruments);
        resync();
        if (!market.refreshing) {
          setPricesRefreshing(false);
          return;
        }
        cancelPollRef.current?.();
        cancelPollRef.current = pollMarket(resync, () => {
          cancelPollRef.current = null;
          setPricesRefreshing(false);
        });
      })
      .catch(() => setPricesRefreshing(false));
  }, [cif, pricesRefreshing, rawDispatch, stateRef]);

  return { loadStatus, reload, dispatch, refreshPrices, pricesRefreshing };
}

export function PreviewStoreProvider({ children, entryScreen }: { children: ReactNode; entryScreen?: ScreenId }) {
  const active = usePanelActive();
  const cif = usePersonaCif();
  const [state, rawDispatch] = useReducer(previewReducer, undefined, initialPreviewState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const { loadStatus, reload, dispatch, refreshPrices, pricesRefreshing } = useServerWorld(rawDispatch, stateRef, cif, entryScreen);

  const pendingLoans = useRef<{ cif: string | null; records: PendingLoanApplication[] }>({ cif: null, records: [] });
  const [loanAppRevision, setLoanAppRevision] = useState(0);
  const readPendingLoans = useCallback(() => {
    if (pendingLoans.current.cif !== cif) {
      let records: PendingLoanApplication[] = [];
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(`goals-preview:loan-app:${cif}`) ?? "[]");
        if (Array.isArray(stored)) records = stored;
      } catch { /* Storage may be unavailable. */ }
      pendingLoans.current = { cif, records };
    }
    return pendingLoans.current.records;
  }, [cif]);
  const savePendingLoans = useCallback((records: PendingLoanApplication[]) => {
    pendingLoans.current = { cif, records };
    try {
      localStorage.setItem(`goals-preview:loan-app:${cif}`, JSON.stringify(records));
    } catch { /* Keep the current session's timer when storage is unavailable. */ }
  }, [cif]);
  const submitLoanApplication = useCallback((record: PendingLoanApplication) => {
    savePendingLoans([...readPendingLoans(), record]);
    setLoanAppRevision((revision) => revision + 1);
  }, [readPendingLoans, savePendingLoans]);

  const loanApplications = useMemo(() => readPendingLoans(), [readPendingLoans, loanAppRevision]);

  // Hết thời gian phê duyệt thì chỉ đánh dấu "đã phê duyệt"; khoản vay chỉ được tạo khi khách bấm chuyển giai đoạn.
  useEffect(() => {
    if (loadStatus !== "ready" || !cif) return;
    const waiting = readPendingLoans().filter((record) => record.status !== "approved");
    if (!waiting.length) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      const approve = (record: PendingLoanApplication): PendingLoanApplication =>
        record.status !== "approved" && record.submittedAt + LOAN_APPROVAL_MS <= now ? { ...record, status: "approved", approvedAt: now } : record;
      savePendingLoans(readPendingLoans().map(approve));
      setLoanAppRevision((revision) => revision + 1);
    }, Math.max(0, Math.min(...waiting.map((record) => record.submittedAt + LOAN_APPROVAL_MS)) - Date.now()));
    return () => clearTimeout(timer);
  }, [cif, loadStatus, readPendingLoans, savePendingLoans, loanAppRevision]);

  const startRepayment = useCallback((goalId: string) => {
    const record = readPendingLoans().find((item) => item.goalId === goalId && item.status === "approved");
    const goal = stateRef.current.goals.find((item) => item.id === goalId);
    if (!record || !goal) return;
    const product = loanProductFor(loanPurposeFor(goal.template));
    dispatch({ type: "takeLoan", goalId, productId: product.id, principal: record.principal, termMonths: record.termMonths });
    savePendingLoans(readPendingLoans().filter((item) => item !== record));
    setLoanAppRevision((revision) => revision + 1);
  }, [dispatch, readPendingLoans, savePendingLoans, stateRef]);

  useEffect(() => {
    const onBack = (event: Event) => {
      if (!active || state.nav.stack.length <= 1) return;
      event.preventDefault();
      dispatch({ type: "nav/pop" });
    };
    window.addEventListener(PREVIEW_BACK_EVENT, onBack);
    return () => window.removeEventListener(PREVIEW_BACK_EVENT, onBack);
  }, [active, state.nav.stack.length, dispatch]);

  const stack = state.nav.stack;
  const updateParams = useCallback((params: ScreenParams) => dispatch({ type: "nav/params", params }), [dispatch]);
  const push = useCallback((screen: ScreenId, params?: ScreenParams) => dispatch({ type: "nav/push", screen, params }), [dispatch]);
  const replace = useCallback((screen: ScreenId, params?: ScreenParams) => dispatch({ type: "nav/replace", screen, params }), [dispatch]);
  const pop = useCallback((count?: number) => dispatch({ type: "nav/pop", count }), [dispatch]);
  const popWith = useCallback((params: ScreenParams) => dispatch({ type: "nav/popWith", params }), [dispatch]);
  const popTo = useCallback((screen: ScreenId) => dispatch({ type: "nav/popTo", screen }), [dispatch]);
  const reset = useCallback((screen?: ScreenId, params?: ScreenParams) => dispatch({ type: "nav/reset", screen, params }), [dispatch]);
  const toast = useCallback((message: string, tone?: ToastTone) => dispatch({ type: "toast/push", message, tone }), [dispatch]);

  const nav = useMemo<PreviewNav>(
    () => ({ stack, current: stack[stack.length - 1], canGoBack: stack.length > 1, updateParams, push, replace, pop, popWith, popTo, reset }),
    [stack, updateParams, push, replace, pop, popWith, popTo, reset],
  );

  const value = useMemo(
    () => ({ state, dispatch, nav, toast, submitLoanApplication, loanApplications, startRepayment, hydrated: loadStatus === "ready", loadStatus, reload, refreshPrices, pricesRefreshing }),
    [state, dispatch, nav, toast, submitLoanApplication, loanApplications, startRepayment, loadStatus, reload, refreshPrices, pricesRefreshing],
  );
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used inside <PreviewStoreProvider>");
  return ctx;
}

export function usePreviewState(): PreviewState {
  return usePreview().state;
}

export function usePreviewDispatch(): (action: PreviewAction) => void {
  return usePreview().dispatch;
}

export function useNav(): PreviewNav {
  return usePreview().nav;
}
