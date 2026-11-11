import React, { useState, useEffect } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Play, Pause, Heart, Download, Check } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { Track } from "../types";
import { isTrackDownloaded, downloadTrack } from "../services/downloadManager";

interface SongRowProps {
  track: Track;
  isPlaying?: boolean;
  isCurrent?: boolean;
  isFavorite?: boolean;
  onPlay: (track: Track) => void;
  onToggleFavorite?: (track: Track) => void;
}

export const SongRow: React.FC<SongRowProps> = ({
  track,
  isPlaying = false,
  isCurrent = false,
  isFavorite = false,
  onPlay,
  onToggleFavorite,
}) => {
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let mounted = true;
    isTrackDownloaded(track.id).then((isDl) => {
      if (mounted) setDownloaded(isDl);
    });
    return () => {
      mounted = false;
    };
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
              <Pause size={14} color="#000" fill="#000" />
            ) : (
              <Play size={14} color="#000" fill="#000" style={{ marginLeft: 2 }} />
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
            <ActivityIndicator size="small" color={Colors.textPrimary} />
          ) : downloaded ? (
            <View style={styles.downloadedBadge}>
              <Check size={12} color="#000" strokeWidth={3} />
            </View>
          ) : (
            <Download size={17} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

        {/* Favorite Heart button */}
        {onToggleFavorite && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onToggleFavorite(track)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Heart
              size={18}
              color={isFavorite ? "#ef4444" : Colors.textMuted}
              fill={isFavorite ? "#ef4444" : "transparent"}
            />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 10,
    marginVertical: 1,
  },
  activeContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  thumbWrapper: {
    position: "relative",
    width: 46,
    height: 46,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  playingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  infoWrapper: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  activeTitle: {
    color: "#ffffff",
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  explicitBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginRight: 6,
  },
  explicitText: {
    color: Colors.textPrimary,
    fontSize: 9,
    fontWeight: "800",
  },
  artist: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  dot: {
    fontSize: 12,
    color: Colors.textMuted,
    marginHorizontal: 5,
  },
  duration: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 8,
  },
  actionBtn: {
    padding: 6,
  },
  downloadedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
});
