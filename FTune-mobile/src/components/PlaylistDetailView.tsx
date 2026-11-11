import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  BackHandler,
  ActivityIndicator,
} from "react-native";
import { ChevronLeft, Play, Download, Check } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { PCPlaylist, Track } from "../types";
import { SongRow } from "./SongRow";
import { downloadTrack, isTrackDownloaded } from "../services/downloadManager";

interface PlaylistDetailViewProps {
  playlist: PCPlaylist;
  currentTrackId?: string;
  isPlaying?: boolean;
  onBack: () => void;
  onPlaySong: (track: Track, queue: Track[]) => void;
  onPlayAll: (tracks: Track[]) => void;
  onToggleFavorite?: (track: Track) => void;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({
  playlist,
  currentTrackId,
  isPlaying,
  onBack,
  onPlaySong,
  onPlayAll,
  onToggleFavorite,
}) => {
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadedCount, setDownloadedCount] = useState(0);

  // Hardware Android back button navigates back
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const tracks = playlist.tracks || [];
  const firstCover =
    tracks[0]?.thumb ||
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500";

  const handleDownloadAll = async () => {
    if (downloadingAll || tracks.length === 0) return;
    setDownloadingAll(true);
    let count = 0;
    for (const t of tracks) {
      const already = await isTrackDownloaded(t.id);
      if (!already) {
        await downloadTrack(t);
      }
      count++;
      setDownloadedCount(count);
    }
    setDownloadingAll(false);
  };

  return (
    <View style={styles.container}>
      {/* Top Header Row with Clear Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft size={28} color="#ffffff" />
          <Text style={styles.backText}>Library</Text>
        </TouchableOpacity>
      </View>

      {/* Hero Header */}
      <View style={styles.hero}>
        <Image source={{ uri: firstCover }} style={styles.heroCover} />
        <View style={styles.heroInfo}>
          <Text style={styles.playlistType}>PLAYLIST</Text>
          <Text style={styles.playlistName} numberOfLines={2}>
            {playlist.name}
          </Text>
          <Text style={styles.trackCount}>{tracks.length} songs</Text>
        </View>
      </View>

      {/* Action Buttons: Play All & Download Playlist */}
      <View style={styles.actionsBar}>
        <TouchableOpacity
          style={styles.playAllBtn}
          onPress={() => onPlayAll(tracks)}
          disabled={tracks.length === 0}
          activeOpacity={0.85}
        >
          <Play size={18} color="#000000" fill="#000000" style={{ marginRight: 6 }} />
          <Text style={styles.playAllText}>Play All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.downloadAllBtn}
          onPress={handleDownloadAll}
          disabled={downloadingAll || tracks.length === 0}
        >
          {downloadingAll ? (
            <>
              <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.downloadAllText}>
                {downloadedCount}/{tracks.length}
              </Text>
            </>
          ) : (
            <>
              <Download size={18} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.downloadAllText}>Download</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Tracks List */}
      <FlatList
        data={tracks}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <SongRow
            track={item}
            isPlaying={currentTrackId === item.id && !!isPlaying}
            isCurrent={currentTrackId === item.id}
            onPlay={(t) => onPlaySong(t, tracks)}
            onToggleFavorite={onToggleFavorite}
          />
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  heroCover: {
    width: 110,
    height: 110,
    borderRadius: 10,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  heroInfo: {
    flex: 1,
  },
  playlistType: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  playlistName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  trackCount: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  actionsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  playAllText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "700",
  },
  downloadAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  downloadAllText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});

