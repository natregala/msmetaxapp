"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Value = Record<string, string | number | null>;
type Entry = { session: string; index: number; views: Record<string, Value> };
type Participant = {
  value: string;
  restore: (value: Value) => void;
  guard: () => Promise<boolean>;
};
const key = "kitangJourney";

/** Browser-only coordinator. History contains navigation identifiers, never form values. */
function createJourneyHistory() {
  let entry: Entry | null = null;
  let moving = false;
  let reverting = false;
  let restoreOnMount = new Set<string>();
  const participants = new Map<string, Participant>();
  return {
    start() {
      entry = { session: crypto.randomUUID(), index: 0, views: {} };
      history.replaceState({ ...history.state, [key]: entry }, "");
      const pop = async (event: PopStateEvent) => {
        if (reverting) {
          reverting = false;
          moving = false;
          return;
        }
        const target = event.state?.[key] as Entry | undefined;
        const previous = entry;
        if (!target || !previous || target.session !== previous.session) return;
        moving = true;
        const active = [...participants.entries()];
        let allowed = true;
        try {
          for (const [, participant] of active) {
            if (!(await participant.guard())) {
              allowed = false;
              break;
            }
          }
        } catch {
          allowed = false;
        }
        if (!allowed) {
          reverting = true;
          history.go(previous.index - target.index);
          return;
        }
        entry = target;
        restoreOnMount = new Set(Object.keys(target.views));
        for (const [scope, participant] of active) {
          const value = target.views[scope];
          if (value) {
            restoreOnMount.delete(scope);
            participant.value = JSON.stringify(value);
            participant.restore(value);
          }
        }
        moving = false;
      };
      window.addEventListener("popstate", pop);
      return () => {
        window.removeEventListener("popstate", pop);
        participants.clear();
        entry = null;
      };
    },
    sync(
      scope: string,
      serialized: string,
      restore: Participant["restore"],
      guard: Participant["guard"],
    ) {
      if (!entry || moving) return;
      let participant = participants.get(scope);
      if (!participant) {
        const remembered = restoreOnMount.has(scope)
          ? entry.views[scope]
          : undefined;
        restoreOnMount.delete(scope);
        participant = {
          value: JSON.stringify(remembered ?? JSON.parse(serialized)),
          restore,
          guard,
        };
        participants.set(scope, participant);
        if (remembered && JSON.stringify(remembered) !== serialized) {
          restore(remembered);
          return;
        }
        entry = {
          ...entry,
          views: { ...entry.views, [scope]: JSON.parse(serialized) },
        };
        history.replaceState({ ...history.state, [key]: entry }, "");
      } else if (participant.value !== serialized) {
        participant.value = serialized;
        entry = {
          ...entry,
          index: entry.index + 1,
          views: { ...entry.views, [scope]: JSON.parse(serialized) },
        };
        history.pushState({ ...history.state, [key]: entry }, "");
      }
    },
    remove(scope: string) {
      participants.delete(scope);
    },
  };
}
const Context = createContext<ReturnType<typeof createJourneyHistory> | null>(
  null,
);

export function JourneyHistory({ children }: { children: ReactNode }) {
  const [controller] = useState(createJourneyHistory);
  useEffect(() => controller.start(), [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}

export function useJourneyHistory(
  scope: string,
  value: Value,
  restore: (value: Value) => void,
  guard: () => Promise<boolean>,
  enabled = true,
) {
  const controller = useContext(Context);
  const latest = useRef({ restore, guard });
  useEffect(() => {
    latest.current = { restore, guard };
  });
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!controller || !enabled) return;
    const sync = () =>
      controller.sync(
        scope,
        serialized,
        (next) => latest.current.restore(next),
        () => latest.current.guard(),
      );
    // Child effects run first; allow the provider to initialize its session.
    sync();
    const timer = window.setTimeout(sync, 0);
    return () => clearTimeout(timer);
  }, [controller, scope, serialized, enabled]);
  useEffect(
    () => () => {
      controller?.remove(scope);
    },
    [controller, scope, enabled],
  );
}
