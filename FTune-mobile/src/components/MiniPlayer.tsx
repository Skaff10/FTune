import React, { useRef } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, PanResponder } from "react-native";
import { Play, Pause, SkipForward, SkipBack } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { RemotePlayerState } from "../types";
import { EqBars, SpringTouchable } from "./AnimatedComponents";

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
        activeOpacity={0.92}
        onPress={onPress}
      >
        {/* Sleek top progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>

        <View style={styles.container}>
          <View style={styles.thumbWrapper}>
            <Image
              source={{
                uri:
                  track.thumb ||
                  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120",
              }}
              style={styles.thumb}
            />
          </View>

          <View style={styles.infoWrapper}>
            <View style={styles.titleRow}>
              {playerState.playing && (
                <View style={{ marginRight: 6 }}>
                  <EqBars color={Colors.inkHi} size={11} animating={true} />
                </View>
              )}
              <Text style={styles.title} numberOfLines={1}>
                {track.title}
              </Text>
            </View>
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
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
            >
              <SkipBack size={17} color={Colors.inkHi} fill={Colors.inkHi} />
            </TouchableOpacity>

            <SpringTouchable
              style={styles.playButton}
              onPress={onTogglePlay}
              activeScale={0.9}
            >
              {playerState.playing ? (
                <Pause size={17} color="#000000" fill="#000000" />
              ) : (
                <Play
                  size={17}
                  color="#000000"
                  fill="#000000"
                  style={{ marginLeft: 2 }}
                />
              )}
            </SpringTouchable>

            <TouchableOpacity
              style={styles.button}
              onPress={(e) => {
                e.stopPropagation();
                onNext();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
            >
              <SkipForward size={17} color={Colors.inkHi} fill={Colors.inkHi} />
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
    backgroundColor: Colors.panel,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.hairline,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 10,
  },
  progressTrack: {
    height: 2.5,
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  progressBar: {
    height: "100%",
    backgroundColor: Colors.inkHi,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  thumbWrapper: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.artworkBorder,
    marginRight: 10,
  },
  thumb: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.surface,
  },
  infoWrapper: {
    flex: 1,
    justifyContent: "center",
    marginRight: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.inkHi,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  artist: {
    fontSize: 12,
    color: Colors.inkDim,
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  button: {
    padding: 6,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
