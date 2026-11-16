import React, { useState, useEffect } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Download, Check } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { Track } from "../types";
import { isTrackDownloadedSync, downloadTrack } from "../services/downloadManager";
import { EqBars, AnimatedHeart } from "./AnimatedComponents";

interface SongRowProps {
  track: Track;
  isPlaying?: boolean;
  isCurrent?: boolean;
  isFavorite?: boolean;
  onPlay: (track: Track) => void;
  onToggleFavorite?: (track: Track) => void;
}

export const SongRow: React.FC<SongRowProps> = React.memo(({
  track,
  isPlaying = false,
  isCurrent = false,
  isFavorite = false,
  onPlay,
  onToggleFavorite,
}) => {
  const [downloaded, setDownloaded] = useState(() => isTrackDownloadedSync(track.id));
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setDownloaded(isTrackDownloadedSync(track.id));
  }, [track.id]);

  const handleDownloadPress = async () => {
    if (downloaded || downloading) return;
    setDownloading(true);
    const uri = await downloadTrack(track);
    setDownloading(false);
    if (uri) {
      setDownloaded(true);
    }
  };

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec)) return "";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <TouchableOpacity
      style={[styles.container, isCurrent && styles.activeContainer]}
      activeOpacity={0.7}
      onPress={() => onPlay(track)}
    >
      <View style={styles.thumbWrapper}>
        <Image
          source={{ uri: track.thumb || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120" }}
          style={styles.thumb}
        />
        {isCurrent && (
          <View style={styles.playingOverlay}>
            {isPlaying ? (
              <EqBars color="#000000" size={13} animating={true} />
            ) : (
              <View style={styles.pausedDot} />
            )}
          </View>
        )}
      </View>

      <View style={styles.infoWrapper}>
        <Text style={[styles.title, isCurrent && styles.activeTitle]} numberOfLines={1}>
          {track.title}
        </Text>
        <View style={styles.metaRow}>
          {track.explicit && (
            <View style={styles.explicitBadge}>
              <Text style={styles.explicitText}>E</Text>
            </View>
          )}
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
          {track.duration > 0 && (
            <>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.actionsRow}>
        {/* Offline Download button */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleDownloadPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={downloaded || downloading}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={Colors.inkHi} />
          ) : downloaded ? (
            <View style={styles.downloadedBadge}>
              <Check size={11} color="#000" strokeWidth={3} />
            </View>
          ) : (
            <Download size={16} color={Colors.inkDim} />
          )}
        </TouchableOpacity>

        {/* Favorite Heart button with Apple Pop Animation */}
        {onToggleFavorite && (
          <View style={styles.actionBtn}>
            <AnimatedHeart
              isFavorite={isFavorite}
              onPress={() => onToggleFavorite(track)}
              size={17}
              color={Colors.inkDim}
            />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  activeContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  thumbWrapper: {
    position: "relative",
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: "hidden",
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.artworkBorder,
  },
  thumb: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.panel,
  },
  playingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    justifyContent: "center",
    alignItems: "center",
  },
  pausedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#000",
  },
  infoWrapper: {
    flex: 1,
    justifyContent: "center",
    marginRight: 8,
  },
  title: {
    fontSize: 14.5,
    fontWeight: "600",
    color: Colors.inkHi,
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  activeTitle: {
    color: Colors.inkHi,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  explicitBadge: {
    backgroundColor: Colors.elevated,
    paddingHorizontal: 3.5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  explicitText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.inkDim,
  },
  artist: {
    fontSize: 12.5,
    color: Colors.inkDim,
    flexShrink: 1,
  },
  dot: {
    fontSize: 10,
    color: Colors.inkGhost,
  },
  duration: {
    fontSize: 12,
    color: Colors.inkFaint,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtn: {
    padding: 6,
    borderRadius: 999,
  },
  downloadedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.inkHi,
    justifyContent: "center",
    alignItems: "center",
  },
});
