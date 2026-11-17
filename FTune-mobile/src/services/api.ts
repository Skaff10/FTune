import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import type {
  RemoteAction,
  RemoteLibraryState,
  RemotePlayerState,
  SearchFilter,
  SearchResults,
  ServerInfo,
  Track,
} from "../types";
import { directYouTubeMusicSearch } from "./youtubeSearch";

const SERVER_KEY = "@ftune_server_url";
const LEGACY_SERVER_KEY = "@bytune_server_url";
let currentServerUrl = "";
let activeWs: WebSocket | null = null;
let reconnectTimer: any = null;
let isConnectedToPC = false;
let triggerWsReconnect: (() => void) | null = null;

export function isServerConnected(): boolean {
  return isConnectedToPC;
}

export async function initServerAddress(): Promise<string> {
  try {
    const saved =
      (await AsyncStorage.getItem(SERVER_KEY)) ||
      (await AsyncStorage.getItem(LEGACY_SERVER_KEY));
    if (saved && /^https?:\/\/[^/]+/.test(saved)) {
      currentServerUrl = saved;
    } else {
      currentServerUrl = "";
    }
  } catch (e) {
    console.warn("Failed to read server URL from storage:", e);
  }
  return currentServerUrl;
}

export async function setServerAddress(urlOrIp: string): Promise<void> {
  let cleaned = urlOrIp.trim();
  if (!cleaned) return;
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    cleaned = `http://${cleaned}`;
  }
  if (!cleaned.includes(":", cleaned.indexOf("//") + 2)) {
    cleaned = `${cleaned}:8765`;
  }
  const changed = currentServerUrl !== cleaned;
  currentServerUrl = cleaned;
  await AsyncStorage.setItem(SERVER_KEY, cleaned);
  if (changed && triggerWsReconnect) {
    triggerWsReconnect();
  }
}

export function getServerUrl(): string {
  return currentServerUrl;
}

export function reconnectWebSocket(): void {
  triggerWsReconnect?.();
}

let activeDiscoverController: AbortController | null = null;
let activeDiscoverPromise: Promise<string | null> | null = null;

export function cancelAutoDiscover(): void {
  if (activeDiscoverController) {
    try {
      activeDiscoverController.abort();
    } catch {}
    activeDiscoverController = null;
  }
  activeDiscoverPromise = null;
}

export async function pingServer(
  url: string,
  timeoutMs = 1500,
  externalSignal?: AbortSignal
): Promise<ServerInfo | null> {
  if (!url || !url.trim() || externalSignal?.aborted) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    let target = url.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = `http://${target}`;
    }
    if (!target.includes(":", target.indexOf("//") + 2)) {
      target = `${target}:8765`;
    }

    const res = await fetch(`${target}/api/ping`, { signal: controller.signal });
    if (res.ok) {
      const data = await res.json();
      if (data?.app === "FTune" || data?.app === "ByTune") {
        return data as ServerInfo;
      }
    }
  } catch {}
  finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
  return null;
}

