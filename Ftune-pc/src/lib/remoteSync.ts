import { usePlayer } from "../stores/player";
import { useLibrary } from "../stores/library";

export function initRemoteSync(): void {
  if (typeof window === "undefined" || !window.bytune) return;

  // Handle remote playback commands sent from the mobile app
  window.bytune.onRemoteCommand((cmd: any) => {
    const p = usePlayer.getState();
    switch (cmd.type) {
      case "play-track": {
        const track = cmd.track;
        if (cmd.queue && Array.isArray(cmd.queue) && cmd.queue.length > 0) {
          const idx = cmd.queue.findIndex((t: any) => t.id === track.id);
          p.playQueue(cmd.queue, idx >= 0 ? idx : 0, "mobile");
        } else {
          p.playQueue([track], 0, "mobile");
        }
        break;
      }
      case "play-queue":
        if (cmd.tracks && Array.isArray(cmd.tracks)) {
          p.playQueue(cmd.tracks, cmd.startIndex ?? 0, "mobile");
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
  const pushState = () => {
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

  usePlayer.subscribe((state, prevState) => {
    const now = Date.now();
    const trackChanged = state.current()?.id !== prevState.current()?.id;
    const playChanged = state.playing !== prevState.playing;
    const queueChanged = state.queue !== prevState.queue;

    if (trackChanged || playChanged || queueChanged || now - lastPush > 500) {
      lastPush = now;
      pushState();
    }
  });

  // Push library changes (playlists and liked tracks)
  const pushLibrary = () => {
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
  setTimeout(pushState, 1000);
  setTimeout(pushLibrary, 1200);
}

