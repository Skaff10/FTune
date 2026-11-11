import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Play } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { Track } from "../types";

interface ShelfCardProps {
  track: Track;
  onPlay: (track: Track) => void;
}

export const ShelfCard: React.FC<ShelfCardProps> = ({ track, onPlay }) => {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => onPlay(track)}>
      <View style={styles.artworkWrapper}>
        <Image
          source={{ uri: track.thumb || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=240" }}
          style={styles.artwork}
        />
        <View style={styles.playOverlay}>
          <Play size={16} color="#000000" fill="#000000" style={{ marginLeft: 2 }} />
        </View>
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
    width: 136,
    marginRight: 14,
  },
  artworkWrapper: {
    width: 136,
    height: 136,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  playOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 8,
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
