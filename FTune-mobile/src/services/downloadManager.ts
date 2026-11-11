import * as FileSystem from "expo-file-system/legacy";
import type { Track, DownloadItem } from "../types";
import { resolveAudioStream } from "./streamResolver";

const DOWNLOADS_DIR = `${FileSystem.documentDirectory}ftune_downloads/`;
const INDEX_FILE = `${DOWNLOADS_DIR}index.json`;

let cachedIndex: Record<string, DownloadItem> | null = null;
const listeners = new Set<(tracks: Track[]) => void>();

export function subscribeDownloads(cb: (tracks: Track[]) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyListeners() {
  const tracks = Object.values(cachedIndex || {}).map((item) => item.track);
  for (const cb of listeners) {
    try {
      cb(tracks);
    } catch {}
  }
}

async function ensureDirectory(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
  }
}

async function loadIndex(): Promise<Record<string, DownloadItem>> {
  if (cachedIndex) return cachedIndex;
  try {
    await ensureDirectory();
    const info = await FileSystem.getInfoAsync(INDEX_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(INDEX_FILE);
      cachedIndex = JSON.parse(content) || {};
    } else {
      cachedIndex = {};
    }
  } catch {
    cachedIndex = {};
  }
  return cachedIndex || {};
}

async function saveIndex(): Promise<void> {
  try {
    await ensureDirectory();
    await FileSystem.writeAsStringAsync(INDEX_FILE, JSON.stringify(cachedIndex || {}));
    notifyListeners();
  } catch (err) {
    console.warn("[downloadManager] Failed to save index:", err);
  }
}

export async function getDownloadedTracks(): Promise<Track[]> {
  const index = await loadIndex();
  return Object.values(index).map((item) => item.track);
}

export async function isTrackDownloaded(trackId: string): Promise<boolean> {
  const index = await loadIndex();
  const item = index[trackId];
  if (!item) return false;
  const file = await FileSystem.getInfoAsync(item.localUri);
  return file.exists;
}

export async function getDownloadedTrackUri(trackId: string): Promise<string | null> {
  const index = await loadIndex();
  const item = index[trackId];
  if (!item) return null;
  const file = await FileSystem.getInfoAsync(item.localUri);
  return file.exists ? item.localUri : null;
}

export async function downloadTrack(
  track: Track,
  onProgress?: (ratio: number) => void
): Promise<string | null> {
  try {
    await ensureDirectory();
    const existingUri = await getDownloadedTrackUri(track.id);
    if (existingUri) return existingUri;

    // Resolve remote audio stream URL
    const streamUrl = await resolveAudioStream(track.id);
    if (!streamUrl) {
      throw new Error("Could not resolve audio stream for download");
    }

    const localFile = `${DOWNLOADS_DIR}${track.id}.m4a`;

    // Download with progress callback
    const downloadResumable = FileSystem.createDownloadResumable(
      streamUrl,
      localFile,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPad; CPU OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
        },
      },
      (downloadProgress) => {
        const total = downloadProgress.totalBytesExpectedToWrite;
        if (total > 0 && onProgress) {
          const ratio = downloadProgress.totalBytesWritten / total;
          onProgress(Math.min(1, Math.max(0, ratio)));
        }
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result || !result.uri) {
      throw new Error("Download returned empty URI");
    }

    const fileInfo = await FileSystem.getInfoAsync(result.uri);
    const item: DownloadItem = {
      track: { ...track, localUri: result.uri },
      localUri: result.uri,
      fileSize: fileInfo.exists && "size" in fileInfo ? (fileInfo.size as number) : 0,
      downloadedAt: Date.now(),
    };

    const index = await loadIndex();
    index[track.id] = item;
    cachedIndex = index;
    await saveIndex();

    return result.uri;
  } catch (err: any) {
    console.warn(`[downloadManager] Failed to download track ${track.id}:`, err?.message);
    return null;
  }
}

export async function deleteDownloadedTrack(trackId: string): Promise<boolean> {
  try {
    const index = await loadIndex();
    const item = index[trackId];
    if (item && item.localUri) {
      const info = await FileSystem.getInfoAsync(item.localUri);
      if (info.exists) {
        await FileSystem.deleteAsync(item.localUri, { idempotent: true });
      }
      delete index[trackId];
      cachedIndex = index;
      await saveIndex();
      return true;
    }
  } catch (err) {
    console.warn("[downloadManager] Failed to delete track:", err);
  }
  return false;
}
