import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Play } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { Track } from "../types";
import { EqBars, SpringTouchable } from "./AnimatedComponents";

interface QuickTileProps {
  track: Track;
  isPlaying?: boolean;
  onPlay: (track: Track) => void;
}

export const QuickTile: React.FC<QuickTileProps> = ({ track, isPlaying = false, onPlay }) => {
  return (
    <SpringTouchable
      style={[styles.tile, isPlaying && styles.tilePlaying]}
      activeScale={0.96}
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
      <View style={[styles.playButton, isPlaying && styles.playingButton]}>
        {isPlaying ? (
          <EqBars color="#000000" size={11} animating={true} />
        ) : (
          <Play size={12} color="#000000" fill="#000000" style={{ marginLeft: 1 }} />
        )}
      </View>
    </SpringTouchable>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.panel,
    borderRadius: 8,
    overflow: "hidden",
    height: 52,
    margin: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  tilePlaying: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: Colors.borderActive,
  },
  artwork: {
    width: 52,
    height: 52,
    backgroundColor: Colors.surfaceCard,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.artworkBorder,
  },
  textContainer: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  title: {
    fontSize: 12.5,
    fontWeight: "700",
    color: Colors.inkHi,
    letterSpacing: -0.2,
  },
  playingTitle: {
    color: Colors.inkHi,
  },
  artist: {
    fontSize: 11,
    color: Colors.inkDim,
    marginTop: 2,
  },
  playButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.inkHi,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  playingButton: {
    backgroundColor: Colors.inkHi,
  },
});
