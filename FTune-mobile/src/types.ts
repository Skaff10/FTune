export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  duration: number; // in seconds
  thumb: string;
  explicit?: boolean;
  localUri?: string; // set when downloaded locally
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  year?: string;
  thumb: string;
}

export interface Artist {
  id: string;
  name: string;
  thumb: string;
  subtitle?: string;
}

export interface PlaylistCard {
  id: string;
  title: string;
  thumb: string;
  count?: number;
  subtitle?: string;
}

export interface PCPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt?: number;
  pinned?: boolean;
}

export interface RemoteLibraryState {
  playlists: PCPlaylist[];
  liked: Track[];
}

export type SearchFilter = "all" | "songs" | "videos" | "albums" | "artists" | "playlists";

export interface SearchResults {
  songs: Track[];
  videos?: Track[];
  albums?: Album[];
  artists?: Artist[];
  playlists?: PlaylistCard[];
}

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

export type RemoteAction =
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

export interface ServerInfo {
  status: string;
  app: string;
  version: string;
  hostname: string;
  ip: string;
  port: number;
}

export interface DownloadItem {
  track: Track;
  localUri: string;
  fileSize: number;
  downloadedAt: number;
}
