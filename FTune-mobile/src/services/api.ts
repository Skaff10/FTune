import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  PCPlaylist,
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
let currentServerUrl = "http://192.168.0.120:8765";
let activeWs: WebSocket | null = null;
let reconnectTimer: any = null;
let isConnectedToPC = false;

export function isServerConnected(): boolean {
  return isConnectedToPC;
}

export async function initServerAddress(): Promise<string> {
  try {
    const saved = (await AsyncStorage.getItem(SERVER_KEY)) || (await AsyncStorage.getItem(LEGACY_SERVER_KEY));
    if (saved && !saved.includes("192.168.1.100")) {
      currentServerUrl = saved;
    } else {
      currentServerUrl = "http://192.168.0.120:8765";
      await AsyncStorage.setItem(SERVER_KEY, currentServerUrl);
    }
  } catch (e) {
    console.warn("Failed to read server URL from storage:", e);
  }
  return currentServerUrl;
}

export async function setServerAddress(urlOrIp: string): Promise<void> {
  let cleaned = urlOrIp.trim();
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    cleaned = `http://${cleaned}`;
  }
  if (!cleaned.includes(":", cleaned.indexOf("//") + 2)) {
    cleaned = `${cleaned}:8765`;
  }
  currentServerUrl = cleaned;
  await AsyncStorage.setItem(SERVER_KEY, cleaned);
}

export function getServerUrl(): string {
  return currentServerUrl;
}

export async function pingServer(url: string): Promise<ServerInfo | null> {
  try {
    let target = url.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = `http://${target}`;
    }
    if (!target.includes(":", target.indexOf("//") + 2)) {
      target = `${target}:8765`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${target}/api/ping`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data?.app === "FTune" || data?.app === "ByTune") {
        return data as ServerInfo;
      }
    }
  } catch {}
  return null;
}

export async function autoDiscover(): Promise<string | null> {
  const current = await pingServer(currentServerUrl);
  if (current) return currentServerUrl;

  const candidateSubnets = ["192.168.0", "192.168.1", "192.168.2", "10.0.0"];
  try {
    const parts = currentServerUrl.replace(/https?:\/\//, "").split(":")[0].split(".");
    if (parts.length === 4) {
      const detected = `${parts[0]}.${parts[1]}.${parts[2]}`;
      if (!candidateSubnets.includes(detected)) {
        candidateSubnets.unshift(detected);
      }
    }
  } catch {}

  for (const subnet of candidateSubnets) {
    const batchSize = 25;
    for (let i = 1; i < 255; i += batchSize) {
      const promises = [];
      for (let j = i; j < i + batchSize && j < 255; j++) {
        const testUrl = `http://${subnet}.${j}:8765`;
        promises.push(
          pingServer(testUrl).then((info) => (info ? testUrl : null)).catch(() => null)
        );
      }
      const results = await Promise.all(promises);
      const found = results.find((r) => r !== null);
      if (found) {
        await setServerAddress(found);
        return found;
      }
    }
  }
  return null;
}

export async function searchMusic(query: string, filter: SearchFilter = "all"): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { songs: [] };

  if (isConnectedToPC) {
    try {
      const url = `${currentServerUrl}/api/search?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}`;
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
  const res = await fetch(`${currentServerUrl}/api/home`);
  if (!res.ok) throw new Error("Failed to load home feed");
  return res.json();
}

export async function fetchPCLibrary(): Promise<RemoteLibraryState | null> {
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
  try {
    const res = await fetch(`${currentServerUrl}/api/playlist?id=${encodeURIComponent(playlistId)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("[api] Failed to fetch playlist:", e);
  }
  return null;
}

export async function fetchLyrics(track: Track): Promise<any> {
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

export async function sendRemoteAction(action: RemoteAction): Promise<boolean> {
  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    activeWs.send(JSON.stringify({ type: "action", action }));
    return true;
  }

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

    try {
      const wsUrl = currentServerUrl.replace(/^http/, "ws") + "/ws";
      const ws = new WebSocket(wsUrl);
      activeWs = ws;

      ws.onopen = () => {
        isConnectedToPC = true;
        onConnectionChange(true);
      };

      ws.onmessage = (event) => {
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
        isConnectedToPC = false;
        onConnectionChange(false);
        activeWs = null;
        if (!isClosedManually) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      onConnectionChange(false);
      if (!isClosedManually) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 3000);
      }
    }
  };

  connect();

  return () => {
    isClosedManually = true;
    clearTimeout(reconnectTimer);
    if (activeWs) {
      activeWs.close();
      activeWs = null;
    }
  };
}