async function scanSubnet(
  subnet: string,
  externalSignal?: AbortSignal,
  skipLastOctet?: number
): Promise<string | null> {
  if (externalSignal?.aborted) return null;

  const localController = new AbortController();
  const onAbort = () => localController.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });

  const candidates: number[] = [];
  for (let i = 2; i < 255; i++) {
    if (i !== skipLastOctet) candidates.push(i);
  }
  if (skipLastOctet !== 1) candidates.push(1);

  let nextIdx = 0;
  let foundUrl: string | null = null;
  const concurrency = 64;

  const worker = async () => {
    while (!foundUrl && !localController.signal.aborted) {
      const idx = nextIdx++;
      if (idx >= candidates.length) return;
      const testUrl = `http://${subnet}.${candidates[idx]}:8765`;
      const info = await pingServer(testUrl, 450, localController.signal);
      if (info && !foundUrl) {
        foundUrl = testUrl;
        localController.abort();
        return;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    externalSignal?.removeEventListener("abort", onAbort);
  }

  return foundUrl;
}

export async function autoDiscover(options?: {
  signal?: AbortSignal;
}): Promise<string | null> {
  if (options?.signal?.aborted) return null;

  if (activeDiscoverPromise) {
    return activeDiscoverPromise;
  }

  const controller = new AbortController();
  activeDiscoverController = controller;
  const onExternalAbort = () => controller.abort();
  options?.signal?.addEventListener("abort", onExternalAbort, { once: true });

  const run = (async (): Promise<string | null> => {
    if (currentServerUrl) {
      const current = await pingServer(currentServerUrl, 600, controller.signal);
      if (current) {
        triggerWsReconnect?.();
        return currentServerUrl;
      }
    }

    if (controller.signal.aborted) return null;

    let phoneSubnet: string | null = null;
    let phoneLastOctet: number | undefined;

    // 1. Detect the phone's exact active Wi-Fi / hotspot subnet first
    try {
      const phoneIp = await Network.getIpAddressAsync();
      if (phoneIp && /^\d+\.\d+\.\d+\.\d+$/.test(phoneIp) && !phoneIp.startsWith("127.")) {
        const parts = phoneIp.split(".");
        phoneSubnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        phoneLastOctet = Number(parts[3]);
      }
    } catch {}

    if (controller.signal.aborted) return null;

    if (phoneSubnet) {
      const found = await scanSubnet(phoneSubnet, controller.signal, phoneLastOctet);
      if (found) {
        await setServerAddress(found);
        return found;
      }
      return null;
    }

    // 2. Fallback only when phone LAN IP couldn't be determined
    const fallbackSubnets: string[] = [];
    if (currentServerUrl) {
      try {
        const parts = currentServerUrl.replace(/https?:\/\//, "").split(":")[0].split(".");
        if (parts.length === 4) {
          fallbackSubnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
        }
      } catch {}
    }
    for (const s of ["192.168.1", "192.168.0", "172.20.10"]) {
      if (!fallbackSubnets.includes(s)) fallbackSubnets.push(s);
    }

    for (const subnet of fallbackSubnets) {
      if (controller.signal.aborted) return null;
      const found = await scanSubnet(subnet, controller.signal);
      if (found) {
        await setServerAddress(found);
        return found;
      }
    }

    return null;
  })();

  activeDiscoverPromise = run;
  try {
    return await run;
  } finally {
    options?.signal?.removeEventListener("abort", onExternalAbort);
    if (activeDiscoverPromise === run) {
      activeDiscoverPromise = null;
      activeDiscoverController = null;
    }
  }
}

export async function searchMusic(
  query: string,
  filter: SearchFilter = "all"
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { songs: [] };

  if (isConnectedToPC && currentServerUrl) {
    try {
      const url = `${currentServerUrl}/api/search?q=${encodeURIComponent(
        q
      )}&filter=${encodeURIComponent(filter)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (data?.songs && data.songs.length > 0) {
          return { songs: data.songs };
        }
      }
    } catch {}
  }

  return await directYouTubeMusicSearch(q, filter);
}

export async function fetchHomeFeed(): Promise<any> {
  if (!currentServerUrl) throw new Error("Not connected to PC");
  const res = await fetch(`${currentServerUrl}/api/home`);
  if (!res.ok) throw new Error("Failed to load home feed");
  return res.json();
}

export async function fetchPCPlayerState(): Promise<RemotePlayerState | null> {
  if (!currentServerUrl) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${currentServerUrl}/api/player/state`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      return (await res.json()) as RemotePlayerState;
    }
  } catch {}
  return null;
}

export async function fetchPCLibrary(): Promise<RemoteLibraryState | null> {
  if (!currentServerUrl) return null;
  try {
    const res = await fetch(`${currentServerUrl}/api/library`);
    if (res.ok) {
      const data = await res.json();
      return {
        playlists: data?.playlists || [],
        liked: data?.liked || [],
      };
    }
  } catch (e) {
    console.warn("[api] Failed to fetch PC library:", e);
  }
  return null;
}

export async function fetchPlaylistDetails(playlistId: string): Promise<any | null> {
  if (!currentServerUrl) return null;
  try {
    const res = await fetch(
      `${currentServerUrl}/api/playlist?id=${encodeURIComponent(playlistId)}`
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("[api] Failed to fetch playlist:", e);
  }
  return null;
}

export async function fetchLyrics(track: Track): Promise<any> {
  if (!currentServerUrl) return null;
  const params = new URLSearchParams({
    id: track.id,
    title: track.title,
    artist: track.artist,
  });
  if (track.album) params.set("album", track.album);
  if (track.duration) params.set("duration", track.duration.toString());

  const res = await fetch(`${currentServerUrl}/api/lyrics?${params.toString()}`);
  if (!res.ok) return null;
  return res.json();
}

export function requestPCSync(): void {
  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    try {
      activeWs.send(JSON.stringify({ type: "sync-request" }));
    } catch {}
  }
}

export async function sendRemoteAction(action: RemoteAction): Promise<boolean> {
  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    activeWs.send(JSON.stringify({ type: "action", action }));
    return true;
  }
  if (!currentServerUrl) return false;

  try {
    const res = await fetch(`${currentServerUrl}/api/player/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    return res.ok;
  } catch (err) {
    console.warn("[api] Failed to send remote action:", err);
    return false;
  }
}

export function connectWebSocket(
  onState: (state: RemotePlayerState) => void,
  onConnectionChange: (connected: boolean) => void,
  onLibrary?: (library: RemoteLibraryState) => void
): () => void {
  let isClosedManually = false;

  const connect = () => {
    if (isClosedManually) return;
    if (!currentServerUrl) {
      isConnectedToPC = false;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 2500);
      return;
    }

    if (activeWs) {
      try {
        activeWs.close();
      } catch {}
      activeWs = null;
    }

    try {
      const wsUrl = currentServerUrl.replace(/^http/, "ws") + "/ws";
      const ws = new WebSocket(wsUrl);
      activeWs = ws;

      ws.onopen = () => {
        if (activeWs !== ws || isClosedManually) {
          ws.close();
          return;
        }
        isConnectedToPC = true;
        onConnectionChange(true);
      };

      ws.onmessage = (event) => {
        if (activeWs !== ws) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "state" && payload.state) {
            onState(payload.state);
          } else if (payload?.type === "library" && payload.library && onLibrary) {
            onLibrary(payload.library);
          }
        } catch (e) {
          console.warn("WebSocket parse error:", e);
        }
      };

      ws.onclose = () => {
        if (activeWs !== ws) return;
        isConnectedToPC = false;
        onConnectionChange(false);
        activeWs = null;
        if (!isClosedManually) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
      };
    } catch {
      isConnectedToPC = false;
      onConnectionChange(false);
      if (!isClosedManually) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 2500);
      }
    }
  };

  triggerWsReconnect = () => {
    clearTimeout(reconnectTimer);
    connect();
  };

  connect();

  return () => {
    isClosedManually = true;
    triggerWsReconnect = null;
    clearTimeout(reconnectTimer);
    if (activeWs) {
      const old = activeWs;
      activeWs = null;
      try {
        old.close();
      } catch {}
    }
  };
}
