import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import {
  ArrowLeft,
  Play,
  Shuffle,
  ListMusic,
  Download,
  AlertCircle,
  ExternalLink,
} from "lucide-react-native";
import { Colors } from "../theme/colors";
import { SPOTIFY_GREEN, SpotifyIcon } from "./SpotifyIcon";
import { EqBars, SpringTouchable, AnimatedHeart, AmbientGlow } from "./AnimatedComponents";
import { spotifyService, LIKED_ID, LIKED_SLEEVE } from "../services/spotify";
import type { ImportedPlaylist, ImportSong, SpotifyPlaylistInfo, Track } from "../types";

interface SpotifyMatchedViewProps {
  playlistInfo: SpotifyPlaylistInfo;
  currentTrackId?: string;
  isPlaying?: boolean;
  onBack: () => void;
  onPlaySong: (track: Track, queue: Track[], startIndex?: number) => void;
  onToggleFavorite?: (track: Track) => void;
  isFavorite?: (trackId: string) => boolean;
}

export const SpotifyMatchedView: React.FC<SpotifyMatchedViewProps> = ({
  playlistInfo,
  currentTrackId,
  isPlaying = false,
  onBack,
  onPlaySong,
  onToggleFavorite,
  isFavorite,
}) => {
  const [playlist, setPlaylist] = useState<ImportedPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchedTracks, setMatchedTracks] = useState<Record<string, Track>>({});
  const [matchingStatus, setMatchingStatus] = useState<Record<string, "matching" | "done" | "fail">>({});

  const isLiked = playlistInfo.id === LIKED_ID;

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    spotifyService
      .fetchPlaylistTracks(playlistInfo.id)
      .then((data) => {
        if (!mounted) return;
        setPlaylist(data);
        setLoading(false);

        // Pre-match the first 5 tracks in background
        const initialBatch = (data?.songs || []).slice(0, 5);
        for (const song of initialBatch) {
          matchSong(song);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        console.warn("[spotify-matched] fetch error:", err);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [playlistInfo.id]);

  const matchSong = async (song: ImportSong): Promise<Track | null> => {
    const key = song.spotifyId || song.title;
    if (matchedTracks[key]) return matchedTracks[key];

    setMatchingStatus((prev) => ({ ...prev, [key]: "matching" }));
    const track = await spotifyService.matchSongToYouTube(song);

    if (track) {
      setMatchedTracks((prev) => ({ ...prev, [key]: track }));
      setMatchingStatus((prev) => ({ ...prev, [key]: "done" }));
      return track;
    } else {
      setMatchingStatus((prev) => ({ ...prev, [key]: "fail" }));
      return null;
    }
  };

  const handleTrackPress = async (song: ImportSong, index: number) => {
    const key = song.spotifyId || song.title;
    let track: Track | null = matchedTracks[key] ?? null;

    if (!track) {
      track = await matchSong(song);
    }

    if (track) {
      // Build a playable queue with all currently matched tracks
      const queue: Track[] = (playlist?.songs || [])
        .map((s) => matchedTracks[s.spotifyId || s.title])
        .filter(Boolean) as Track[];

      if (queue.length === 0) queue.push(track);
      const startIdx = queue.findIndex((t) => t.id === track?.id);
      onPlaySong(track, queue, Math.max(0, startIdx));
    }
  };

  const handlePlayAll = async (shuffle = false) => {
    if (!playlist || playlist.songs.length === 0) return;

    // Match first track if not yet matched
    const firstSong = playlist.songs[0];
    const key = firstSong.spotifyId || firstSong.title;
    let firstTrack: Track | null = matchedTracks[key] ?? null;

    if (!firstTrack) {
      firstTrack = await matchSong(firstSong);
    }

    if (firstTrack) {
      const queue: Track[] = (playlist.songs || [])
        .map((s) => matchedTracks[s.spotifyId || s.title])
        .filter(Boolean) as Track[];
      if (queue.length === 0) queue.push(firstTrack);

      if (shuffle) {
        const shuffled = [...queue].sort(() => Math.random() - 0.5);
        onPlaySong(shuffled[0], shuffled, 0);
      } else {
        onPlaySong(firstTrack, queue, 0);
      }
    }
  };

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec)) return "";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const coverUrl = isLiked
    ? LIKED_SLEEVE
    : playlist?.thumb || playlistInfo.thumb || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300";

  return (
    <View style={styles.root}>
      {/* Top Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ArrowLeft size={22} color={Colors.inkHi} />
        </TouchableOpacity>
        <View style={styles.navBrand}>
          <SpotifyIcon size={18} />
          <Text style={styles.navBrandText}>Spotify</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={SPOTIFY_GREEN} />
          <Text style={styles.loadingText}>Loading Spotify tracks...</Text>
        </View>
      ) : (
        <FlatList
          data={playlist?.songs || []}
          keyExtractor={(item, idx) => item.spotifyId || `${item.title}-${idx}`}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={() => (
            <View style={styles.heroSection}>
              <AmbientGlow color={isLiked ? "rgba(30, 215, 96, 0.35)" : "rgba(139, 92, 246, 0.25)"} intensity={0.25}>
                <View style={styles.heroCard}>
                  <View style={styles.coverWrapper}>
                    <Image source={{ uri: coverUrl }} style={styles.coverArt} />
                    <View style={styles.spotifyCornerBadge}>
                      <SpotifyIcon size={14} />
                    </View>
                  </View>

                  <View style={styles.heroDetails}>
                    <View style={styles.badgeRow}>
                      <View style={styles.spotifyBadge}>
                        <Text style={styles.spotifyBadgeText}>
                          {isLiked ? "SPOTIFY LIKED SONGS" : "SPOTIFY PLAYLIST"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.heroTitle} numberOfLines={2}>
                      {playlist?.name || playlistInfo.name}
                    </Text>

                    <Text style={styles.heroSubtitle}>
                      {playlist?.owner ? `By ${playlist.owner} • ` : ""}
                      {playlist?.total || playlist?.songs.length || 0} songs
                    </Text>

                    <Text style={styles.heroMatchingNote}>
                      Plays from YouTube Music, matched by title and artist.
                    </Text>

                    {/* Action Buttons */}
                    <View style={styles.actionsRow}>
                      <SpringTouchable style={styles.playFab} onPress={() => handlePlayAll(false)}>
                        <Play size={18} color="#000000" fill="#000000" style={{ marginRight: 6 }} />
                        <Text style={styles.playFabText}>Play</Text>
                      </SpringTouchable>

                      <SpringTouchable style={styles.roundActionBtn} onPress={() => handlePlayAll(true)}>
                        <Shuffle size={18} color={Colors.inkHi} />
                      </SpringTouchable>
                    </View>
                  </View>
                </View>
              </AmbientGlow>
            </View>
          )}
          renderItem={({ item, index }) => {
            const key = item.spotifyId || item.title;
            const matched = matchedTracks[key];
            const status = matchingStatus[key];
            const isCurrent = !!matched && currentTrackId === matched.id;
            const fav = !!matched && !!isFavorite && isFavorite(matched.id);

            return (
              <TouchableOpacity
                style={[styles.songRow, isCurrent && styles.activeSongRow]}
                activeOpacity={0.7}
                onPress={() => handleTrackPress(item, index)}
              >
                {/* Index or EqBars */}
                <View style={styles.indexBox}>
                  {isCurrent && isPlaying ? (
                    <EqBars color={SPOTIFY_GREEN} size={14} animating={true} />
                  ) : (
                    <Text style={[styles.indexText, isCurrent && styles.activeIndexText]}>
                      {index + 1}
                    </Text>
                  )}
                </View>

                {/* Artwork */}
                <View style={styles.thumbWrapper}>
                  {item.thumb ? (
                    <Image source={{ uri: item.thumb }} style={styles.songThumb} />
                  ) : (
                    <View style={[styles.songThumb, styles.placeholderThumb]}>
                      <ListMusic size={16} color={Colors.inkDim} />
                    </View>
                  )}
                </View>

                {/* Song Info */}
                <View style={styles.songInfo}>
                  <Text style={[styles.songTitle, isCurrent && styles.activeSongTitle]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.songMetaRow}>
                    {item.explicit && (
                      <View style={styles.explicitBadge}>
                        <Text style={styles.explicitText}>E</Text>
                      </View>
                    )}
                    <Text style={styles.songArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                    {item.duration > 0 && (
                      <>
                        <Text style={styles.metaDot}>•</Text>
                        <Text style={styles.songDuration}>{formatDuration(item.duration)}</Text>
                      </>
                    )}
                  </View>
                </View>

                {/* Status or Favorite */}
                <View style={styles.statusBox}>
                  {status === "matching" ? (
                    <ActivityIndicator size="small" color={SPOTIFY_GREEN} />
                  ) : matched ? (
                    onToggleFavorite && (
                      <AnimatedHeart
                        isFavorite={fav}
                        onPress={() => onToggleFavorite(matched)}
                        size={17}
                      />
                    )
                  ) : status === "fail" ? (
                    <AlertCircle size={15} color={Colors.inkGhost} />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.base,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.panel,
  },
  navBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  navBrandText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.inkHi,
  },
  centerLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.inkDim,
  },
  heroSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairline,
    padding: 18,
    alignItems: "center",
  },
  coverWrapper: {
    position: "relative",
    width: 170,
    height: 170,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.artworkBorder,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  coverArt: {
    width: "100%",
    height: "100%",
  },
  spotifyCornerBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.75)",
    padding: 5,
    borderRadius: 999,
  },
  heroDetails: {
    alignItems: "center",
    width: "100%",
  },
  badgeRow: {
    marginBottom: 6,
  },
  spotifyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(30, 215, 96, 0.15)",
  },
  spotifyBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: SPOTIFY_GREEN,
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.inkHi,
    letterSpacing: -0.4,
    textAlign: "center",
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: Colors.inkDim,
    marginBottom: 6,
  },
  heroMatchingNote: {
    fontSize: 11.5,
    color: Colors.inkFaint,
    textAlign: "center",
    marginBottom: 18,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playFab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  playFabText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.onPrimary,
  },
  roundActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginHorizontal: 10,
    marginVertical: 2,
  },
  activeSongRow: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  indexBox: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  indexText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.inkGhost,
  },
  activeIndexText: {
    color: SPOTIFY_GREEN,
    fontWeight: "700",
  },
  thumbWrapper: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.artworkBorder,
    marginRight: 12,
  },
  songThumb: {
    width: "100%",
    height: "100%",
  },
  placeholderThumb: {
    backgroundColor: Colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  songInfo: {
    flex: 1,
    justifyContent: "center",
  },
  songTitle: {
    fontSize: 14.5,
    fontWeight: "600",
    color: Colors.inkHi,
    marginBottom: 3,
  },
  activeSongTitle: {
    color: SPOTIFY_GREEN,
  },
  songMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  explicitBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: Colors.elevated,
  },
  explicitText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.inkDim,
  },
  songArtist: {
    fontSize: 12.5,
    color: Colors.inkDim,
    flexShrink: 1,
  },
  metaDot: {
    fontSize: 10,
    color: Colors.inkGhost,
  },
  songDuration: {
    fontSize: 12,
    color: Colors.inkFaint,
  },
  statusBox: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
});
