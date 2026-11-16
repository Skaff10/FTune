import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Colors } from "../theme/colors";
import type { Track } from "../types";
import { EqBars } from "./AnimatedComponents";

interface ShelfCardProps {
  track: Track;
  isPlaying?: boolean;
  onPlay: (track: Track) => void;
}

/**
 * Matches PC TrackCard (Cards.tsx): pure square artwork with subtle hairline,
 * clean title + artist beneath, and subtle active indicator when playing.
 */
export const ShelfCard: React.FC<ShelfCardProps> = ({ track, isPlaying = false, onPlay }) => {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() => onPlay(track)}
    >
      <View style={styles.artworkWrapper}>
        <Image
          source={{
            uri:
              track.thumb ||
              "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=240",
          }}
          style={styles.artwork}
        />
        {isPlaying && (
          <View style={styles.playingPill}>
            <EqBars color={Colors.inkHi} size={11} animating={true} />
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {track.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {track.artist}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 148,
    marginRight: 14,
  },
  artworkWrapper: {
    width: 148,
    height: 148,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.artworkBorder,
    marginBottom: 8,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  playingPill: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.inkHi,
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: 12.5,
    color: Colors.inkDim,
    marginTop: 2,
  },
});
