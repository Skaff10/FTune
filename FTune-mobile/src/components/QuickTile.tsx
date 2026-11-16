import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Play } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { Track } from "../types";
import { EqBars } from "./AnimatedComponents";

interface QuickTileProps {
  track: Track;
  isPlaying?: boolean;
  onPlay: (track: Track) => void;
}

export const QuickTile: React.FC<QuickTileProps> = ({ track, isPlaying = false, onPlay }) => {
  return (
    <TouchableOpacity
      style={[styles.tile, isPlaying && styles.tilePlaying]}
      activeOpacity={0.7}
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
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 8,
    overflow: "hidden",
    height: 54,
    margin: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  tilePlaying: {
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderColor: Colors.borderActive,
  },
  artwork: {
    width: 54,
    height: 54,
    backgroundColor: Colors.surfaceCard,
  },
  textContainer: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  title: {
    fontSize: 12.5,
    fontWeight: "600",
    color: Colors.inkHi,
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: 11,
    color: Colors.inkDim,
    marginTop: 2,
  },
  playingBadge: {
    marginRight: 10,
  },
});
