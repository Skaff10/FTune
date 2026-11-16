import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Colors } from "../theme/colors";
import type { Track } from "../types";
import { EqBars } from "./AnimatedComponents";

interface QuickTileProps {
  track: Track;
  isPlaying?: boolean;
  onPlay: (track: Track) => void;
}

/**
 * Matches PC HomeView QuickTile: translucent card over CoverGlow, flush left cover,
 * no thick borders, clean title & artist, EqBars when playing.
 */
export const QuickTile: React.FC<QuickTileProps> = ({ track, isPlaying = false, onPlay }) => {
  return (
    <TouchableOpacity
      style={[styles.tile, isPlaying && styles.tilePlaying]}
      activeOpacity={0.72}
      onPress={() => onPlay(track)}
    >
      <Image
        source={{
          uri:
            track.thumb ||
            "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120",
        }}
        style={styles.artwork}
      />
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      {isPlaying && (
        <View style={styles.playingBadge}>
          <EqBars color={Colors.inkHi} size={12} animating={true} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 8,
    overflow: "hidden",
    height: 56,
    margin: 4,
  },
  tilePlaying: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  artwork: {
    width: 56,
    height: 56,
    backgroundColor: Colors.surfaceCard,
  },
  textContainer: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.inkHi,
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: 11.5,
    color: Colors.inkFaint,
    marginTop: 2,
  },
  playingBadge: {
    marginRight: 10,
  },
});
