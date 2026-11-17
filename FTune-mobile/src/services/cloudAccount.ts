import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  CloudSyncStatus,
  CloudUserAccount,
  ImportSong,
  PCPlaylist,
  Track,
} from "../types";
import {
  getOfflineFavorites,
  getRecentTracks,
  mergeOfflineFavorites,
  setOfflineFavorites,
  setRecentTracks,
} from "./favorites";
import { spotifyService } from "./spotify";

const STORAGE_KEYS = {
  ACCOUNT: "@ftune_cloud_account_session",
  LAST_USER_ID: "@ftune_last_synced_user_id",
  LAST_SYNC_TIME: "@ftune_last_sync_timestamp",
  ARCHIVE_PREFIX: "@ftune_user_archive_",
};

const SUPABASE_URL = "https://jbctywgcnhryyqgkssme.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1zlCAPUeNhU9osfQrbnb6A_PvTFVhOq";

const USERNAME_RE = /^[a-z0-9_@]{3,20}$/;
const SIGNIN_USERNAME_RE = /^[a-z0-9_@]{3,24}$/;
const REAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const syntheticEmail = (username: string): string =>
  `${username.trim().toLowerCase().replace(/@/g, "--")}@users.ftune.local`;

const cleanUsername = (username: string): string => username.trim().toLowerCase();

export interface SyncedLibraryPayload {
  version: number;
  updatedAt: number;
  playlists: PCPlaylist[];
  favorites: Track[];
  recentTracks: Track[];
  songCatalog: Record<string, ImportSong>;
  matchCache: Record<string, Track>;
}

class CloudAccountService {
  private user: CloudUserAccount | null = null;
  private syncing = false;
  private lastSyncedAt: number | null = null;
  private error: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(status: CloudSyncStatus) => void> = new Set();
  public onLibraryRestored:
    | ((data: { playlists: PCPlaylist[]; favorites: Track[] }) => void)
    | null = null;

  constructor() {
    this.loadPersistedSession();
    spotifyService.onLibraryMutated = () => {
      this.scheduleSync();
    };
  }

  public subscribe(listener: (status: CloudSyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  public getStatus(): CloudSyncStatus {
    return {
      signedIn: !!this.user,
      user: this.user,
      syncing: this.syncing,
      lastSyncedAt: this.lastSyncedAt,
      error: this.error,
    };
  }

  private notify() {
    const st = this.getStatus();
    for (const listener of this.listeners) {
      try {
        listener(st);
      } catch {}
    }
  }

  private async loadPersistedSession() {
    try {
      const [rawUser, rawLastSync] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ACCOUNT),
        AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME),
      ]);
      if (rawUser) {
        this.user = JSON.parse(rawUser);
      }
      if (rawLastSync) {
        this.lastSyncedAt = Number(rawLastSync) || null;
      }
      this.notify();

