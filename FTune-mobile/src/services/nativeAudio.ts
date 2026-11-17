import {
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import { Platform } from "react-native";
import type { Track } from "../types";

const LOCK_SCREEN_OPTIONS = {
  showNextTrack: true,
  showPreviousTrack: true,
  showSeekForward: false,
  showSeekBackward: false,
};

class NativeAudioService {
  private player: AudioPlayer | null = null;
  private currentUri: string | null = null;
  private isModeSet = false;
  private notifPermRequested = false;
  private statusSub: { remove: () => void } | null = null;
  private nextSub: { remove: () => void } | null = null;
  private prevSub: { remove: () => void } | null = null;
  private sessionSeq = 0;
  private desiredPlaying = false;
  private suppressAutoStart = false;
  private hasStartedPlaying = false;
  private isLoaded = false;
  private isLockScreenActive = false;
  private pendingSeekSec = 0;
  private targetVolume = 0.8;

  public onStateChange: ((isPlaying: boolean) => void) | null = null;
  public onTimeUpdate: ((positionSec: number, durationSec: number) => void) | null = null;
  public onTrackEnded: (() => void) | null = null;
  public onNextTrack: (() => void) | null = null;
  public onPrevTrack: (() => void) | null = null;
  public onError: ((msg: string) => void) | null = null;

  private async initMode() {
    if (Platform.OS === "android" && !this.notifPermRequested) {
      this.notifPermRequested = true;
      try {
        await requestNotificationPermissionsAsync();
      } catch (e) {
        console.warn("[nativeAudio] notification permission error:", e);
      }
    }
    if (this.isModeSet) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "doNotMixPersistent",
        shouldPlayInBackground: true,
        allowsRecording: false,
      });
      this.isModeSet = true;
    } catch (e) {
      console.warn("[nativeAudio] setAudioModeAsync error:", e);
    }
  }

  public hasLoadedPlayer(): boolean {
    return !!this.player;
  }

  private buildMetadata(trackMeta?: Track) {
    if (!trackMeta) return undefined;
    return {
      title: trackMeta.title || "Unknown Track",
      artist: trackMeta.artist || "Unknown Artist",
      albumTitle: trackMeta.album || "FTune",
      artworkUrl: trackMeta.thumb || undefined,
      durationSeconds:
        typeof trackMeta.duration === "number" &&
        Number.isFinite(trackMeta.duration) &&
        trackMeta.duration > 0
          ? trackMeta.duration
          : undefined,
    };
  }

  public prepareForTrack(trackMeta?: Track): void {
    this.sessionSeq++;
    this.desiredPlaying = false;
    this.suppressAutoStart = false;
    this.hasStartedPlaying = false;
    this.isLoaded = false;
    this.pendingSeekSec = 0;

    if (!this.player) return;

    try {
      this.player.pause();
    } catch {}

    const metadata = this.buildMetadata(trackMeta);
    if (metadata) {
      try {
        if (this.isLockScreenActive) {
          this.player.updateLockScreenMetadata?.(metadata);
        } else {
          this.player.setActiveForLockScreen?.(true, metadata, LOCK_SCREEN_OPTIONS);
          this.isLockScreenActive = true;
        }
      } catch {}
    }
  }

  public async play(
    uri: string,
    startPositionSeconds = 0,
    volume?: number,
    trackMeta?: Track
  ): Promise<boolean> {
    await this.initMode();
    const seq = ++this.sessionSeq;

    try {
      this.detachListeners();

      this.currentUri = uri;
      this.desiredPlaying = true;
      this.suppressAutoStart = false;
      this.hasStartedPlaying = false;
      this.isLoaded = false;
      this.pendingSeekSec =
        typeof startPositionSeconds === "number" &&
        Number.isFinite(startPositionSeconds) &&
        startPositionSeconds > 0
          ? startPositionSeconds
          : 0;
      if (typeof volume === "number" && Number.isFinite(volume)) {
        this.targetVolume = Math.max(0, Math.min(1, volume));
      }

      let player = this.player;
      const reusing = !!player;
      if (player) {
        try {
          player.pause();
        } catch {}
        player.replace(uri);
      } else {
        player = createAudioPlayer(uri, {
          updateInterval: 350,
          keepAudioSessionActive: true,
        });
        this.player = player;
        this.isLockScreenActive = false;
      }

      player.volume = this.targetVolume;

      const metadata = this.buildMetadata(trackMeta);
      try {
        if (!this.isLockScreenActive || !reusing) {
          player.setActiveForLockScreen?.(true, metadata, LOCK_SCREEN_OPTIONS);
          this.isLockScreenActive = true;
        } else if (metadata) {
          player.updateLockScreenMetadata?.(metadata);
        }
      } catch {}

      this.statusSub = player.addListener(
        "playbackStatusUpdate",
        (status: AudioStatus) => {
          if (seq !== this.sessionSeq || this.player !== player) return;

          if (status.error) {
            this.desiredPlaying = false;
            this.suppressAutoStart = false;
            this.onStateChange?.(false);
            this.onError?.(status.error);
            return;
          }

          if (status.isLoaded) {
            if (!this.isLoaded) {
              this.isLoaded = true;
              if (this.pendingSeekSec > 0) {
                const seekTo = this.pendingSeekSec;
                this.pendingSeekSec = 0;
                void player.seekTo(seekTo).catch(() => {});
              }
            }
            if (status.playing && !this.suppressAutoStart) {
              this.hasStartedPlaying = true;
            }
          }

          if (this.pendingSeekSec === 0 || status.isLoaded) {
            this.onTimeUpdate?.(status.currentTime || 0, status.duration || 0);
          }

          if (status.didJustFinish && !status.loop) {
            this.desiredPlaying = false;
            this.suppressAutoStart = false;
            this.hasStartedPlaying = false;
            this.onTrackEnded?.();
            return;
          }

          if (status.playing) {
            if (this.suppressAutoStart) {
              // User explicitly paused before startup completed
              try {
                player.pause();
              } catch {}
              this.desiredPlaying = false;
              this.onStateChange?.(false);
              return;
            }
            this.desiredPlaying = true;
            this.hasStartedPlaying = true;
            this.onStateChange?.(true);
          } else {
            // While preparing/buffering a freshly requested play, do NOT overwrite UI with paused
            if (
              this.desiredPlaying &&
              !this.suppressAutoStart &&
              (!status.isLoaded || status.isBuffering || !this.hasStartedPlaying)
            ) {
              return;
            }
            this.desiredPlaying = false;
            this.suppressAutoStart = false;
            this.onStateChange?.(false);
          }
        }
      );

      this.nextSub = player.addListener("lockScreenNext", () => {
        if (this.player !== player) return;
        this.onNextTrack?.();
      });

      this.prevSub = player.addListener("lockScreenPrevious", () => {
        if (this.player !== player) return;
        this.onPrevTrack?.();
      });

      if (this.pendingSeekSec > 0) {
        try {
          await player.seekTo(this.pendingSeekSec);
        } catch {}
      }
      if (seq !== this.sessionSeq || this.player !== player) {
        return false;
      }
      if (!this.desiredPlaying || this.suppressAutoStart) {
        return true;
      }
      player.play();
      return true;
    } catch (err: any) {
      console.warn("[nativeAudio] Play error:", err?.message);
      this.desiredPlaying = false;
      this.suppressAutoStart = false;
      this.onStateChange?.(false);
      return false;
    }
  }

  public pause(): void {
    this.desiredPlaying = false;
    this.suppressAutoStart = !this.hasStartedPlaying;
    try {
      this.player?.pause();
    } catch (e) {
      console.warn("[nativeAudio] Pause error:", e);
    }
  }

  public resume(): boolean {
    if (!this.player) return false;
    this.desiredPlaying = true;
    this.suppressAutoStart = false;
    try {
      this.player.play();
      return true;
    } catch (e) {
      console.warn("[nativeAudio] Resume error:", e);
      this.desiredPlaying = false;
      return false;
    }
  }

  public async seek(seconds: number): Promise<void> {
    const target = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    if (!this.isLoaded) {
      this.pendingSeekSec = target;
    }
    try {
      if (this.player) {
        await this.player.seekTo(target);
      }
    } catch (e) {
      console.warn("[nativeAudio] Seek error:", e);
    }
  }

  public setVolume(volume: number): void {
    this.targetVolume = Math.max(0, Math.min(1, volume));
    try {
      if (this.player) {
        this.player.volume = this.targetVolume;
      }
    } catch (e) {
      console.warn("[nativeAudio] Set volume error:", e);
    }
  }

  private detachListeners(): void {
    try {
      this.statusSub?.remove();
    } catch {}
    this.statusSub = null;
    try {
      this.nextSub?.remove();
    } catch {}
    this.nextSub = null;
    try {
      this.prevSub?.remove();
    } catch {}
    this.prevSub = null;
  }

  private teardownPlayer(): void {
    try {
      this.detachListeners();
      this.isLockScreenActive = false;
      if (this.player) {
        const p = this.player;
        this.player = null;
        try {
          p.clearLockScreenControls?.();
        } catch {}
        try {
          p.pause();
        } catch {}
        try {
          p.remove();
        } catch {}
        try {
          (p as any).release?.();
        } catch {}
      }
    } catch {}
  }

  public stop(): void {
    this.sessionSeq++;
    this.desiredPlaying = false;
    this.suppressAutoStart = false;
    this.hasStartedPlaying = false;
    this.isLoaded = false;
    this.pendingSeekSec = 0;
    this.currentUri = null;
    this.teardownPlayer();
  }
}

export const nativeAudio = new NativeAudioService();
