import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Play } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { Track } from "../types";

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
        source={{ uri: track.thumb || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120" }}
        style={styles.artwork}
      />
      <View style={styles.textContainer}>
        <Text style={[styles.title, isPlaying && styles.playingTitle]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <View style={styles.playButton}>
        <Play size={13} color="#000000" fill="#000000" style={{ marginLeft: 1 }} />
      </View>
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
    height: 52,
    margin: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  tilePlaying: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  artwork: {
    width: 52,
    height: 52,
    backgroundColor: Colors.surfaceCard,
  },
  textContainer: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  title: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  playingTitle: {
    color: "#ffffff",
  },
  artist: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  playButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
});
