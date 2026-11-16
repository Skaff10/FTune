import { usePlayer } from "../stores/player";
import { useLibrary } from "../stores/library";

function resolveQueueAndIndex(track: any, queue?: any[], startIndex?: number): { tracks: any[]; index: number } {
  const rawQueue = Array.isArray(queue) && queue.length > 0 ? [...queue] : track ? [track] : [];
  if (rawQueue.length === 0) return { tracks: [], index: 0 };

  let idx =
    typeof startIndex === "number" && startIndex >= 0 && startIndex < rawQueue.length
      ? startIndex
      : rawQueue.findIndex(
          (t: any) =>
            t.id === track?.id ||
            (track?.spotifyId && t.spotifyId === track.spotifyId) ||
            (track?.title && t.title === track.title && t.artist === track.artist)
        );
  if (idx < 0) idx = 0;
  if (track) rawQueue[idx] = track;
  return { tracks: rawQueue, index: idx };
}

export function initRemoteSync(): void {
  if (typeof window === "undefined" || !window.bytune) return;

  const pushState = () => {
    if (typeof window === "undefined" || !window.bytune) return;
    const s = usePlayer.getState();
    const state = {
      currentTrack: s.current(),
      playing: s.playing,
      position: s.position,
      duration: s.duration,
      volume: s.volume,
      muted: s.muted,
      shuffle: s.shuffle,
      repeat: s.repeat,
      queue: s.queue,
      index: s.index,
    };
    window.bytune?.remotePushPlayerState(state);
  };

  // Handle remote playback commands sent from the mobile app
  window.bytune.onRemoteCommand((cmd: any) => {
    const p = usePlayer.getState();
    switch (cmd.type) {
      case "handoff":
      case "play-track": {
        const { tracks, index } = resolveQueueAndIndex(cmd.track, cmd.queue, cmd.startIndex);
        if (tracks.length > 0) {
          p.playQueue(tracks, index, "mobile");
          if (typeof cmd.position === "number" && Number.isFinite(cmd.position) && cmd.position > 0) {
            p.seek(cmd.position);
          }
          if (cmd.playing === false) {
            p.setPlaying(false);
          }
          setTimeout(pushState, 20);
        }
        break;
      }
      case "play-queue":
        if (cmd.tracks && Array.isArray(cmd.tracks) && cmd.tracks.length > 0) {
          p.playQueue(cmd.tracks, cmd.startIndex ?? 0, "mobile");
          if (typeof cmd.position === "number" && Number.isFinite(cmd.position) && cmd.position > 0) {
            p.seek(cmd.position);
          }
          setTimeout(pushState, 20);
        }
        break;
      case "jump-to":
        if (typeof cmd.index === "number") {
          p.jumpTo(cmd.index);
        }
        break;
      case "enqueue":
        p.addToQueue(cmd.track);
        break;
      case "play-next":
        p.addToQueue(cmd.track, true);
        break;
      case "toggle":
        p.toggle();
        break;
      case "play":
        p.setPlaying(true);
        break;
      case "pause":
        p.setPlaying(false);
        break;
      case "next":
        p.next(true);
        break;
      case "prev":
        p.prev();
        break;
      case "seek":
        if (typeof cmd.position === "number") {
          p.seek(cmd.position);
        }
        break;
      case "set-volume":
        if (typeof cmd.volume === "number") {
          p.setVolume(cmd.volume);
        }
        break;
      case "toggle-shuffle":
        p.toggleShuffle();
        break;
      case "cycle-repeat":
        p.cycleRepeat();
        break;
    }
  });

  // Push player state changes to the remote server to broadcast to mobile
  let lastPush = 0;
  usePlayer.subscribe((state, prevState) => {
    const now = Date.now();
    const trackChanged = state.current()?.id !== prevState.current()?.id;
    const indexChanged = state.index !== prevState.index;
    const playChanged = state.playing !== prevState.playing;
    const queueChanged = state.queue !== prevState.queue;
    const controlsChanged =
      state.shuffle !== prevState.shuffle ||
      state.repeat !== prevState.repeat ||
      state.volume !== prevState.volume ||
      state.muted !== prevState.muted ||
      state.seekNonce !== prevState.seekNonce ||
      (state.duration !== prevState.duration && state.duration > 0);

    if (trackChanged || indexChanged || playChanged || queueChanged || controlsChanged || now - lastPush > 500) {
      lastPush = now;
      pushState();
    }
  });

  // Push library changes (playlists and liked tracks)
  const pushLibrary = () => {
    if (typeof window === "undefined" || !window.bytune) return;
    try {
      const lib = useLibrary.getState();
      const payload = {
        playlists: lib.playlists || [],
        liked: lib.liked || [],
      };
      window.bytune?.remotePushLibrary(payload);
    } catch (e) {
      console.warn("[remoteSync] Failed to push library:", e);
    }
  };

  useLibrary.subscribe(() => {
    pushLibrary();
  });

  // Initial pushes after startup
  setTimeout(pushState, 500);
  setTimeout(pushLibrary, 700);
}

