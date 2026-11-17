import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  ImportedPlaylist,
  ImportSong,
  PCPlaylist,
  SpotifyPlaylistInfo,
  SpotifyStatus,
  Track,
} from "../types";
import { getServerUrl, isServerConnected } from "./api";
import { directYouTubeMusicSearch } from "./youtubeSearch";
import { mergeOfflineFavorites } from "./favorites";

const STORAGE_KEYS = {
  STATUS: "ftune_spotify_status",
  TOKEN: "ftune_spotify_token",
  TOKEN_EXPIRES: "ftune_spotify_token_expires",
  PLAYLISTS: "ftune_spotify_playlists",
  BORROWED: "ftune_borrowed_playlists",
  CATALOG: "ftune_spotify_song_catalog",
  MATCHES: "ftune_spotify_matches_cache",
};

export const LIKED_ID = "liked";

/** Liked Songs sleeve image */
export const LIKED_SLEEVE =
  "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&auto=format&fit=crop&q=80";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WEB_BASE = "https://open.spotify.com";
const PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v2/query";

const KNOWN_HASHES = {
  fetchPlaylist: "21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf",
  libraryV3: "390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455",
  fetchLibraryTracks: "087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240",
  profileAttributes: "08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0",
};
type OperationName = keyof typeof KNOWN_HASHES;

const DEFAULT_SECRET = {
  version: 61,
  secret: ',7/*F("rLJ2oxaKL^f+E1xvP@N',
};

/* ---------------- Pure-TS SHA1 + HMAC-SHA1 + Spotify TOTP ---------------- */

