import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Track } from "../types";

const FAVORITES_KEY = "@ftune_offline_favorites";
const LEGACY_FAVORITES_KEY = "@bytune_offline_favorites";
const RECENT_KEY = "@ftune_recent_played";
const LEGACY_RECENT_KEY = "@bytune_recent_played";

export async function getOfflineFavorites(): Promise<Track[]> {
  try {
    const raw = (await AsyncStorage.getItem(FAVORITES_KEY)) || (await AsyncStorage.getItem(LEGACY_FAVORITES_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function toggleOfflineFavorite(track: Track): Promise<boolean> {
  try {
    const favs = await getOfflineFavorites();
    const exists = favs.some((t) => t.id === track.id);
    let updated: Track[];
    if (exists) {
      updated = favs.filter((t) => t.id !== track.id);
    } else {
      updated = [track, ...favs];
    }
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    return !exists;
  } catch {
    return false;
  }
}

export async function isFavorite(trackId: string): Promise<boolean> {
  try {
    const favs = await getOfflineFavorites();
    return favs.some((t) => t.id === trackId);
  } catch {
    return false;
  }
}

export async function saveRecentTrack(track: Track): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const recents: Track[] = raw ? JSON.parse(raw) : [];
    const filtered = recents.filter((t) => t.id !== track.id);
    const updated = [track, ...filtered].slice(0, 30);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {}
}

export async function getRecentTracks(): Promise<Track[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

