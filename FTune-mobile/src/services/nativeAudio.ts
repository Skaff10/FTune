import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from "expo-audio";

class NativeAudioService {
  private player: AudioPlayer | null = null;
  private currentUri: string | null = null;
  private isModeSet = false;
  private subscription: { remove: () => void } | null = null;

  public onStateChange: ((isPlaying: boolean) => void) | null = null;
  public onTimeUpdate: ((positionSec: number, durationSec: number) => void) | null = null;
  public onTrackEnded: (() => void) | null = null;

  private async initMode() {
    if (this.isModeSet) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
      });
      this.isModeSet = true;
    } catch (e) {
      console.warn("[nativeAudio] setAudioModeAsync error:", e);
    }
  }

  public async play(uri: string, startPositionSeconds = 0): Promise<boolean> {
    await this.initMode();

    try {
      this.stop();

      this.currentUri = uri;
      const player = createAudioPlayer(uri, { updateInterval: 500 });
      this.player = player;

      this.subscription = player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
        if (this.onStateChange) {
          this.onStateChange(status.playing);
        }
        if (this.onTimeUpdate) {
          this.onTimeUpdate(status.currentTime || 0, status.duration || 0);
        }
        if (status.didJustFinish && !status.loop) {
          if (this.onTrackEnded) {
            this.onTrackEnded();
          }
        }
      });

      if (startPositionSeconds > 0) {
        await player.seekTo(startPositionSeconds);
      }
      player.play();
      return true;
    } catch (err: any) {
      console.warn("[nativeAudio] Play error:", err?.message);
      return false;
    }
  }

  public pause(): void {
    try {
      this.player?.pause();
    } catch (e) {
      console.warn("[nativeAudio] Pause error:", e);
    }
  }

  public resume(): void {
    try {
      this.player?.play();
    } catch (e) {
      console.warn("[nativeAudio] Resume error:", e);
    }
  }

  public async seek(seconds: number): Promise<void> {
    try {
      if (this.player) {
        await this.player.seekTo(Math.max(0, seconds));
      }
    } catch (e) {
      console.warn("[nativeAudio] Seek error:", e);
    }
  }

  public setVolume(volume: number): void {
    try {
      if (this.player) {
        this.player.volume = Math.max(0, Math.min(1, volume));
      }
    } catch (e) {
      console.warn("[nativeAudio] Set volume error:", e);
    }
  }

  public stop(): void {
    try {
      if (this.subscription) {
        this.subscription.remove();
        this.subscription = null;
      }
      if (this.player) {
        this.player.pause();
        this.player.remove();
        this.player = null;
      }
    } catch {}
  }
}

export const nativeAudio = new NativeAudioService();
