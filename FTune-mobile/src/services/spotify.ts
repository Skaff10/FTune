import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ImportedPlaylist, ImportSong, SpotifyPlaylistInfo, SpotifyStatus, Track } from "../types";
import { getServerUrl, isServerConnected } from "./api";
import { directYouTubeMusicSearch } from "./youtubeSearch";

const STORAGE_KEYS = {
  STATUS: "ftune_spotify_status",
  TOKEN: "ftune_spotify_token",
  PLAYLISTS: "ftune_spotify_playlists",
  MATCHES: "ftune_spotify_matches_cache",
};

export const LIKED_ID = "liked";

/** Liked Songs sleeve image: custom SVG matching PC FTune specification */
export const LIKED_SLEEVE =
  "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&auto=format&fit=crop&q=80";

class SpotifyMobileService {
  private status: SpotifyStatus = { connected: false };
  private token: string | null = null;
  private playlists: SpotifyPlaylistInfo[] = [];
  private matchCache: Record<string, Track> = {};
  private listeners: Set<(status: SpotifyStatus) => void> = new Set();

  constructor() {
    this.loadPersistedState();
  }

  public subscribe(listener: (status: SpotifyStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.status);
      } catch {}
    }
  }

  private async loadPersistedState() {
    try {
      const [savedStatus, savedToken, savedPlaylists, savedMatches] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.STATUS),
        AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.PLAYLISTS),
        AsyncStorage.getItem(STORAGE_KEYS.MATCHES),
      ]);

      if (savedStatus) {
        this.status = JSON.parse(savedStatus);
      }
      if (savedToken) {
        this.token = savedToken;
      }
      if (savedPlaylists) {
        this.playlists = JSON.parse(savedPlaylists);
      }
      if (savedMatches) {
        this.matchCache = JSON.parse(savedMatches);
      }
      this.notify();
    } catch (e) {
      console.warn("[spotify-mobile] failed to load persisted state:", e);
    }
  }

  public getStatus(): SpotifyStatus {
    return this.status;
  }

  public getPlaylists(): SpotifyPlaylistInfo[] {
    return this.playlists;
  }

  /**
   * Save successful in-app login from WebView session
   */
  public async setAuthSession(data: { token: string; name?: string }): Promise<SpotifyStatus> {
    this.token = data.token;
    this.status = {
      connected: true,
      name: data.name || "Spotify Listener",
      problem: undefined,
    };

    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, this.token);
    await AsyncStorage.setItem(STORAGE_KEYS.STATUS, JSON.stringify(this.status));

    // Fetch initial playlists
    await this.refreshPlaylists();
    this.notify();
    return this.status;
  }

  /**
   * Disconnect Spotify session
   */
  public async disconnect(): Promise<void> {
    this.token = null;
    this.status = { connected: false };
    this.playlists = [];

    await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEYS.STATUS);
    await AsyncStorage.removeItem(STORAGE_KEYS.PLAYLISTS);

    if (isServerConnected()) {
      try {
        const pcUrl = getServerUrl();
        await fetch(`${pcUrl}/api/spotify/disconnect`, { method: "POST" });
      } catch {}
    }

    this.notify();
  }

  /**
   * Refresh Spotify playlists & Liked Songs.
   * If connected to PC, pulls directly from PC. If standalone on mobile, uses Spotify APIs.
   */
  public async refreshPlaylists(): Promise<SpotifyPlaylistInfo[]> {
    // 1. If connected to FTune Desktop PC, sync with PC's Spotify instance
    if (isServerConnected()) {
      try {
        const pcUrl = getServerUrl();
        const res = await fetch(`${pcUrl}/api/spotify/playlists`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.playlists) && data.playlists.length > 0) {
            this.playlists = data.playlists;
            this.status = { connected: true, name: this.status.name || "Synced from PC" };
            await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(this.playlists));
            await AsyncStorage.setItem(STORAGE_KEYS.STATUS, JSON.stringify(this.status));
            this.notify();
            return this.playlists;
          }
        }
      } catch (err) {
        console.warn("[spotify-mobile] PC sync error:", err);
      }
    }

    // 2. Standalone mobile mode with user token
    if (this.token) {
      try {
        const lists: SpotifyPlaylistInfo[] = [
          {
            id: LIKED_ID,
            name: "Liked Songs",
            owner: this.status.name,
            thumb: LIKED_SLEEVE,
          },
        ];

        // Fetch user's playlists
        const res = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
        });

        if (res.status === 401) {
          this.status = { connected: false, problem: "Session expired. Please sign in again." };
          this.notify();
          return [];
        }

        if (res.ok) {
          const data = await res.json();
          for (const item of data?.items || []) {
            if (!item?.id || !item?.name) continue;
            lists.push({
              id: item.id,
              name: item.name,
              owner: item.owner?.display_name || "Spotify",
              thumb: item.images?.[0]?.url || "",
              total: item.tracks?.total || 0,
            });
          }
        }

        this.playlists = lists;
        await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(this.playlists));
        this.notify();
        return this.playlists;
      } catch (err: any) {
        console.warn("[spotify-mobile] fetch playlists error:", err);
      }
    }

    return this.playlists;
  }

  /**
   * Fetch songs for a playlist or Liked Songs
   */
  public async fetchPlaylistTracks(id: string): Promise<ImportedPlaylist> {
    // 1. Try fetching via PC server if connected
    if (isServerConnected()) {
      try {
        const pcUrl = getServerUrl();
        const res = await fetch(`${pcUrl}/api/spotify/playlist?id=${encodeURIComponent(id)}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn("[spotify-mobile] PC playlist tracks error:", err);
      }
    }

    // 2. Standalone Liked Songs
    if (id === LIKED_ID && this.token) {
      try {
        const res = await fetch("https://api.spotify.com/v1/me/tracks?limit=50", {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const songs: ImportSong[] = (data?.items || []).map((item: any) => {
            const track = item.track;
            return {
              spotifyId: track?.id,
              title: track?.name || "Unknown Track",
              artist: (track?.artists || []).map((a: any) => a.name).join(", "),
              album: track?.album?.name,
              duration: Math.round((track?.duration_ms || 0) / 1000),
              thumb: track?.album?.images?.[0]?.url || "",
              explicit: track?.explicit,
            };
          });
          return {
            name: "Liked Songs",
            owner: this.status.name,
            total: data?.total || songs.length,
            thumb: LIKED_SLEEVE,
            songs,
          };
        }
      } catch (err) {
        console.warn("[spotify-mobile] fetch liked tracks error:", err);
      }
    }

    // 3. Standalone user playlist
    if (this.token && id !== LIKED_ID) {
      try {
        const res = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const songs: ImportSong[] = (data?.tracks?.items || []).map((item: any) => {
            const track = item.track || item;
            return {
              spotifyId: track?.id,
              title: track?.name || "Unknown Track",
              artist: (track?.artists || []).map((a: any) => a.name).join(", "),
              album: track?.album?.name,
              duration: Math.round((track?.duration_ms || 0) / 1000),
              thumb: track?.album?.images?.[0]?.url || "",
              explicit: track?.explicit,
            };
          });
          return {
            name: data?.name || "Spotify Playlist",
            owner: data?.owner?.display_name,
            total: data?.tracks?.total || songs.length,
            thumb: data?.images?.[0]?.url || "",
            songs,
          };
        }
      } catch (err) {
        console.warn("[spotify-mobile] fetch playlist tracks error:", err);
      }
    }

    // 4. Fallback: Try reading public embed page
    return this.fetchPublicPlaylist(`https://open.spotify.com/playlist/${id}`);
  }

  /**
   * Read any public Spotify playlist without login
   */
  public async fetchPublicPlaylist(link: string): Promise<ImportedPlaylist> {
    // 1. Try PC first if connected
    if (isServerConnected()) {
      try {
        const pcUrl = getServerUrl();
        const res = await fetch(`${pcUrl}/api/spotify/public?link=${encodeURIComponent(link)}`);
        if (res.ok) {
          return await res.json();
        }
      } catch {}
    }

    // 2. Parse Spotify embed page directly on mobile
    const match = /(?:playlist|album)[\/:]([A-Za-z0-9]{22})/.exec(link);
    const id = match ? match[1] : link;

    const embedUrl = `https://open.spotify.com/embed/playlist/${id}`;
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) throw new Error("Could not load Spotify playlist");
    const html = await res.text();
    const dataMatch = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    if (!dataMatch) throw new Error("Could not parse Spotify data");

    const root = JSON.parse(dataMatch[1]);
    const state = root?.props?.pageProps?.state;
    const entity = state?.data?.entity;
    if (!entity) throw new Error("Spotify playlist not found");

    const songs: ImportSong[] = (entity.trackList || []).map((t: any) => ({
      spotifyId: t.uri ? t.uri.replace("spotify:track:", "") : undefined,
      title: t.title || "Unknown Title",
      artist: t.subtitle || "",
      duration: Math.round((t.duration || 0) / 1000),
      explicit: t.isExplicit,
    }));

    return {
      name: entity.title || entity.name || "Spotify Playlist",
      owner: entity.subtitle || "Spotify",
      total: songs.length,
      thumb: entity.coverArt?.sources?.[0]?.url || "",
      songs,
    };
  }

  /**
   * Match a Spotify song to a playable YouTube Music track
   */
  public async matchSongToYouTube(song: ImportSong): Promise<Track | null> {
    const cacheKey = song.spotifyId || `${song.title}:::${song.artist}`;
    if (this.matchCache[cacheKey]) {
      return this.matchCache[cacheKey];
    }

    try {
      const searchRes = await directYouTubeMusicSearch(`${song.title} ${song.artist}`, "songs");
      const candidates = searchRes.songs || [];
      if (candidates.length === 0) return null;

      // Find best match by comparing title, artist and duration (±18s)
      const targetDuration = song.duration || 0;
      let best = candidates[0];
      let bestScore = -1;

      for (const candidate of candidates.slice(0, 5)) {
        let score = 0;
        const normCandTitle = candidate.title.toLowerCase();
        const normSongTitle = song.title.toLowerCase();

        if (normCandTitle === normSongTitle) score += 50;
        else if (normCandTitle.includes(normSongTitle) || normSongTitle.includes(normCandTitle)) score += 30;

        const normCandArtist = candidate.artist.toLowerCase();
        const normSongArtist = song.artist.toLowerCase();
        if (normCandArtist.includes(normSongArtist) || normSongArtist.includes(normCandArtist)) score += 25;

        if (targetDuration > 0 && candidate.duration > 0) {
          const diff = Math.abs(candidate.duration - targetDuration);
          if (diff <= 5) score += 25;
          else if (diff <= 15) score += 15;
          else if (diff <= 30) score += 5;
        }

        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      // Preserve Spotify thumb if candidate thumbnail is low-res
      const matchedTrack: Track = {
        ...best,
        thumb: song.thumb || best.thumb,
        album: song.album || best.album,
      };

      this.matchCache[cacheKey] = matchedTrack;
      // Persist top 200 matches
      AsyncStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(this.matchCache)).catch(() => {});
      return matchedTrack;
    } catch (err) {
      console.warn("[spotify-mobile] match error for", song.title, err);
      return null;
    }
  }
}

export const spotifyService = new SpotifyMobileService();