function sha1(bytes: Uint8Array): Uint8Array {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const ml = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;

  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 4, ml >>> 0, false);
  view.setUint32(paddedLen - 8, Math.floor(ml / 0x100000000), false);

  const w = new Uint32Array(80);
  const rotl = (n: number, s: number) => ((n << s) | (n >>> (32 - s))) >>> 0;

  for (let i = 0; i < paddedLen; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
    for (let j = 16; j < 80; j++) {
      w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j++) {
      let f: number;
      let k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + (f >>> 0) + e + k + w[j]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  return out;
}

function hmacSha1(keyBytes: Uint8Array, msgBytes: Uint8Array): Uint8Array {
  const blockSize = 64;
  const k = keyBytes.length > blockSize ? sha1(keyBytes) : keyBytes;
  const ipad = new Uint8Array(blockSize + msgBytes.length);
  const opad = new Uint8Array(blockSize + 20);
  for (let i = 0; i < blockSize; i++) {
    const b = i < k.length ? k[i] : 0;
    ipad[i] = b ^ 0x36;
    opad[i] = b ^ 0x5c;
  }
  ipad.set(msgBytes, blockSize);
  opad.set(sha1(ipad), blockSize);
  return sha1(opad);
}

function encodeUtf8(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

export function generateSpotifyTotp(secret: string, epochMs = Date.now()): string {
  const xored = [...secret].map((c, i) => c.charCodeAt(0) ^ ((i % 33) + 9)).join("");
  const keyBytes = encodeUtf8(xored);
  const counter = Math.floor(epochMs / 30000);
  const block = new Uint8Array(8);
  const dv = new DataView(block.buffer);
  dv.setUint32(0, Math.floor(counter / 0x100000000), false);
  dv.setUint32(4, counter >>> 0, false);
  const h = hmacSha1(keyBytes, block);
  const o = h[h.length - 1] & 0x0f;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

function unescapeJs(body: string): string {
  return body.replace(
    /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g,
    (_, esc: string) => {
      if (esc[0] === "u" && esc.length > 1) {
        return String.fromCodePoint(parseInt(esc.replace(/[u{}]/g, ""), 16));
      }
      if (esc[0] === "x" && esc.length === 3) {
        return String.fromCharCode(parseInt(esc.slice(1), 16));
      }
      return (
        ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" } as Record<
          string,
          string
        >)[esc] ?? esc
      );
    }
  );
}

/* ---------------- JSON parsing helpers ---------------- */

type JsonObj = Record<string, any>;
const asObj = (v: any): JsonObj | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObj) : null;
const asArr = (v: any): any[] => (Array.isArray(v) ? v : []);
const asStr = (v: any): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const asNum = (v: any): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const getAt = (v: any, ...keys: string[]): any =>
  keys.reduce<any>((o, k) => asObj(o)?.[k], v);

function pickImage(sources: any, minWidth = 280): string | undefined {
  const list = asArr(sources)
    .map((s) => ({ url: asStr(getAt(s, "url")), width: asNum(getAt(s, "width")) ?? 0 }))
    .filter((s): s is { url: string; width: number } => !!s.url?.startsWith("https://"))
    .sort((a, b) => a.width - b.width);
  return (list.find((s) => s.width >= minWidth) ?? list[list.length - 1])?.url;
}

function extractTrackId(uri: any): string | undefined {
  const s = asStr(uri) ?? "";
  const m = /spotify:track:([A-Za-z0-9]{22})/.exec(s);
  return m ? m[1] : undefined;
}

function toSeconds(ms: any): number {
  const n = asNum(ms);
  return n && n > 0 && n < 86_400_000 ? Math.round(n / 1000) : 0;
}

function parsePathfinderSong(data: any, uri: any, fallbackThumb?: string): ImportSong | null {
  const title = asStr(getAt(data, "name"));
  const spotifyId = extractTrackId(uri) ?? extractTrackId(getAt(data, "uri"));
  if (!title) return null;
  const artist = asArr(getAt(data, "artists", "items"))
    .map((a) => asStr(getAt(a, "profile", "name")) || asStr(getAt(a, "name")))
    .filter(Boolean)
    .join(", ");
  const albumObj = asObj(getAt(data, "albumOfTrack"));
  const thumb = pickImage(getAt(albumObj, "coverArt", "sources")) || fallbackThumb || "";
  return {
    spotifyId: spotifyId || `${title}-${artist}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 22),
    title,
    artist: artist || "Spotify Artist",
    album: asStr(albumObj?.name),
    duration: toSeconds(
      getAt(data, "trackDuration", "totalMilliseconds") ??
        getAt(data, "duration", "totalMilliseconds")
    ),
    thumb,
    explicit: getAt(data, "contentRating", "label") === "EXPLICIT",
  };
}

class SpotifyMobileService {
  private status: SpotifyStatus = { connected: false };
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private refreshPromise: Promise<string | null> | null = null;
  private playlists: SpotifyPlaylistInfo[] = [];
  private borrowedPlaylists: PCPlaylist[] = [];
  private songCatalog: Record<string, ImportSong> = {};
  private matchCache: Record<string, Track> = {};
  private hashes: Record<OperationName, string> = { ...KNOWN_HASHES };
  private playerSecret: { version: number; secret: string } = { ...DEFAULT_SECRET };
  private listeners: Set<(status: SpotifyStatus) => void> = new Set();
  public onLibraryMutated: (() => void) | null = null;

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
      const [
        savedStatus,
        savedToken,
        savedTokenExpires,
        savedPlaylists,
        savedBorrowed,
        savedCatalog,
        savedMatches,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.STATUS),
        AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES),
        AsyncStorage.getItem(STORAGE_KEYS.PLAYLISTS),
        AsyncStorage.getItem(STORAGE_KEYS.BORROWED),
        AsyncStorage.getItem(STORAGE_KEYS.CATALOG),
        AsyncStorage.getItem(STORAGE_KEYS.MATCHES),
      ]);

      if (savedStatus) this.status = JSON.parse(savedStatus);
      if (savedToken) this.token = savedToken;
      if (savedTokenExpires) this.tokenExpiresAt = Number(savedTokenExpires) || 0;
      if (savedPlaylists) this.playlists = JSON.parse(savedPlaylists);
      if (savedBorrowed) this.borrowedPlaylists = JSON.parse(savedBorrowed);
      if (savedCatalog) this.songCatalog = JSON.parse(savedCatalog);
      if (savedMatches) this.matchCache = JSON.parse(savedMatches);
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

  public getBorrowedPlaylists(): PCPlaylist[] {
    return this.borrowedPlaylists;
  }

  public isPlaylistBorrowed(spotifyPlaylistId: string): boolean {
    const targetId = `spotify_${spotifyPlaylistId}`;
    return this.borrowedPlaylists.some((p) => p.id === targetId || p.id === spotifyPlaylistId);
  }

  /**
   * Read latest web-player script for fresh TOTP secret & Pathfinder query hashes
   */
  public async refreshWebPlayerMetadata(): Promise<{
    version: number;
    secret: string;
    totp: string;
  }> {
    try {
      const pageRes = await fetch(`${WEB_BASE}/`, {
        headers: { "User-Agent": DESKTOP_UA },
      });
      const html = await pageRes.text();
      const scriptUrl =
        /https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[0-9a-f]+\.js/.exec(
          html
        )?.[0];
      if (scriptUrl) {
        const scriptRes = await fetch(scriptUrl, {
          headers: { "User-Agent": DESKTOP_UA },
        });
        const script = await scriptRes.text();
        const found = [
          ...script.matchAll(/\{secret:(['"])((?:\\.|(?!\1).)*)\1,version:(\d+)\}/g),
        ]
          .map((m) => ({
            version: Number(m[3]),
            secret: unescapeJs(m[2]),
          }))
          .sort((a, b) => b.version - a.version);

        if (found[0]) {
          this.playerSecret = found[0];
        }

        for (const op of Object.keys(KNOWN_HASHES) as OperationName[]) {
          const m = new RegExp(
            `["']${op}["']\\s*,\\s*["']query["']\\s*,\\s*["']([0-9a-f]{64})["']`
          ).exec(script);
          if (m?.[1]) {
            this.hashes[op] = m[1];
          }
        }
      }
    } catch (err) {
      console.warn("[spotify-mobile] metadata refresh fallback to default:", err);
    }

    return {
      version: this.playerSecret.version,
      secret: this.playerSecret.secret,
      totp: generateSpotifyTotp(this.playerSecret.secret, Date.now()),
    };
  }

  /**
   * Attempt to refresh the user's Spotify web-player token using shared WebView cookies (`sp_dc`)
   */
  public async tryRefreshTokenFromCookies(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const fetchWithSecret = async (
        reason: "init" | "transport",
        ver: number,
        secret: string
      ) => {
        const totp = generateSpotifyTotp(secret, Date.now());
        const url = `${WEB_BASE}/api/token?reason=${reason}&productType=web-player&totp=${totp}&totpServer=${totp}&totpVer=${ver}`;
        const res = await fetch(url, {
          credentials: "include",
          headers: {
            Accept: "application/json",
            Origin: WEB_BASE,
            Referer: `${WEB_BASE}/`,
            "User-Agent": DESKTOP_UA,
          },
        });
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        if (data?.accessToken && data?.isAnonymous === false) {
          return data;
        }
        return null;
      };

      try {
        let data = await fetchWithSecret(
          "transport",
          this.playerSecret.version,
          this.playerSecret.secret
        );
        if (!data) {
          const meta = await this.refreshWebPlayerMetadata();
          data = await fetchWithSecret("init", meta.version, meta.secret);
        }
        if (data?.accessToken) {
          const nextToken = String(data.accessToken);
          this.token = nextToken;
          this.tokenExpiresAt =
            typeof data.accessTokenExpirationTimestampMs === "number" &&
            data.accessTokenExpirationTimestampMs > Date.now()
              ? data.accessTokenExpirationTimestampMs
              : Date.now() + 50 * 60_000;
          await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, nextToken);
          await AsyncStorage.setItem(
            STORAGE_KEYS.TOKEN_EXPIRES,
            String(this.tokenExpiresAt)
          );
          return nextToken;
        }
      } catch (e) {
        console.warn("[spotify-mobile] cookie token refresh failed:", e);
      }
      return null;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async handleExpiredSession(): Promise<void> {
    this.token = null;
    this.tokenExpiresAt = 0;
    this.status = {
      connected: false,
      problem: "Spotify session expired. Please sign in again.",
    };
    await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES);
    await AsyncStorage.setItem(STORAGE_KEYS.STATUS, JSON.stringify(this.status));
    this.notify();
  }

  /**
   * Execute a Spotify Web Player Pathfinder GraphQL query
   */
  private async queryPathfinder(
    op: OperationName,
    variables: Record<string, any>,
    tokenOverride?: string,
    retried = false
  ): Promise<any> {
    if (
      !tokenOverride &&
      !retried &&
      this.token &&
      this.tokenExpiresAt > 0 &&
      Date.now() >= this.tokenExpiresAt - 60_000
    ) {
      await this.tryRefreshTokenFromCookies();
    }

    const authToken = tokenOverride || this.token;
    if (!authToken) throw new Error("Not signed in to Spotify");

    const res = await fetch(PATHFINDER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/json",
        "Content-Type": "application/json;charset=UTF-8",
        "App-Platform": "WebPlayer",
        "User-Agent": DESKTOP_UA,
      },
      body: JSON.stringify({
        variables,
        operationName: op,
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: this.hashes[op] || KNOWN_HASHES[op],
          },
        },
      }),
    });

    if (res.status === 401) {
      if (!tokenOverride && !retried) {
        const refreshed = await this.tryRefreshTokenFromCookies();
        if (refreshed) {
          return this.queryPathfinder(op, variables, undefined, true);
        }
        await this.handleExpiredSession();
      }
      throw new Error("Spotify session expired. Please sign in again.");
    }

    const body = await res.json().catch(() => null);
    if (
      !retried &&
      body?.errors?.some((e: any) => /PersistedQueryNotFound/i.test(e?.message ?? ""))
    ) {
      await this.refreshWebPlayerMetadata();
      return this.queryPathfinder(op, variables, tokenOverride, true);
    }

    if (!res.ok || !body?.data) {
      throw new Error(`Spotify query ${op} failed (${res.status})`);
    }
    return body;
  }

  /**
   * Save successful in-app login from WebView session and load all playlists + Liked Songs
   */
  public async setAuthSession(data: {
    token: string;
    name?: string;
    expiresAt?: number;
  }): Promise<SpotifyStatus> {
    this.token = data.token;
    this.tokenExpiresAt =
      typeof data.expiresAt === "number" && data.expiresAt > Date.now()
        ? data.expiresAt
        : Date.now() + 50 * 60_000;
    let displayName = data.name || "";

    // Try fetching user profile display name via Pathfinder or Web API
    if (!displayName || displayName === "Spotify Listener") {
      try {
        const prof = await this.queryPathfinder("profileAttributes", {});
        const pName =
          asStr(getAt(prof, "data", "me", "profile", "name")) ??
          asStr(getAt(prof, "data", "me", "profile", "username"));
        if (pName) displayName = pName;
      } catch {
        try {
          const meRes = await fetch("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${this.token}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            if (me?.display_name || me?.id) displayName = me.display_name || me.id;
          }
        } catch {}
      }
    }

    if (!this.token) {
      return this.status;
    }

    this.status = {
      connected: true,
      name: displayName || "Spotify Listener",
      problem: undefined,
    };

    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, this.token);
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES, String(this.tokenExpiresAt));
    await AsyncStorage.setItem(STORAGE_KEYS.STATUS, JSON.stringify(this.status));

    await this.refreshPlaylists();
    this.notify();
    return this.status;
  }

  /**
   * Disconnect Spotify session
   */
  public async disconnect(): Promise<void> {
    this.token = null;
    this.tokenExpiresAt = 0;
    this.status = { connected: false };
    this.playlists = [];

    await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES);
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
   * Explicitly sync Spotify playlists from a connected FTune Desktop PC instance.
   */
  public async syncFromPC(): Promise<{
    ok: boolean;
    count: number;
    message?: string;
  }> {
    if (!isServerConnected()) {
      return {
        ok: false,
        count: 0,
        message: "Not connected to FTune Desktop PC.",
      };
    }

    try {
      const pcUrl = getServerUrl();
      const res = await fetch(`${pcUrl}/api/spotify/playlists`);
      if (!res.ok) {
        return {
          ok: false,
          count: 0,
          message: `PC server returned status ${res.status}.`,
        };
      }
      const data = await res.json();
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        this.playlists = data.playlists;
        this.status = {
          connected: true,
          name: this.status.name || "Synced from PC",
          problem: undefined,
        };
        await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(this.playlists));
        await AsyncStorage.setItem(STORAGE_KEYS.STATUS, JSON.stringify(this.status));
        this.notify();
        return { ok: true, count: this.playlists.length };
      }

      return {
        ok: false,
        count: 0,
        message: "No Spotify playlists found on FTune PC. Sign in to Spotify on PC first.",
      };
    } catch (err: any) {
      return {
        ok: false,
        count: 0,
        message: err?.message || "Failed to reach FTune PC.",
      };
    }
  }

  /**
   * Refresh Spotify playlists & Liked Songs.
   * Uses Pathfinder libraryV3 + fetchLibraryTracks + Web API /v1/me/playlists fallback,
   * and also checks FTune PC if connected and no local token is present.
   */
  public async refreshPlaylists(): Promise<SpotifyPlaylistInfo[]> {
    // 1. If we have a user token from mobile sign-in, fetch directly from Spotify
    if (this.token) {
      try {
        let likedCount = 0;
        let anySuccess = false;

        // Get Liked Songs total count
        try {
          const likedJson = await this.queryPathfinder("fetchLibraryTracks", {
            offset: 0,
            limit: 1,
          });
          likedCount =
            asNum(getAt(likedJson, "data", "me", "library", "tracks", "totalCount")) ?? 0;
          anySuccess = true;
        } catch {
          if (!this.token) {
            return this.playlists;
          }
          try {
            const r = await fetch("https://api.spotify.com/v1/me/tracks?limit=1", {
              headers: { Authorization: `Bearer ${this.token}` },
            });
            if (r.ok) {
              const d = await r.json();
              likedCount = d?.total || 0;
              anySuccess = true;
            } else if (r.status === 401) {
              const refreshed = await this.tryRefreshTokenFromCookies();
              if (!refreshed) {
                await this.handleExpiredSession();
                return this.playlists;
              }
            }
          } catch {}
        }

        if (!this.token) {
          return this.playlists;
        }

        const lists: SpotifyPlaylistInfo[] = [
          {
            id: LIKED_ID,
            name: "Liked Songs",
            owner: this.status.name || "You",
            thumb: LIKED_SLEEVE,
            total: likedCount,
          },
        ];

        const seenIds = new Set<string>([LIKED_ID]);

        // Method A: Pathfinder libraryV3 (returns all user & saved playlists in WebPlayer)
        try {
          let offset = 0;
          while (offset < 400) {
            const libJson = await this.queryPathfinder("libraryV3", {
              filters: ["Playlists"],
              order: null,
              textFilter: "",
              features: ["LIKED_SONGS", "YOUR_EPISODES_V2", "PRERELEASES", "EVENTS"],
              limit: 50,
              offset,
              flatten: true,
              expandedFolders: [],
              folderUri: null,
              includeFoldersWhenFlattening: false,
            });

            anySuccess = true;
            const library = asObj(getAt(libJson, "data", "me", "libraryV3"));
            const items = asArr(library?.items);
            if (items.length === 0) break;

            for (const entry of items) {
              const wrapper = asObj(getAt(entry, "item"));
              const data = asObj(wrapper?.data);
              const uriStr = asStr(wrapper?._uri) ?? asStr(data?.uri) ?? "";
              const idMatch = /spotify:playlist:([A-Za-z0-9]{22})/.exec(uriStr);
              const id = idMatch?.[1];
              const name = asStr(data?.name);
              if (!id || !name || seenIds.has(id)) continue;

              seenIds.add(id);
              const thumb =
                pickImage(getAt(asArr(getAt(data, "images", "items"))[0], "sources")) || "";
              const owner = asStr(getAt(data, "ownerV2", "data", "name")) || "Spotify";
              const total =
                asNum(getAt(data, "Count")) ??
                asNum(getAt(data, "totalCount")) ??
                asNum(getAt(wrapper, "count"));

              lists.push({
                id,
                name,
                owner,
                thumb,
                ...(total !== undefined ? { total } : {}),
              });
            }

            offset += items.length;
            const totalCount = asNum(library?.totalCount) ?? 0;
            if (offset >= totalCount) break;
          }
        } catch (err) {
          console.warn("[spotify-mobile] libraryV3 fallback to Web API:", err);
          if (!this.token) {
            return this.playlists;
          }
        }

        // Method B: Also check /v1/me/playlists for track totals or any additional playlists
        try {
          const res = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/json",
            },
          });
          if (res.ok) {
            anySuccess = true;
            const data = await res.json();
            for (const item of data?.items || []) {
              if (!item?.id || !item?.name) continue;
              const existing = lists.find((p) => p.id === item.id);
              if (existing) {
                if (!existing.total && item.tracks?.total) {
                  existing.total = item.tracks.total;
                }
                if (!existing.thumb && item.images?.[0]?.url) {
                  existing.thumb = item.images[0].url;
                }
              } else {
                seenIds.add(item.id);
                lists.push({
                  id: item.id,
                  name: item.name,
                  owner: item.owner?.display_name || "Spotify",
                  thumb: item.images?.[0]?.url || "",
                  total: item.tracks?.total || 0,
                });
              }
            }
          } else if (res.status === 401 && !anySuccess) {
            await this.handleExpiredSession();
            return this.playlists;
          }
        } catch {}

        if (anySuccess) {
          this.playlists = lists;
          await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(this.playlists));
          this.notify();
        }
        return this.playlists;
      } catch (err: any) {
        console.warn("[spotify-mobile] refreshPlaylists error:", err);
      }
    }

    // 2. Fallback: If connected to FTune Desktop PC, sync with PC's Spotify instance
    if (!this.token && isServerConnected()) {
      await this.syncFromPC();
    }

    return this.playlists;
  }

  /**
   * Fetch all songs for a playlist or Liked Songs (`LIKED_ID`)
   */
  public async fetchPlaylistTracks(id: string): Promise<ImportedPlaylist> {
    // 1. Standalone Liked Songs via Pathfinder or Web API
    if (id === LIKED_ID && this.token) {
      try {
        const allSongs: ImportSong[] = [];
        let total = 0;
        for (let offset = 0; offset < 1000; offset += 100) {
          const json = await this.queryPathfinder("fetchLibraryTracks", {
            offset,
            limit: 100,
          });
          const tracksObj = asObj(getAt(json, "data", "me", "library", "tracks"));
          if (!tracksObj) break;
          total = asNum(tracksObj.totalCount) ?? total;
          const items = asArr(tracksObj.items);
          if (items.length === 0) break;

          for (const item of items) {
            const wrapper = getAt(item, "track");
            const song = parsePathfinderSong(
              getAt(wrapper, "data"),
              getAt(wrapper, "_uri"),
              LIKED_SLEEVE
            );
            if (song) allSongs.push(song);
          }
          if ((total > 0 && allSongs.length >= total) || items.length < 100) break;
        }

        if (allSongs.length > 0) {
          return {
            name: "Liked Songs",
            owner: this.status.name || "Spotify",
            total: total || allSongs.length,
            thumb: LIKED_SLEEVE,
            songs: allSongs,
          };
        }
      } catch (err) {
        console.warn("[spotify-mobile] Pathfinder fetchLibraryTracks fallback to v1:", err);
      }

      if (this.token) {
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
                thumb: track?.album?.images?.[0]?.url || LIKED_SLEEVE,
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
          } else if (res.status === 401) {
            await this.handleExpiredSession();
          }
        } catch (err) {
          console.warn("[spotify-mobile] fetch liked tracks v1 error:", err);
        }
      }
    }

    // 2. Standalone user playlist via Pathfinder fetchPlaylist
    if (this.token && id !== LIKED_ID) {
      try {
        const parsed = await this.readPlaylistViaPathfinder(id);
        if (parsed.songs.length > 0) return parsed;
      } catch (err) {
        console.warn("[spotify-mobile] Pathfinder fetchPlaylist fallback:", err);
      }

      if (this.token) {
        try {
          const res = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
            headers: { Authorization: `Bearer ${this.token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const playlistThumb = data?.images?.[0]?.url || "";
            const songs: ImportSong[] = (data?.tracks?.items || [])
              .map((item: any) => {
                const track = item.track || item;
                if (!track?.name) return null;
                return {
                  spotifyId: track?.id,
                  title: track?.name || "Unknown Track",
                  artist: (track?.artists || []).map((a: any) => a.name).join(", "),
                  album: track?.album?.name,
                  duration: Math.round((track?.duration_ms || 0) / 1000),
                  thumb: track?.album?.images?.[0]?.url || playlistThumb,
                  explicit: track?.explicit,
                };
              })
              .filter(Boolean);
            if (songs.length > 0) {
              return {
                name: data?.name || "Spotify Playlist",
                owner: data?.owner?.display_name,
                total: data?.tracks?.total || songs.length,
                thumb: playlistThumb,
                songs,
              };
            }
          } else if (res.status === 401) {
            await this.handleExpiredSession();
          }
        } catch {}
      }
    }

    // 3. Try fetching via PC server if connected
    if (isServerConnected()) {
      try {
        const pcUrl = getServerUrl();
        const res = await fetch(`${pcUrl}/api/spotify/playlist?id=${encodeURIComponent(id)}`);
        if (res.ok) {
          return await res.json();
        }
      } catch {}
    }

    if (id === LIKED_ID) {
      throw new Error(
        this.token
          ? "Could not load Liked Songs from Spotify. Try signing in again."
          : "Please sign in to Spotify to load Liked Songs."
      );
    }

    // 4. Fallback: Read public embed page
    return this.fetchPublicPlaylist(`https://open.spotify.com/playlist/${id}`);
  }

  private async readPlaylistViaPathfinder(
    id: string,
    token?: string
  ): Promise<ImportedPlaylist> {
    const allSongs: ImportSong[] = [];
    let name = "Spotify Playlist";
    let owner = "Spotify";
    let thumb = "";
    let total = 0;

    for (let offset = 0; offset < 1000; offset += 100) {
      const json = await this.queryPathfinder(
        "fetchPlaylist",
        {
          uri: `spotify:playlist:${id}`,
          offset,
          limit: 100,
          enableWatchFeedEntrypoint: false,
        },
        token
      );

      const p = asObj(getAt(json, "data", "playlistV2"));
      const content = asObj(p?.content);
      if (!p || !content) break;

      if (offset === 0) {
        name = asStr(p.name) ?? name;
        owner = asStr(getAt(p, "ownerV2", "data", "name")) ?? owner;
        thumb = pickImage(getAt(asArr(getAt(p, "images", "items"))[0], "sources"), 300) ?? "";
        total = asNum(content.totalCount) ?? 0;
      }

      const items = asArr(content.items);
      if (items.length === 0) break;

      for (const item of items) {
        const data = getAt(item, "itemV2", "data");
        if (getAt(data, "__typename") === "Track" || getAt(data, "name")) {
          const song = parsePathfinderSong(data, getAt(data, "uri"), thumb);
          if (song) allSongs.push(song);
        }
      }

      if ((total > 0 && allSongs.length >= total) || items.length < 100) break;
    }

    return {
      name,
      owner,
      total: total || allSongs.length,
      thumb,
      songs: allSongs,
    };
  }

  /**
   * Parse any Spotify link (playlist, album, track, or spotify.link share URL) without login
   */
  public async fetchPublicPlaylist(rawInput: string): Promise<ImportedPlaylist> {
    const text = rawInput.trim();

    // 1. Extract URL if user pasted share text like "Listen on Spotify: https://..."
    const urlInText = text.match(/https?:\/\/[^\s"'<>]+/i)?.[0] || text;

    // 2. Follow short links (spotify.link / spotify.app.link)
    let resolvedTarget = urlInText;
    if (/^https?:\/\/(?:spotify\.link|spotify\.app\.link)\//i.test(resolvedTarget)) {
      try {
        const r = await fetch(resolvedTarget, {
          headers: { "User-Agent": DESKTOP_UA },
        });
        if (r.url && /spotify\.com/i.test(r.url)) {
          resolvedTarget = r.url;
        } else {
          const body = await r.text();
          const m = body.match(/https:\/\/open\.spotify\.com\/[^"'\s<>]+/i);
          if (m?.[0]) resolvedTarget = m[0];
        }
      } catch {}
    }

    // 3. Extract resource kind (playlist, album, track) and 22-char ID
    let kind: "playlist" | "album" | "track" = "playlist";
    let id = "";

    const uriMatch = /spotify:(?:user:[^:\s]+:)?(playlist|album|track):([A-Za-z0-9]{22})/i.exec(
      resolvedTarget
    );
    if (uriMatch) {
      kind = uriMatch[1].toLowerCase() as "playlist" | "album" | "track";
      id = uriMatch[2];
    } else {
      const pathMatch = /(playlist|album|track)[\/:]([A-Za-z0-9]{22})/i.exec(resolvedTarget);
      if (pathMatch) {
        kind = pathMatch[1].toLowerCase() as "playlist" | "album" | "track";
        id = pathMatch[2];
      } else if (/^[A-Za-z0-9]{22}$/.test(resolvedTarget)) {
        id = resolvedTarget;
      }
    }

    if (!id) {
      throw new Error(
        "That doesn't look like a valid Spotify playlist or album link. Copy a link from Spotify and try again."
      );
    }

    // 4. Fetch Spotify's public embed page
    const embedUrl = `${WEB_BASE}/embed/${kind}/${id}`;
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent": DESKTOP_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (res.status === 404) {
      throw new Error("That Spotify playlist is private or no longer exists.");
    }
    if (!res.ok) {
      throw new Error(`Spotify didn't respond (HTTP ${res.status}). Try again in a moment.`);
    }

    const html = await res.text();
    const dataMatch =
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    if (!dataMatch?.[1]) {
      throw new Error("Could not read playlist data from Spotify.");
    }

    const root = JSON.parse(dataMatch[1]);
    const state = getAt(root, "props", "pageProps", "state");
    const entity = asObj(getAt(state, "data", "entity"));
    if (!entity) {
      throw new Error("That Spotify playlist is private or unavailable.");
    }

    const coverThumb =
      pickImage(getAt(entity, "coverArt", "sources"), 300) ||
      pickImage(getAt(entity, "visualIdentity", "image"), 300) ||
      "";
    const entityTitle = asStr(entity.name) ?? asStr(entity.title) ?? "Spotify Playlist";
    const entityOwner = asStr(entity.subtitle) ?? "Spotify";
    const embedToken = asStr(getAt(state, "settings", "session", "accessToken")) ?? null;

    // 5. If this is a playlist and the embed page gave us an anonymous WebPlayer token,
    // use Pathfinder fetchPlaylist so we get full track thumbnails, album names, and >100 songs!
    if (kind === "playlist" && (embedToken || this.token)) {
      try {
        const full = await this.readPlaylistViaPathfinder(id, (embedToken || this.token)!);
        if (full.songs.length > 0) {
          return {
            name: full.name || entityTitle,
            owner: full.owner || entityOwner,
            total: full.total || full.songs.length,
            thumb: full.thumb || coverThumb,
            songs: full.songs.map((s) => ({
              ...s,
              thumb: s.thumb || full.thumb || coverThumb,
            })),
          };
        }
      } catch (err) {
        console.warn("[spotify-mobile] Pathfinder full read failed, using embed trackList:", err);
      }
    }

    // 6. Parse embed trackList (or single track if kind === 'track')
    const rawList = asArr(entity.trackList);
    const songs: ImportSong[] =
      rawList.length > 0
        ? rawList
            .map((t: any): ImportSong | null => {
              const title = asStr(t.title);
              if (!title) return null;
              const spId =
                extractTrackId(t.uri) ||
                asStr(t.uid) ||
                `${title}-${asStr(t.subtitle) || ""}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 22);
              return {
                spotifyId: spId,
                title,
                artist: asStr(t.subtitle) || entityOwner || "Spotify Artist",
                duration: toSeconds(t.duration),
                thumb: coverThumb,
                explicit: t.isExplicit === true,
              };
            })
            .filter((s): s is ImportSong => s !== null)
        : [
            {
              spotifyId: id,
              title: entityTitle,
              artist: entityOwner,
              duration: toSeconds(entity.duration),
              thumb: coverThumb,
              explicit: entity.isExplicit === true,
            },
          ];

    if (songs.length === 0) {
      throw new Error("No playable tracks found in this Spotify link.");
    }

    return {
      name: entityTitle,
      owner: entityOwner,
      total: songs.length,
      thumb: coverThumb,
      songs,
    };
  }

  /**
   * Convert an ImportSong into a playable Track in FTune mobile.
   * Uses cached YouTube match if available; otherwise creates a lazy-matched `sp_<id>` Track.
   */
  public toPlayableTrack(song: ImportSong, fallbackThumb?: string): Track {
    const cleanSpId = (
      song.spotifyId ||
      `${song.title}_${song.artist}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)
    ).replace(/[^a-zA-Z0-9_-]/g, "_");
    const spKey = `sp_${cleanSpId}`;
    const cacheKey = song.spotifyId || `${song.title}:::${song.artist}`;

    const normalizedSong: ImportSong = {
      ...song,
      spotifyId: cleanSpId,
      thumb: song.thumb || fallbackThumb || LIKED_SLEEVE,
    };
    this.songCatalog[spKey] = normalizedSong;

    const cached = this.matchCache[cacheKey] || this.matchCache[spKey];
    if (cached && !cached.id.startsWith("sp_")) {
      return {
        ...cached,
        thumb: normalizedSong.thumb || cached.thumb,
        spotifyId: cleanSpId,
      };
    }

    return {
      id: spKey,
      spotifyId: cleanSpId,
      title: normalizedSong.title,
      artist: normalizedSong.artist,
      album: normalizedSong.album,
      duration: normalizedSong.duration || 0,
      thumb: normalizedSong.thumb || "",
      explicit: normalizedSong.explicit,
    };
  }

  /**
   * Borrow multiple selected Spotify playlists (and/or Liked Songs) into the local Mobile Library
   */
  public async borrowPlaylists(
    playlistIds: string[],
    onProgress?: (info: { current: number; total: number; name: string }) => void
  ): Promise<{ borrowed: PCPlaylist[]; likedTracks: Track[] }> {
    const newlyBorrowed: PCPlaylist[] = [];
    let borrowedLikedTracks: Track[] = [];

    for (let i = 0; i < playlistIds.length; i++) {
      const id = playlistIds[i];
      const meta = this.playlists.find((p) => p.id === id);
      const label = id === LIKED_ID ? "Liked Songs" : meta?.name || "Playlist";
      onProgress?.({ current: i + 1, total: playlistIds.length, name: label });

      const imported = await this.fetchPlaylistTracks(id);
      const cover =
        id === LIKED_ID
          ? LIKED_SLEEVE
          : imported.thumb || meta?.thumb || LIKED_SLEEVE;
      const tracks = imported.songs.map((s) => this.toPlayableTrack(s, cover));

      const playlistObj: PCPlaylist = {
        id: `spotify_${id}`,
        name: id === LIKED_ID ? "Spotify Liked Songs" : imported.name || label,
        owner: imported.owner || meta?.owner || "Spotify",
        thumb: cover,
        source: "spotify",
        tracks,
        createdAt: Date.now(),
      };

      // Upsert into borrowedPlaylists
      const existingIdx = this.borrowedPlaylists.findIndex((p) => p.id === playlistObj.id);
      if (existingIdx >= 0) {
        this.borrowedPlaylists[existingIdx] = playlistObj;
      } else {
        this.borrowedPlaylists.unshift(playlistObj);
      }

      newlyBorrowed.push(playlistObj);

      if (id === LIKED_ID && tracks.length > 0) {
        borrowedLikedTracks = await mergeOfflineFavorites(tracks);
      }
    }

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.BORROWED, JSON.stringify(this.borrowedPlaylists)),
      AsyncStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(this.songCatalog)),
    ]);

    this.notify();
    this.onLibraryMutated?.();
    return { borrowed: newlyBorrowed, likedTracks: borrowedLikedTracks };
  }

  /**
   * Import a public Spotify link and immediately borrow/save it into the Mobile Library
   */
  public async importAndBorrowLink(link: string): Promise<PCPlaylist> {
    const imported = await this.fetchPublicPlaylist(link);
    const cover = imported.thumb || LIKED_SLEEVE;
    const tracks = imported.songs.map((s) => this.toPlayableTrack(s, cover));

    const slug = (imported.name || "playlist")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 24);
    const playlistId = `spotify_link_${slug}_${ tracks[0]?.spotifyId || Date.now() }`;

    const playlistObj: PCPlaylist = {
      id: playlistId,
      name: imported.name || "Imported Spotify Playlist",
      owner: imported.owner || "Spotify",
      thumb: cover,
      source: "spotify",
      tracks,
      createdAt: Date.now(),
    };

    const existingIdx = this.borrowedPlaylists.findIndex(
      (p) => p.id === playlistId || p.name === playlistObj.name
    );
    if (existingIdx >= 0) {
      this.borrowedPlaylists[existingIdx] = playlistObj;
    } else {
      this.borrowedPlaylists.unshift(playlistObj);
    }

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.BORROWED, JSON.stringify(this.borrowedPlaylists)),
      AsyncStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(this.songCatalog)),
    ]);

    this.notify();
    this.onLibraryMutated?.();
    return playlistObj;
  }

  /**
   * Remove a borrowed playlist from the Mobile Library
   */
  public async removeBorrowedPlaylist(playlistId: string): Promise<PCPlaylist[]> {
    this.borrowedPlaylists = this.borrowedPlaylists.filter((p) => p.id !== playlistId);
    await AsyncStorage.setItem(STORAGE_KEYS.BORROWED, JSON.stringify(this.borrowedPlaylists));
    this.notify();
    this.onLibraryMutated?.();
    return this.borrowedPlaylists;
  }

  /**
   * Snapshot of borrowed playlists, song catalog, and match cache for Google Drive cloud sync
   */
  public getSyncSnapshot(): {
    playlists: PCPlaylist[];
    songCatalog: Record<string, ImportSong>;
    matchCache: Record<string, Track>;
  } {
    return {
      playlists: this.borrowedPlaylists,
      songCatalog: this.songCatalog,
      matchCache: this.matchCache,
    };
  }

  /**
   * Apply or merge a Google Drive cloud snapshot into the local Mobile Library
   */
  public async applySyncSnapshot(
    snapshot: {
      playlists?: PCPlaylist[];
      songCatalog?: Record<string, ImportSong>;
      matchCache?: Record<string, Track>;
    },
    replaceAll = false
  ): Promise<PCPlaylist[]> {
    if (replaceAll) {
      this.borrowedPlaylists = Array.isArray(snapshot.playlists) ? snapshot.playlists : [];
      this.songCatalog = snapshot.songCatalog || {};
      this.matchCache = snapshot.matchCache || {};
    } else {
      // Merge playlists by id or name (remote playlists + local playlists)
      const remoteLists = Array.isArray(snapshot.playlists) ? snapshot.playlists : [];
      const mergedMap = new Map<string, PCPlaylist>();
      for (const p of this.borrowedPlaylists) {
        mergedMap.set(p.id, p);
      }
      for (const rp of remoteLists) {
        if (!rp?.id) continue;
        const existing = mergedMap.get(rp.id);
        if (!existing || (rp.tracks?.length || 0) >= (existing.tracks?.length || 0)) {
          mergedMap.set(rp.id, rp);
        }
      }
      this.borrowedPlaylists = Array.from(mergedMap.values());

      if (snapshot.songCatalog && typeof snapshot.songCatalog === "object") {
        this.songCatalog = { ...snapshot.songCatalog, ...this.songCatalog };
      }
      if (snapshot.matchCache && typeof snapshot.matchCache === "object") {
        this.matchCache = { ...snapshot.matchCache, ...this.matchCache };
      }
    }

    // Also ensure every track in borrowedPlaylists is registered in songCatalog for lazy matching
    for (const pl of this.borrowedPlaylists) {
      for (const tr of pl.tracks || []) {
        if (tr.id?.startsWith("sp_") && !this.songCatalog[tr.id]) {
          this.songCatalog[tr.id] = {
            spotifyId: tr.spotifyId || tr.id.replace(/^sp_/, ""),
            title: tr.title,
            artist: tr.artist,
            album: tr.album,
            duration: tr.duration,
            thumb: tr.thumb,
            explicit: tr.explicit,
          };
        }
      }
    }

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.BORROWED, JSON.stringify(this.borrowedPlaylists)),
      AsyncStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(this.songCatalog)),
      AsyncStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(this.matchCache)),
    ]);

    this.notify();
    return this.borrowedPlaylists;
  }

  /**
   * Ensure a Track (which may have an `sp_...` placeholder ID) is matched to a real YouTube Music Track
   */
  public async resolvePlayableTrack(track: Track): Promise<Track> {
    if (!track.id.startsWith("sp_") && !track.id.startsWith("sp:")) {
      return track;
    }

    const matched = await this.matchSongToYouTube({
      spotifyId: track.spotifyId || track.id.replace(/^sp[_:]/, ""),
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      thumb: track.thumb,
      explicit: track.explicit,
    });

    if (matched) {
      return {
        ...matched,
        thumb: track.thumb || matched.thumb,
        spotifyId: track.spotifyId,
      };
    }
    return track;
  }

  /**
   * Resolve a YouTube videoId from either a videoId string, an `sp_...` ID, or a Track object
   */
  public async resolveYoutubeVideoId(idOrTrack: string | Track): Promise<string | null> {
    if (typeof idOrTrack === "object" && idOrTrack !== null) {
      if (!idOrTrack.id.startsWith("sp_") && !idOrTrack.id.startsWith("sp:")) {
        return idOrTrack.id;
      }
      const resolved = await this.resolvePlayableTrack(idOrTrack);
      return resolved.id.startsWith("sp_") ? null : resolved.id;
    }

    const rawId = idOrTrack;
    if (!rawId.startsWith("sp_") && !rawId.startsWith("sp:")) {
      return rawId;
    }

    const cleanKey = rawId.replace(/^sp:/, "sp_");
    const cached = this.matchCache[cleanKey] || this.matchCache[rawId.replace(/^sp[_:]/, "")];
    if (cached && !cached.id.startsWith("sp_")) {
      return cached.id;
    }

    const catalogSong = this.songCatalog[cleanKey];
    if (catalogSong) {
      const matched = await this.matchSongToYouTube(catalogSong);
      if (matched) return matched.id;
    }

    return null;
  }

  /**
   * Match a Spotify song to a playable YouTube Music track
   */
  public async matchSongToYouTube(song: ImportSong): Promise<Track | null> {
    const cacheKey = song.spotifyId || `${song.title}:::${song.artist}`;
    const spKey = song.spotifyId ? `sp_${song.spotifyId}` : cacheKey;

    if (this.matchCache[cacheKey]) {
      return this.matchCache[cacheKey];
    }
    if (this.matchCache[spKey]) {
      return this.matchCache[spKey];
    }

    try {
      const searchRes = await directYouTubeMusicSearch(`${song.title} ${song.artist}`, "songs");
      const candidates = searchRes.songs || [];
      if (candidates.length === 0) return null;

      const targetDuration = song.duration || 0;
      let best = candidates[0];
      let bestScore = -1;

      for (const candidate of candidates.slice(0, 5)) {
        let score = 0;
        const normCandTitle = candidate.title.toLowerCase();
        const normSongTitle = song.title.toLowerCase();

        if (normCandTitle === normSongTitle) score += 50;
        else if (
          normCandTitle.includes(normSongTitle) ||
          normSongTitle.includes(normCandTitle)
        ) {
          score += 30;
        }

        const normCandArtist = candidate.artist.toLowerCase();
        const normSongArtist = song.artist.toLowerCase();
        if (
          normCandArtist.includes(normSongArtist) ||
          normSongArtist.includes(normCandArtist)
        ) {
          score += 25;
        }

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

      const matchedTrack: Track = {
        ...best,
        thumb: song.thumb || best.thumb,
        album: song.album || best.album,
        spotifyId: song.spotifyId,
      };

      this.matchCache[cacheKey] = matchedTrack;
      this.matchCache[spKey] = matchedTrack;
      AsyncStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(this.matchCache)).catch(() => {});
      return matchedTrack;
    } catch (err) {
      console.warn("[spotify-mobile] match error for", song.title, err);
      return null;
    }
  }
}

export const spotifyService = new SpotifyMobileService();
