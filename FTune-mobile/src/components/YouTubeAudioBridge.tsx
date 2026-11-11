import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import YoutubePlayer, { PLAYER_STATES, type YoutubeIframeRef } from "react-native-youtube-iframe";

export interface AudioBridgeHandle {
  play: (videoId: string) => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  setVolume: (ratio: number) => void;
}

interface YouTubeAudioBridgeProps {
  onStateChange: (playing: boolean) => void;
  onTimeUpdate: (position: number, duration: number) => void;
  onTrackEnded: () => void;
}

export const YouTubeAudioBridge = forwardRef<AudioBridgeHandle, YouTubeAudioBridgeProps>(
  ({ onStateChange, onTimeUpdate, onTrackEnded }, ref) => {
    const playerRef = useRef<YoutubeIframeRef>(null);
    const [currentVideoId, setCurrentVideoId] = useState<string>("");
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const timerRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      play: (videoId: string) => {
        if (!videoId) return;
        setCurrentVideoId(videoId);
        setIsPlaying(true);
      },
      pause: () => {
        setIsPlaying(false);
      },
      resume: () => {
        if (currentVideoId) {
          setIsPlaying(true);
        }
      },
      seek: (seconds: number) => {
        playerRef.current?.seekTo(seconds, true);
      },
      setVolume: (_ratio: number) => {
        // System volume handles ratio on native mobile
      },
    }));

    // Poll current time and duration when active
    useEffect(() => {
      if (isPlaying && currentVideoId) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(async () => {
          try {
            if (playerRef.current) {
              const [pos, dur] = await Promise.all([
                playerRef.current.getCurrentTime().catch(() => 0),
                playerRef.current.getDuration().catch(() => 0),
              ]);
              if (typeof pos === "number" && !isNaN(pos)) {
                onTimeUpdate(pos, typeof dur === "number" && !isNaN(dur) ? dur : 0);
              }
            }
          } catch {}
        }, 500);
      } else {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [isPlaying, currentVideoId]);

    const handleStateChange = (state: PLAYER_STATES) => {
      if (state === PLAYER_STATES.PLAYING) {
        setIsPlaying(true);
        onStateChange(true);
      } else if (state === PLAYER_STATES.PAUSED) {
        setIsPlaying(false);
        onStateChange(false);
      } else if (state === PLAYER_STATES.ENDED) {
        setIsPlaying(false);
        onStateChange(false);
        onTrackEnded();
      }
    };

    return (
      <View style={styles.hiddenContainer} pointerEvents="none">
        {!!currentVideoId && (
          <YoutubePlayer
            ref={playerRef}
            height={240}
            width={240}
            play={isPlaying}
            videoId={currentVideoId}
            forceAndroidAutoplay={true}
            onChangeState={handleStateChange}
            onError={(e: string) => {
              console.warn("[YouTubeAudioBridge] Player error:", e);
            }}
            initialPlayerParams={{
              controls: false,
              preventFullScreen: true,
              rel: false,
              iv_load_policy: 3,
            }}
            webViewProps={{
              allowsInlineMediaPlayback: true,
              mediaPlaybackRequiresUserAction: false,
              androidLayerType: "hardware",
            }}
          />
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  hiddenContainer: {
    position: "absolute",
    top: -500,
    left: -500,
    width: 240,
    height: 240,
    opacity: 0.01,
  },
});
