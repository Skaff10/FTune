import * as http from "http";
import * as os from "os";
import { WebSocketServer, WebSocket } from "ws";
import * as music from "./music-service";
import type { Track } from "../src/types";

export interface RemotePlayerState {
  currentTrack: Track | null;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  queue: Track[];
  index: number;
}

export type RemoteCommand =
  | { type: "play-track"; track: Track; queue?: Track[] }
  | { type: "play-queue"; tracks: Track[]; startIndex?: number }
  | { type: "jump-to"; index: number }
  | { type: "enqueue"; track: Track }
  | { type: "play-next"; track: Track }
  | { type: "toggle" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "seek"; position: number }
  | { type: "set-volume"; volume: number }
  | { type: "toggle-shuffle" }
  | { type: "cycle-repeat" };

export interface RemoteLibraryState {
  playlists: any[];
  liked: Track[];
}

export interface RemoteServerOptions {
  port?: number;
  onCommand: (cmd: RemoteCommand) => void;
}

export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

export class RemoteServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private port: number;
  private onCommand: (cmd: RemoteCommand) => void;
  private currentState: RemotePlayerState = {
    currentTrack: null,
    playing: false,
    position: 0,
    duration: 0,
    volume: 0.8,
    muted: false,
    shuffle: false,
    repeat: "off",
    queue: [],
    index: 0,
  };
  private currentLibrary: RemoteLibraryState = {
    playlists: [],
    liked: [],
  };

  constructor(options: RemoteServerOptions) {
    this.port = options.port ?? 8765;
    this.onCommand = options.onCommand;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.handleHttpRequest.bind(this));

      this.wss = new WebSocketServer({ server: this.server, path: "/ws" });
      this.wss.on("connection", (ws: WebSocket) => {
        console.log("[remote-server] Mobile client connected via WebSocket!");
        // Send initial state & library upon connection
        ws.send(JSON.stringify({ type: "state", state: this.currentState }));
        ws.send(JSON.stringify({ type: "library", library: this.currentLibrary }));

        ws.on("message", (raw: string) => {
          try {
            const data = JSON.parse(raw.toString());
            if (data?.type === "action" && data?.action) {
              console.log("[remote-server] WS action received:", data.action.type);
              this.onCommand(data.action);
            }
          } catch (e) {
            console.error("[remote-server] WebSocket message error:", e);
          }
        });
      });

      this.server.on("error", (err: Error) => {
        console.error("[remote-server] HTTP server error:", err);
        reject(err);
      });

      this.server.listen(this.port, "0.0.0.0", () => {
        console.log(`[remote-server] FTune Remote API listening on http://${getLocalIpAddress()}:${this.port}`);
        resolve();
      });
    });
  }

  public updateState(state: Partial<RemotePlayerState>): void {
    this.currentState = { ...this.currentState, ...state };
    this.broadcast({ type: "state", state: this.currentState });
  }

  public updateLibrary(library: Partial<RemoteLibraryState>): void {
    this.currentLibrary = { ...this.currentLibrary, ...library };
    this.broadcast({ type: "library", library: this.currentLibrary });
  }

  public getLibrary(): RemoteLibraryState {
    return this.currentLibrary;
  }

  public getState(): RemotePlayerState {
    return this.currentState;
  }

  public getPort(): number {
    return this.port;
  }

  private broadcast(payload: unknown): void {
    if (!this.wss) return;
    const msg = JSON.stringify(payload);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
    this.setCorsHeaders(res);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = statusCode;
    res.end(JSON.stringify(data));
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const host = req.headers.host || `localhost:${this.port}`;
    const url = new URL(req.url || "/", `http://${host}`);
    const pathname = url.pathname;

    try {
      // 1. Ping / Discovery
      if (pathname === "/api/ping" && req.method === "GET") {
        this.sendJson(res, 200, {
          status: "ok",
          app: "FTune",
          version: "1.1.1",
          hostname: os.hostname(),
          ip: getLocalIpAddress(),
          port: this.port,
        });
        return;
      }

      // 2. Search
      if (pathname === "/api/search" && req.method === "GET") {
        const q = url.searchParams.get("q") ?? "";
        const filter = (url.searchParams.get("filter") ?? "all") as music.SearchFilter;
        if (!q.trim()) {
          this.sendJson(res, 200, { songs: [], videos: [], albums: [], artists: [], playlists: [] });
          return;
        }
        if (filter === "all") {
          const results = await music.searchAll(q, false);
          this.sendJson(res, 200, results);
        } else {
          const page = await music.searchPage(q, filter);
          const songs: Track[] = (page?.rows || [])
            .filter((r: any) => r.kind === "track" || r.kind === "top")
            .map((r: any) => r.song);
          this.sendJson(res, 200, { songs, rows: page?.rows || [] });
        }
        return;
      }

      // 3. Search Suggestions
      if (pathname === "/api/suggestions" && req.method === "GET") {
        const q = url.searchParams.get("q") ?? "";
        if (!q.trim()) {
          this.sendJson(res, 200, { items: [] });
          return;
        }
        const suggestions = await music.getSuggestions(q);
        this.sendJson(res, 200, suggestions);
        return;
      }

      // 4. Home Feed
      if (pathname === "/api/home" && req.method === "GET") {
        const home = await music.getHome();
        this.sendJson(res, 200, home);
        return;
      }

      // 5. Album Details
      if (pathname === "/api/album" && req.method === "GET") {
        const id = url.searchParams.get("id");
        if (!id) {
          this.sendJson(res, 400, { error: "Missing album id" });
          return;
        }
        const album = await music.getAlbum(id);
        this.sendJson(res, 200, album);
        return;
      }

      // 6. Artist Details
      if (pathname === "/api/artist" && req.method === "GET") {
        const id = url.searchParams.get("id");
        if (!id) {
          this.sendJson(res, 400, { error: "Missing artist id" });
          return;
        }
        const artist = await music.getArtistPage(id);
        this.sendJson(res, 200, artist);
        return;
      }

      // 7. Playlist Details
      if (pathname === "/api/playlist" && req.method === "GET") {
        const id = url.searchParams.get("id");
        if (!id) {
          this.sendJson(res, 400, { error: "Missing playlist id" });
          return;
        }
        const playlist = await music.getPlaylistPage(id);
        this.sendJson(res, 200, playlist);
        return;
      }

      // 8. Lyrics
      if (pathname === "/api/lyrics" && req.method === "GET") {
        const id = url.searchParams.get("id") ?? "";
        const title = url.searchParams.get("title") ?? "";
        const artist = url.searchParams.get("artist") ?? "";
        const album = url.searchParams.get("album") ?? undefined;
        const durationStr = url.searchParams.get("duration");
        const duration = durationStr ? parseInt(durationStr, 10) : undefined;

        const lyrics = await music.getLyrics({ id, title, artist, album, duration });
        this.sendJson(res, 200, lyrics);
        return;
      }

      // 9. Player State
      if (pathname === "/api/player/state" && req.method === "GET") {
        this.sendJson(res, 200, this.currentState);
        return;
      }

      // 10. Player Action
      if (pathname === "/api/player/action" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const cmd = JSON.parse(body) as RemoteCommand;
            console.log("[remote-server] HTTP action received:", cmd.type);
            this.onCommand(cmd);
            this.sendJson(res, 200, { success: true });
          } catch (e: any) {
            this.sendJson(res, 400, { error: "Invalid JSON body", details: e?.message });
          }
        });
        return;
      }

      // 11. PC Library (Playlists & Liked Songs)
      if (pathname === "/api/library" && req.method === "GET") {
        this.sendJson(res, 200, this.currentLibrary);
        return;
      }

      // 12. Audio Stream (Direct Phone Playback & Offline Downloads)
      if (pathname === "/api/stream" && req.method === "GET") {
        const id = url.searchParams.get("id");
        if (!id) {
          this.sendJson(res, 400, { error: "Missing track id" });
          return;
        }
        await this.streamAudioTrack(id, req, res);
        return;
      }

      this.sendJson(res, 404, { error: "Not found" });
    } catch (err: any) {
      console.error("[remote-server] Request handler error:", err);
      this.sendJson(res, 500, { error: "Internal server error", details: err?.message });
    }
  }

  private async streamAudioTrack(trackId: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const stream = await music.resolveStream(trackId, false);
      const range = req.headers.range;
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      };
      if (range) headers.Range = range;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const upstream = await fetch(stream.url, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (!upstream.ok || !upstream.body) {
        this.sendJson(res, upstream.status || 502, { error: "Failed to fetch upstream audio" });
        return;
      }

      const outHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        "Accept-Ranges": "bytes",
        "Content-Type": stream.mime || "audio/mp4",
      };
      for (const h of ["content-length", "content-range", "accept-ranges"]) {
        const v = upstream.headers.get(h);
        if (v) outHeaders[h] = v;
      }

      res.writeHead(upstream.status, outHeaders);

      const reader = upstream.body.getReader();
      req.on("close", () => {
        void reader.cancel().catch(() => undefined);
      });

      for (;;) {
        const { done, value } = await reader.read();
        if (done || res.destroyed) break;
        if (value && value.length > 0 && !res.write(value)) {
          await new Promise<void>((resolve) => {
            const settle = () => {
              res.off("drain", settle);
              res.off("close", settle);
              resolve();
            };
            res.once("drain", settle);
            res.once("close", settle);
          });
          if (res.destroyed) break;
        }
      }
      if (!res.destroyed) {
        res.end();
      }
    } catch (err: any) {
      console.error(`[remote-server] Stream error for ${trackId}:`, err?.message);
      if (!res.headersSent) {
        this.sendJson(res, 502, { error: "Streaming failed", details: err?.message });
      } else {
        res.destroy();
      }
    }
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close();
        this.wss = null;
      }
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

