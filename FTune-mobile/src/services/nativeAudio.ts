import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import type { Track } from "../types";

class NativeAudioService {
  private player: AudioPlayer | null = null;
  private currentUri: string | null = null;
  private isModeSet = false;
  private subscription: { remove: () => void } | null = null;
  private sessionSeq = 0;
  private desiredPlaying = false;
  private hasStartedPlaying = false;
  private isLoaded = false;
  private pendingSeekSec = 0;
  private targetVolume = 0.8;

  public onStateChange: ((isPlaying: boolean) => void) | null = null;
  public onTimeUpdate: ((positionSec: number, durationSec: number) => void) | null = null;
  public onTrackEnded: (() => void) | null = null;
  public onError: ((msg: string) => void) | null = null;

  private async initMode() {
    if (this.isModeSet) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
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

  public async play(
    uri: string,
    startPositionSeconds = 0,
    volume?: number,
    trackMeta?: Track
  ): Promise<boolean> {
    await this.initMode();
    const seq = ++this.sessionSeq;

    try {
      this.teardownPlayer();

      this.currentUri = uri;
      this.desiredPlaying = true;
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

      const player = createAudioPlayer(uri, {
        updateInterval: 350,
        keepAudioSessionActive: true,
      });
      this.player = player;
      player.volume = this.targetVolume;

      if (trackMeta) {
        try {
          player.setActiveForLockScreen?.(true, {
            title: trackMeta.title,
            artist: trackMeta.artist,
            albumTitle: trackMeta.album || "FTune",
            artworkUrl: trackMeta.thumb || undefined,
          });
        } catch {}
      }

      this.subscription = player.addListener(
        "playbackStatusUpdate",
        (status: AudioStatus) => {
          if (seq !== this.sessionSeq || this.player !== player) return;

          if (status.error) {
            this.desiredPlaying = false;
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
            if (status.playing) {
              this.hasStartedPlaying = true;
            }
          }

          if (this.pendingSeekSec === 0 || status.isLoaded) {
            this.onTimeUpdate?.(status.currentTime || 0, status.duration || 0);
          }

          if (status.didJustFinish && !status.loop) {
            this.desiredPlaying = false;
            this.hasStartedPlaying = false;
            this.onTrackEnded?.();
            return;
          }

          if (status.playing) {
            if (!this.desiredPlaying) {
              // User paused or switched to PC while stream finished preparing
              try {
                player.pause();
              } catch {}
              return;
            }
            this.onStateChange?.(true);
          } else {
            // While preparing/buffering a freshly requested play, do NOT overwrite UI with paused
            if (
              this.desiredPlaying &&
              (!status.isLoaded || status.isBuffering || !this.hasStartedPlaying)
            ) {
              return;
            }
            this.desiredPlaying = false;
            this.onStateChange?.(false);
          }
        }
      );

      if (this.pendingSeekSec > 0) {
        try {
          await player.seekTo(this.pendingSeekSec);
        } catch {}
      }
      if (seq !== this.sessionSeq || this.player !== player) {
        return false;
      }
      player.play();
      return true;
    } catch (err: any) {
      console.warn("[nativeAudio] Play error:", err?.message);
      this.desiredPlaying = false;
      this.onStateChange?.(false);
      return false;
    }
  }

  public pause(): void {
    this.desiredPlaying = false;
    try {
      this.player?.pause();
    } catch (e) {
      console.warn("[nativeAudio] Pause error:", e);
    }
  }

  public resume(): boolean {
    if (!this.player) return false;
    this.desiredPlaying = true;
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

  private teardownPlayer(): void {
    try {
      if (this.subscription) {
        this.subscription.remove();
        this.subscription = null;
      }
      if (this.player) {
        try {
          this.player.clearLockScreenControls?.();
        } catch {}
        try {
          this.player.pause();
        } catch {}
        try {
          this.player.remove();
        } catch {}
        this.player = null;
      }
    } catch {}
  }

  public stop(): void {
    this.sessionSeq++;
    this.desiredPlaying = false;
    this.hasStartedPlaying = false;
    this.isLoaded = false;
    this.pendingSeekSec = 0;
    this.currentUri = null;
    this.teardownPlayer();
  }
}

export const nativeAudio = new NativeAudioService();
