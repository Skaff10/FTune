import React, { useRef } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, PanResponder } from "react-native";
import { Play, Pause, SkipForward, SkipBack } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { RemotePlayerState } from "../types";
import { EqBars } from "./AnimatedComponents";

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

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 15 || Math.abs(gesture.dy) > 15,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -40 && Math.abs(gesture.dx) < 40) {
          onPress();
        } else if (gesture.dx < -40 && Math.abs(gesture.dy) < 40) {
          onNext();
        } else if (gesture.dx > 40 && Math.abs(gesture.dy) < 40) {
          onPrev();
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
      <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={onPress}>
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

          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.button}
              activeOpacity={0.65}
              onPress={(e) => {
                e.stopPropagation();
                onPrev();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
            >
              <SkipBack size={17} color={Colors.inkHi} fill={Colors.inkHi} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playButton}
              activeOpacity={0.75}
              onPress={(e) => {
                e.stopPropagation();
                onTogglePlay();
              }}
            >
              {playerState.playing ? (
                <Pause size={16} color="#000000" fill="#000000" />
              ) : (
                <Play
                  size={16}
                  color="#000000"
                  fill="#000000"
                  style={{ marginLeft: 1.5 }}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              activeOpacity={0.65}
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
    backgroundColor: "rgba(17, 17, 19, 0.96)",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    overflow: "hidden",
  },
  progressTrack: {
    height: 2,
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
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
    width: 42,
    height: 42,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
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
    fontSize: 13.5,
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
    gap: 6,
  },
  button: {
    padding: 6,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