      if (this.user) {
        setTimeout(() => {
          this.syncNow("merge").catch(() => {});
        }, 1200);
      }
    } catch (e) {
      console.warn("[cloud-account] failed to load session:", e);
    }
  }

  private validateCredentials(username: string, password: string): string | null {
    const clean = cleanUsername(username);
    if (!USERNAME_RE.test(clean)) {
      return "Username must be 3–20 characters (letters, numbers, _ and @ only).";
    }
    if (!password || password.length < 6) {
      return "Password must be at least 6 characters.";
    }
    return null;
  }

  /**
   * Create a new FTune Cloud Account (Username + Password)
   */
  public async signUp(username: string, password: string): Promise<CloudUserAccount> {
    const clean = cleanUsername(username);
    const problem = this.validateCredentials(clean, password);
    if (problem) throw new Error(problem);

    this.error = null;
    this.syncing = true;
    this.notify();

    try {
      // Check if username is already taken
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(clean)}&select=username`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Accept: "application/json",
          },
        }
      );
      if (checkRes.ok) {
        const existing = await checkRes.json();
        if (Array.isArray(existing) && existing.length > 0) {
          throw new Error("That username is already taken.");
        }
      }

      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: syntheticEmail(clean),
          password,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = String(data?.msg || data?.error_description || data?.message || "");
        if (data?.error_code === "user_already_exists" || /already registered/i.test(msg)) {
          throw new Error("That username is already taken.");
        }
        throw new Error(msg || `Could not create account (${res.status}).`);
      }

      if (!data?.access_token || !data?.user?.id) {
        throw new Error(
          data?.msg ||
            data?.error_description ||
            "Could not create account. Email confirmation may be required."
        );
      }

      const userId: string = data.user.id;

      // Claim username in profiles table (best effort)
      await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: userId, username: clean }),
      }).catch(() => {});

      const account: CloudUserAccount = {
        id: userId,
        username: clean,
        displayName: username.trim(),
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      };

      const lastUserId = await AsyncStorage.getItem(STORAGE_KEYS.LAST_USER_ID);
      if (lastUserId && lastUserId !== account.id) {
        await this.archiveLocalStateForUser(lastUserId);
      }

      this.user = account;
      await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNT, JSON.stringify(account));
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_USER_ID, account.id);

      // Push current local playlists & liked songs up without failing account creation on network hiccup
      try {
        await this.syncNow("push-priority");
      } catch (syncErr: any) {
        this.error = syncErr?.message || "Signed up, cloud sync will retry.";
        this.scheduleSync(5000);
      }

      this.syncing = false;
      this.notify();
      return account;
    } catch (err: any) {
      this.syncing = false;
      this.error = err?.message || "Sign up failed.";
      this.notify();
      throw err;
    }
  }

  /**
   * Sign in to an existing FTune Cloud Account (username or email + password)
   */
  public async signIn(username: string, password: string): Promise<CloudUserAccount> {
    const trimmed = username.trim();
    const clean = trimmed.toLowerCase();
    if (!clean || !password) {
      throw new Error("Enter your username and password.");
    }

    const isRealEmail = REAL_EMAIL_RE.test(clean);
    if (!isRealEmail && !SIGNIN_USERNAME_RE.test(clean)) {
      throw new Error("Enter a valid username (letters, numbers, _ or @) or email.");
    }

    this.error = null;
    this.syncing = true;
    this.notify();

    try {
      const loginEmail = isRealEmail ? clean : syntheticEmail(clean);
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: loginEmail,
          password,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.access_token || !data?.user?.id) {
        if (res.status === 400 || res.status === 401 || data?.error_code === "invalid_credentials") {
          throw new Error("Wrong username or password.");
        }
        throw new Error(
          data?.msg || data?.error_description || `Sign in failed (${res.status}).`
        );
      }

      let resolvedUsername = isRealEmail ? clean.split("@")[0] : clean;
      let resolvedDisplayName = isRealEmail ? resolvedUsername : trimmed;
      try {
        const profRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(data.user.id)}&select=username`,
          {
            headers: {
              Authorization: `Bearer ${data.access_token}`,
              apikey: SUPABASE_ANON_KEY,
              Accept: "application/json",
            },
          }
        );
        if (profRes.ok) {
          const rows = await profRes.json();
          if (Array.isArray(rows) && rows[0]?.username) {
            resolvedUsername = String(rows[0].username);
            resolvedDisplayName = resolvedUsername;
          }
        }
      } catch {}

      const account: CloudUserAccount = {
        id: data.user.id,
        username: resolvedUsername,
        displayName: resolvedDisplayName,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      };

      const lastUserId = await AsyncStorage.getItem(STORAGE_KEYS.LAST_USER_ID);
      const isDifferentAccount = !!lastUserId && lastUserId !== account.id;

      if (isDifferentAccount) {
        await this.archiveLocalStateForUser(lastUserId);
        await this.clearActiveLocalLibrary();
      }

      this.user = account;
      await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNT, JSON.stringify(account));
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_USER_ID, account.id);

      try {
        await this.syncNow(isDifferentAccount ? "pull-first" : "merge");
      } catch (syncErr: any) {
        this.error = syncErr?.message || "Signed in, cloud sync will retry.";
        this.scheduleSync(5000);
      }

      this.syncing = false;
      this.notify();
      return account;
    } catch (err: any) {
      this.syncing = false;
      this.error = err?.message || "Sign in failed.";
      this.notify();
      throw err;
    }
  }

  private async ensureValidToken(): Promise<CloudUserAccount | null> {
    if (!this.user) return null;
    if (this.user.expiresAt && Date.now() < this.user.expiresAt - 60_000) {
      return this.user;
    }

    if (this.user.refreshToken) {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ refresh_token: this.user.refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.access_token) {
            this.user = {
              ...this.user,
              accessToken: data.access_token,
              refreshToken: data.refresh_token || this.user.refreshToken,
              expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
            };
            await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNT, JSON.stringify(this.user));
            return this.user;
          }
        } else if (res.status === 400 || res.status === 401) {
          this.user = null;
          this.error = "Session expired. Please sign in again.";
          await AsyncStorage.removeItem(STORAGE_KEYS.ACCOUNT);
          this.notify();
          return null;
        }
      } catch (e) {
        console.warn("[cloud-account] token refresh error:", e);
      }
    }
    return this.user;
  }

  public scheduleSync(delayMs = 2000) {
    if (!this.user) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.syncNow("push-priority").catch(() => {});
    }, delayMs);
  }

  private async readRemoteLibrary(account: CloudUserAccount): Promise<SyncedLibraryPayload | null> {
    try {
      const url = `${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${encodeURIComponent(
        account.id
      )}&store_name=eq.library&select=payload,updated_at`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          Accept: "application/json",
        },
      });
      if (!res.ok) return null;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const row = rows[0];
      const state = row?.payload?.state || row?.payload;
      if (!state || typeof state !== "object") return null;

      return {
        version: 1,
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
        playlists: Array.isArray(state.playlists) ? state.playlists : [],
        favorites: Array.isArray(state.liked)
          ? state.liked
          : Array.isArray(state.favorites)
          ? state.favorites
          : [],
        recentTracks: Array.isArray(state.history)
          ? state.history
          : Array.isArray(state.recentTracks)
          ? state.recentTracks
          : [],
        songCatalog: state.songCatalog || {},
        matchCache: state.matchCache || {},
      };
    } catch (e) {
      console.warn("[cloud-account] read error:", e);
      return null;
    }
  }

  private async writeRemoteLibrary(
    account: CloudUserAccount,
    payload: SyncedLibraryPayload
  ): Promise<boolean> {
    try {
      const envelope = {
        version: 1,
        state: {
          playlists: payload.playlists,
          liked: payload.favorites,
          history: payload.recentTracks,
          songCatalog: payload.songCatalog,
          matchCache: payload.matchCache,
        },
      };

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id,store_name`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            user_id: account.id,
            store_name: "library",
            payload: envelope,
            updated_at: new Date(payload.updatedAt).toISOString(),
          }),
        }
      );
      return res.ok;
    } catch (e) {
      console.warn("[cloud-account] write error:", e);
      return false;
    }
  }

  public async syncNow(
    mode: "merge" | "pull-first" | "push-priority" = "merge"
  ): Promise<{ playlists: PCPlaylist[]; favorites: Track[] }> {
    const account = await this.ensureValidToken();
    if (!account) {
      throw new Error("Sign in first.");
    }

    this.syncing = true;
    this.error = null;
    this.notify();

    try {
      const [localFavorites, localRecents] = await Promise.all([
        getOfflineFavorites(),
        getRecentTracks(),
      ]);
      const localSnap = spotifyService.getSyncSnapshot();
      const remotePayload = await this.readRemoteLibrary(account);

      let finalPlaylists = localSnap.playlists;
      let finalFavorites = localFavorites;
      let finalRecents = localRecents;
      let finalCatalog = localSnap.songCatalog;
      let finalMatchCache = localSnap.matchCache;

      if (remotePayload) {
        if (mode === "pull-first") {
          finalPlaylists =
            remotePayload.playlists.length > 0 ? remotePayload.playlists : localSnap.playlists;
          finalFavorites =
            remotePayload.favorites.length > 0 ? remotePayload.favorites : localFavorites;
          finalRecents =
            remotePayload.recentTracks.length > 0 ? remotePayload.recentTracks : localRecents;
          finalCatalog = { ...localSnap.songCatalog, ...remotePayload.songCatalog };
          finalMatchCache = { ...localSnap.matchCache, ...remotePayload.matchCache };

          await setOfflineFavorites(finalFavorites);
          await setRecentTracks(finalRecents);
          finalPlaylists = await spotifyService.applySyncSnapshot(
            {
              playlists: finalPlaylists,
              songCatalog: finalCatalog,
              matchCache: finalMatchCache,
            },
            true
          );
        } else if (mode === "push-priority") {
          finalPlaylists = localSnap.playlists;
          finalFavorites = localFavorites;
          finalRecents = localRecents;
          finalCatalog = { ...remotePayload.songCatalog, ...localSnap.songCatalog };
          finalMatchCache = { ...remotePayload.matchCache, ...localSnap.matchCache };
        } else {
          finalFavorites = await mergeOfflineFavorites(remotePayload.favorites || []);
          finalPlaylists = await spotifyService.applySyncSnapshot(
            {
              playlists: remotePayload.playlists || [],
              songCatalog: remotePayload.songCatalog || {},
              matchCache: remotePayload.matchCache || {},
            },
            false
          );
          finalCatalog = spotifyService.getSyncSnapshot().songCatalog;
          finalMatchCache = spotifyService.getSyncSnapshot().matchCache;
        }
      }

      const outgoing: SyncedLibraryPayload = {
        version: 1,
        updatedAt: Date.now(),
        playlists: finalPlaylists,
        favorites: finalFavorites,
        recentTracks: finalRecents,
        songCatalog: finalCatalog,
        matchCache: finalMatchCache,
      };

      const saved = await this.writeRemoteLibrary(account, outgoing);
      if (!saved) {
        throw new Error("Could not save library to cloud.");
      }

      this.lastSyncedAt = Date.now();
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, String(this.lastSyncedAt));

      this.onLibraryRestored?.({
        playlists: finalPlaylists,
        favorites: finalFavorites,
      });

      this.syncing = false;
      this.notify();
      return { playlists: finalPlaylists, favorites: finalFavorites };
    } catch (err: any) {
      this.syncing = false;
      this.error = err?.message || "Sync failed.";
      this.notify();
      throw err;
    }
  }

  private async archiveLocalStateForUser(userId: string): Promise<void> {
    try {
      const [favorites, recentTracks] = await Promise.all([
        getOfflineFavorites(),
        getRecentTracks(),
      ]);
      const snap = spotifyService.getSyncSnapshot();
      await AsyncStorage.setItem(
        `${STORAGE_KEYS.ARCHIVE_PREFIX}${userId}`,
        JSON.stringify({
          favorites,
          recentTracks,
          ...snap,
          archivedAt: Date.now(),
        })
      );
    } catch {}
  }

  private async clearActiveLocalLibrary(): Promise<void> {
    await setOfflineFavorites([]);
    await setRecentTracks([]);
    await spotifyService.applySyncSnapshot(
      { playlists: [], songCatalog: {}, matchCache: {} },
      true
    );
    this.onLibraryRestored?.({ playlists: [], favorites: [] });
  }

  public async signOut(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.user) {
      try {
        await this.syncNow("push-priority");
      } catch {}
      await this.archiveLocalStateForUser(this.user.id);
    }

    this.user = null;
    this.lastSyncedAt = null;
    this.error = null;

    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.ACCOUNT),
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_USER_ID),
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC_TIME),
    ]);

    await this.clearActiveLocalLibrary();
    this.notify();
  }
}

export const cloudAccountService = new CloudAccountService();
