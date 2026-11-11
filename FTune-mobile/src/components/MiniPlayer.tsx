import React, { useRef } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, PanResponder } from "react-native";
import { Play, Pause, SkipForward, SkipBack } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { RemotePlayerState } from "../types";

interface MiniPlayerProps {
  playerState: RemotePlayerState;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onPress: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  playerState,
  onTogglePlay,
  onNext,
  onPrev,
  onPress,
}) => {
  const track = playerState.currentTrack;

  // Swipe Gestures on MiniPlayer:
  // Swipe Left -> Next
  // Swipe Right -> Prev
  // Swipe Up -> Open FullPlayer
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > 15 || Math.abs(gesture.dy) > 15;
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -40 && Math.abs(gesture.dx) < 40) {
          onPress(); // Swipe up expands player
        } else if (gesture.dx < -40 && Math.abs(gesture.dy) < 40) {
          onNext(); // Swipe left skips to next
        } else if (gesture.dx > 40 && Math.abs(gesture.dy) < 40) {
          onPrev(); // Swipe right skips to prev
        }
      },
    })
  ).current;

  if (!track) return null;

  const duration = playerState.duration || track.duration || 1;
  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (playerState.position / duration) * 100))
      : 0;

  return (
    <View style={styles.outerWrapper} {...panResponder.panHandlers}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={onPress}
      >
        {/* Sleek top progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>

        <View style={styles.container}>
          <Image
            source={{
              uri:
                track.thumb ||
                "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120",
            }}
            style={styles.thumb}
          />

          <View style={styles.infoWrapper}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist}
            </Text>
          </View>

          {/* Transport buttons: Prev, Play/Pause, Next */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.button}
              onPress={(e) => {
                e.stopPropagation();
                onPrev();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              <SkipBack size={18} color="#ffffff" fill="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playButton}
              onPress={(e) => {
                e.stopPropagation();
                onTogglePlay();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              {playerState.playing ? (
                <Pause size={18} color="#000000" fill="#000000" />
              ) : (
                <Play
                  size={18}
                  color="#000000"
                  fill="#000000"
                  style={{ marginLeft: 2 }}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={(e) => {
                e.stopPropagation();
                onNext();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              <SkipForward size={18} color="#ffffff" fill="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    paddingHorizontal: 8,
    paddingBottom: 4,
    backgroundColor: "transparent",
  },
  card: {
    backgroundColor: "#16161a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  progressTrack: {
    height: 2.5,
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#ffffff",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  thumb: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: Colors.surfaceHover,
  },
  infoWrapper: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  title: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  button: {
    padding: 6,
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
});
