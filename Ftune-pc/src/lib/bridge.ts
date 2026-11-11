/** Typed access to the preload bridge, with a friendly error in plain-browser dev. */
import type { FTuneApi, ByTuneApi } from "../../electron/preload";

declare global {
  interface Window {
    ftune?: FTuneApi;
    bytune?: ByTuneApi;
  }
}

export function hasBridge(): boolean {
  return typeof window !== "undefined" && !!(window.ftune || window.bytune);
}

export function requireBridge(): FTuneApi {
  const bridge = typeof window !== "undefined" ? (window.ftune || window.bytune) : undefined;
  if (!bridge) {
    throw new Error("Not running inside the FTune desktop shell.");
  }
  return bridge;
}

export type { FTuneApi, ByTuneApi };
