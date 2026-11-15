import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Play } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { Track } from "../types";
import { SpringTouchable } from "./AnimatedComponents";

interface ShelfCardProps {
  track: Track;
  onPlay: (track: Track) => void;
}

export const ShelfCard: React.FC<ShelfCardProps> = ({ track, onPlay }) => {
  return (
    <SpringTouchable style={styles.card} activeScale={0.96} onPress={() => onPlay(track)}>
      <View style={styles.artworkWrapper}>
        <Image
          source={{ uri: track.thumb || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=240" }}
          style={styles.artwork}
        />
        <View style={styles.playOverlay}>
          <Play size={15} color="#000000" fill="#000000" style={{ marginLeft: 2 }} />
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {track.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {track.artist}
      </Text>
    </SpringTouchable>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 140,
    marginRight: 14,
  },
  artworkWrapper: {
    width: 140,
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.artworkBorder,
    marginBottom: 8,
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
    backgroundColor: Colors.inkHi,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  title: {
    fontSize: 13.5,
    fontWeight: "600",
    color: Colors.inkHi,
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: 12,
    color: Colors.inkDim,
    marginTop: 2,
  },
});
