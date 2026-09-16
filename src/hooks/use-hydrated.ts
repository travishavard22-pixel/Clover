"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * `false` during server rendering and the hydration pass, `true` once React is driving the page.
 * Backed by `useSyncExternalStore`, so it never triggers a cascading render the way a
 * `useEffect(() => setHydrated(true))` would.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
