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
import { ChevronLeft, Play, Download } from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { PCPlaylist, Track } from "../types";
import { SongRow } from "./SongRow";
import { downloadTrack, isTrackDownloaded } from "../services/downloadManager";
import { spotifyService } from "../services/spotify";

interface PlaylistDetailViewProps {
  playlist: PCPlaylist;
  currentTrackId?: string;
  isPlaying?: boolean;
  onBack: () => void;
  onPlaySong: (track: Track, queue: Track[]) => void;
  onPlayAll: (tracks: Track[]) => void;
  onToggleFavorite?: (track: Track) => void;
  isFavorite?: (trackId: string) => boolean;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({
  playlist,
  currentTrackId,
  isPlaying,
  onBack,
  onPlaySong,
  onPlayAll,
  onToggleFavorite,
  isFavorite,
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
    playlist.thumb ||
    tracks[0]?.thumb ||
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500";

  // Pre-warm YouTube matches for the first 5 tracks of a borrowed Spotify playlist
  useEffect(() => {
    const initial = tracks.slice(0, 5);
    for (const t of initial) {
      if (t.id.startsWith("sp_")) {
        spotifyService.resolvePlayableTrack(t).catch(() => {});
      }
    }
  }, [playlist.id]);

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
          <ChevronLeft size={24} color={Colors.inkHi} />
          <Text style={styles.backText}>Library</Text>
        </TouchableOpacity>
      </View>

      {/* Hero Header */}
      <View style={styles.hero}>
        <Image source={{ uri: firstCover }} style={styles.heroCover} />
        <View style={styles.heroInfo}>
          <Text style={styles.playlistType}>
            {playlist.source === "spotify" ? "SPOTIFY PLAYLIST" : "PLAYLIST"}
          </Text>
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
          activeOpacity={0.75}
        >
          <Play size={18} color="#000000" fill="#000000" style={{ marginRight: 6 }} />
          <Text style={styles.playAllText}>Play All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.downloadAllBtn}
          onPress={handleDownloadAll}
          disabled={downloadingAll || tracks.length === 0}
          activeOpacity={0.75}
        >
          {downloadingAll ? (
            <>
              <ActivityIndicator size="small" color={Colors.inkHi} style={{ marginRight: 6 }} />
              <Text style={styles.downloadAllText}>
                {downloadedCount}/{tracks.length}
              </Text>
            </>
          ) : (
            <>
              <Download size={18} color={Colors.inkHi} style={{ marginRight: 6 }} />
              <Text style={styles.downloadAllText}>Download</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Tracks List */}
      <FlatList
        data={tracks}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        renderItem={({ item }) => (
          <SongRow
            track={item}
            isPlaying={currentTrackId === item.id && !!isPlaying}
            isCurrent={currentTrackId === item.id}
            isFavorite={isFavorite ? isFavorite(item.id) : false}
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
    backgroundColor: Colors.base,
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
    color: Colors.inkHi,
    fontSize: 16,
    fontWeight: "600",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 16,
  },
  heroCover: {
    width: 110,
    height: 110,
    borderRadius: 12,
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.artworkBorder,
  },
  heroInfo: {
    flex: 1,
    justifyContent: "center",
  },
  playlistType: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.inkDim,
    letterSpacing: 1,
    marginBottom: 4,
  },
  playlistName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.inkHi,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  trackCount: {
    fontSize: 13,
    color: Colors.inkDim,
  },
  actionsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.hairline,
  },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
  },
  playAllText: {
    color: Colors.onPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  downloadAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.hairline,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },
  downloadAllText: {
    color: Colors.inkHi,
    fontSize: 14,
    fontWeight: "600",
  },
});
