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
        <View style={styles.playOverlay}>
          <Play size={14} color="#000000" fill="#000000" style={{ marginLeft: 1.5 }} />
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
    width: 140,
    marginRight: 14,
  },
  artworkWrapper: {
    width: 140,
    height: 140,
    borderRadius: 10,
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
  playOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.inkHi,
    justifyContent: "center",
    alignItems: "center",
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
