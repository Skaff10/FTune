import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  BackHandler,
  Alert,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Search,
  X,
  Laptop,
  Smartphone,
  Music,
  Sparkles,
  Disc3,
  Heart,
  Download,
  ListMusic,
  ChevronRight,
  Trash2,
} from "lucide-react-native";
import { Colors } from "./src/theme/colors";
import type {
  PCPlaylist,
  RemoteLibraryState,
  RemotePlayerState,
  SearchFilter,
  Track,
} from "./src/types";
import {
  initServerAddress,
  searchMusic,
  sendRemoteAction,
  connectWebSocket,
  autoDiscover,
  fetchPCLibrary,
  fetchPlaylistDetails,
} from "./src/services/api";
import { nativeAudio } from "./src/services/nativeAudio";
import { resolveAudioStream } from "./src/services/streamResolver";
import {
  getDownloadedTracks,
  subscribeDownloads,
  deleteDownloadedTrack,
  downloadTrack,
} from "./src/services/downloadManager";
import { SongRow } from "./src/components/SongRow";
import { MiniPlayer } from "./src/components/MiniPlayer";
import { FullPlayer } from "./src/components/FullPlayer";
import { ConnectModal } from "./src/components/ConnectModal";
import { BottomNavBar, type TabKey } from "./src/components/BottomNavBar";
import { QuickTile } from "./src/components/QuickTile";
import { ShelfCard } from "./src/components/ShelfCard";
import { PlaylistDetailView } from "./src/components/PlaylistDetailView";
import { FTuneLogo } from "./src/components/FTuneLogo";
import {
  getOfflineFavorites,
  toggleOfflineFavorite,
  saveRecentTrack,
} from "./src/services/favorites";

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "songs", label: "Songs" },
  { id: "videos", label: "Videos" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
  { id: "playlists", label: "Playlists" },
];

const INITIAL_QUICK_PICKS: Track[] = [
  {
    id: "kJQP7kiw5Fk",
    title: "Despacito",
    artist: "Luis Fonsi ft. Daddy Yankee",
    duration: 228,
    thumb: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg",
  },
  {
    id: "fJ9rUzIMcZQ",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    duration: 359,
    thumb: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
  },
  {
    id: "hT_nvWreIhg",
    title: "Counting Stars",
    artist: "OneRepublic",
    duration: 257,
    thumb: "https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg",
  },
  {
    id: "09R8_2nJtjg",
    title: "Sugar",
    artist: "Maroon 5",
    duration: 235,
    thumb: "https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg",
  },
  {
    id: "YQHsXMglC9A",
    title: "Hello",
    artist: "Adele",
    duration: 295,
    thumb: "https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg",
  },
  {
    id: "JGwWNGJdvx8",
    title: "Shape of You",
    artist: "Ed Sheeran",
    duration: 233,
    thumb: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg",
  },
];

function MainContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<SearchFilter>("all");
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hostname, setHostname] = useState("FTune PC");

  // Playback Target: "phone" (native expo-av audio) or "pc" (controls FTune Desktop)
  const [playbackTarget, setPlaybackTarget] = useState<"phone" | "pc">("phone");

  // Offline Favorites & Downloaded Tracks
  const [favorites, setFavorites] = useState<Track[]>(INITIAL_QUICK_PICKS.slice(0, 4));
  const [downloadedTracks, setDownloadedTracks] = useState<Track[]>([]);

  // PC Library state (playlists + liked)
  const [pcPlaylists, setPcPlaylists] = useState<PCPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PCPlaylist | null>(null);

  // Library subtab
  const [librarySubTab, setLibrarySubTab] = useState<"playlists" | "liked" | "queue">("playlists");

  // Modals
  const [connectModalVisible, setConnectModalVisible] = useState(false);
  const [fullPlayerVisible, setFullPlayerVisible] = useState(false);

  // Unified Player State
  const [playerState, setPlayerState] = useState<RemotePlayerState>({
    currentTrack: null,
    playing: false,
    position: 0,
    duration: 0,
    volume: 0.8,
    muted: false,
    shuffle: false,
    repeat: "off",
    queue: [],
    index: 0,
  });

  const searchDebounce = useRef<any>(null);
  const playbackTargetRef = useRef<"phone" | "pc">("phone");
  const playerStateRef = useRef<RemotePlayerState>(playerState);

  useEffect(() => {
    playbackTargetRef.current = playbackTarget;
  }, [playbackTarget]);

  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  // Handle hardware Android Back Button
  useEffect(() => {
    const onBackPress = () => {
      if (fullPlayerVisible) {
        setFullPlayerVisible(false);
        return true;
      }
      if (selectedPlaylist) {
        setSelectedPlaylist(null);
        return true;
      }
      if (activeTab !== "home") {
        setActiveTab("home");
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [fullPlayerVisible, selectedPlaylist, activeTab]);

  // Wire up Native Audio engine listeners for standalone Phone playback
  useEffect(() => {
    nativeAudio.onStateChange = (isPlaying) => {
      if (playbackTargetRef.current === "phone") {
        setPlayerState((prev) => ({ ...prev, playing: isPlaying }));
      }
    };

    nativeAudio.onTimeUpdate = (posSec, durSec) => {
      if (playbackTargetRef.current === "phone") {
        setPlayerState((prev) => ({
          ...prev,
          position: posSec,
          duration: durSec > 0 ? durSec : prev.duration,
        }));
      }
    };

    nativeAudio.onTrackEnded = () => {
      if (playbackTargetRef.current === "phone") {
        handleNext();
      }
    };

    return () => {
      nativeAudio.onStateChange = null;
      nativeAudio.onTimeUpdate = null;
      nativeAudio.onTrackEnded = null;
    };
  }, []);

  // Smooth position progression on PC mode between state pushes
  useEffect(() => {
    if (playbackTarget === "pc" && playerState.playing) {
      const interval = setInterval(() => {
        setPlayerState((prev) => {
          if (!prev.playing || prev.position >= prev.duration) return prev;
          return { ...prev, position: prev.position + 1 };
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [playbackTarget, playerState.playing, playerState.duration]);

  // Initialize storage, offline downloads, favorites, and PC connection
  useEffect(() => {
    let cleanupWs: (() => void) | null = null;

    const init = async () => {
      await initServerAddress();

      // Load offline saved favorites
      const savedFavs = await getOfflineFavorites();
      if (savedFavs && savedFavs.length > 0) {
        setFavorites(savedFavs);
      }

      // Load offline downloaded tracks
      const dls = await getDownloadedTracks();
      setDownloadedTracks(dls);

      // Subscribe to downloads updates
      const unsubDls = subscribeDownloads((tracks) => {
        setDownloadedTracks(tracks);
      });

      // Auto-scan local Wi-Fi in background
      autoDiscover().then((found) => {
        if (found) {
          fetchPCLibrary().then((lib) => {
            if (lib?.playlists) setPcPlaylists(lib.playlists);
          });
        }
      });

      cleanupWs = connectWebSocket(
        (newState) => {
          // Sync PC player state when in PC mode
          if (playbackTargetRef.current === "pc") {
            setPlayerState((prev) => ({ ...prev, ...newState }));
          }
        },
        (isConnected) => {
          setConnected(isConnected);
          if (isConnected) {
            setPlaybackTarget("pc");
            fetchPCLibrary().then((lib) => {
              if (lib?.playlists) setPcPlaylists(lib.playlists);
            });
          }
        },
        (lib: RemoteLibraryState) => {
          if (lib?.playlists) {
            setPcPlaylists(lib.playlists);
          }
        }
      );

      return () => {
        unsubDls();
      };
    };

    init();

    return () => {
      if (cleanupWs) cleanupWs();
    };
  }, []);

  // Search input handler with 350ms debounce
  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (activeTab !== "search") setActiveTab("search");

    if (searchDebounce.current) clearTimeout(searchDebounce.current);

    if (!text.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await searchMusic(text.trim(), activeFilter);
        setResults(res.songs || []);
      } catch (err: any) {
        console.warn("Search error:", err);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const handleFilterChange = async (filter: SearchFilter) => {
    setActiveFilter(filter);
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await searchMusic(query.trim(), filter);
      setResults(res.songs || []);
    } catch (err: any) {
      console.warn("Filter search error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Playback action dispatcher (Routes to Phone native audio or PC remote)
  const handlePlaySong = async (track: Track, customQueue?: Track[], startIndex?: number) => {
    saveRecentTrack(track);

    const q = customQueue || (results.length > 0 ? results : [track]);
    const trackIndex =
      typeof startIndex === "number"
        ? startIndex
        : Math.max(0, q.findIndex((t) => t.id === track.id));

    setPlayerState((prev) => ({
      ...prev,
      currentTrack: track,
      playing: true,
      position: 0,
      duration: track.duration,
      queue: q,
      index: trackIndex,
    }));

    if (playbackTarget === "phone" || !connected) {
      // Standalone phone playback via expo-av
      const streamUrl = await resolveAudioStream(track.id);
      if (streamUrl) {
        await nativeAudio.play(streamUrl);
      } else {
        Alert.alert("Playback error", "Could not resolve audio stream for this track.");
      }
    } else {
      // Send playback command to FTune Desktop
      sendRemoteAction({
        type: "play-track",
        track,
        queue: q,
      });
    }
  };

  const handleTogglePlay = async () => {
    const nextPlaying = !playerState.playing;
    setPlayerState((prev) => ({ ...prev, playing: nextPlaying }));

    if (playbackTarget === "phone" || !connected) {
      if (nextPlaying) {
        if (!playerState.currentTrack) {
          if (playerState.queue.length > 0) {
            handlePlaySong(playerState.queue[0], playerState.queue, 0);
          }
        } else {
          await nativeAudio.resume();
        }
      } else {
        await nativeAudio.pause();
      }
    } else {
      sendRemoteAction({ type: "toggle" });
    }
  };

  const handleNext = () => {
    if (playbackTarget === "pc" && connected) {
      sendRemoteAction({ type: "next" });
      return;
    }

    const { queue, index } = playerStateRef.current;
    if (queue.length === 0) return;
    const nextIdx = (index + 1) % queue.length;
    const nextTrack = queue[nextIdx];
    if (nextTrack) {
      handlePlaySong(nextTrack, queue, nextIdx);
    }
  };

  const handlePrev = () => {
    if (playbackTarget === "pc" && connected) {
      sendRemoteAction({ type: "prev" });
      return;
    }

    const { queue, index, position } = playerStateRef.current;
    if (position > 3) {
      handleSeek(0);
      return;
    }
    if (queue.length === 0) return;
    const prevIdx = (index - 1 + queue.length) % queue.length;
    const prevTrack = queue[prevIdx];
    if (prevTrack) {
      handlePlaySong(prevTrack, queue, prevIdx);
    }
  };

  const handleSeek = (position: number) => {
    setPlayerState((prev) => ({ ...prev, position }));
    if (playbackTarget === "phone" || !connected) {
      nativeAudio.seek(position);
    } else {
      sendRemoteAction({ type: "seek", position });
    }
  };

  const handleSetVolume = (volume: number) => {
    setPlayerState((prev) => ({ ...prev, volume }));
    if (playbackTarget === "phone" || !connected) {
      nativeAudio.setVolume(volume);
    } else {
      sendRemoteAction({ type: "set-volume", volume });
    }
  };

  const handleToggleShuffle = () => {
    const nextShuffle = !playerState.shuffle;
    setPlayerState((prev) => ({ ...prev, shuffle: nextShuffle }));
    if (playbackTarget === "pc" && connected) {
      sendRemoteAction({ type: "toggle-shuffle" });
    }
  };

  const handleCycleRepeat = () => {
    const modes: ("off" | "all" | "one")[] = ["off", "all", "one"];
    const curIdx = modes.indexOf(playerState.repeat);
    const nextMode = modes[(curIdx + 1) % modes.length];
    setPlayerState((prev) => ({ ...prev, repeat: nextMode }));
    if (playbackTarget === "pc" && connected) {
      sendRemoteAction({ type: "cycle-repeat" });
    }
  };

  const handleJumpToQueue = (index: number) => {
    const track = playerState.queue[index];
    if (!track) return;

    if (playbackTarget === "pc" && connected) {
      sendRemoteAction({ type: "jump-to", index });
    } else {
      handlePlaySong(track, playerState.queue, index);
    }
  };

  const handleToggleFavorite = async (track: Track) => {
    const isNowFav = await toggleOfflineFavorite(track);
    if (isNowFav) {
      setFavorites((prev) => [track, ...prev]);
    } else {
      setFavorites((prev) => prev.filter((t) => t.id !== track.id));
    }
  };

  const handleDeleteDownloaded = async (trackId: string) => {
    await deleteDownloadedTrack(trackId);
    setDownloadedTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const topPadding =
    Platform.OS === "android"
      ? Math.max(insets.top, RNStatusBar.currentHeight || 0, 36)
      : Math.max(insets.top, 20);

  return (
    <View style={[styles.root, { paddingTop: topPadding }]}>
      <StatusBar style="light" />

      {/* Top Header Bar */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <FTuneLogo size={24} color="#ffffff" />
          <Text style={styles.brandName}>FTune</Text>
        </View>

        {/* Dual Mode Switcher (Phone Standalone vs PC Remote) */}
        <View style={styles.modeSwitcher}>
          <TouchableOpacity
            style={[
              styles.targetBtn,
              playbackTarget === "phone" && styles.targetBtnActive,
            ]}
            onPress={() => setPlaybackTarget("phone")}
            activeOpacity={0.8}
          >
            <Smartphone
              size={13}
              color={playbackTarget === "phone" ? "#ffffff" : Colors.textMuted}
            />
            <Text
              style={[
                styles.targetBtnText,
                playbackTarget === "phone" && styles.targetBtnTextActive,
              ]}
            >
              Phone
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.targetBtn,
              playbackTarget === "pc" && styles.targetBtnActive,
            ]}
            onPress={() => {
              if (!connected) {
                setConnectModalVisible(true);
              } else {
                setPlaybackTarget("pc");
              }
            }}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.statusDot,
                connected ? styles.dotGreen : styles.dotOrange,
              ]}
            />
            <Laptop
              size={13}
              color={playbackTarget === "pc" ? "#ffffff" : Colors.textMuted}
            />
            <Text
              style={[
                styles.targetBtnText,
                playbackTarget === "pc" && styles.targetBtnTextActive,
              ]}
            >
              PC
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Tab Content */}
      <View style={styles.contentArea}>
        {/* HOME TAB */}
        {activeTab === "home" && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.homeScrollContent}
          >
            {/* Mode Banner Indicator */}
            <View style={styles.bannerRow}>
              <Text style={styles.bannerText}>
                {playbackTarget === "phone"
                  ? "📱 Solo Phone Mode: Playing directly through your phone"
                  : `💻 Remote Mode: Playing on ${hostname}`}
              </Text>
            </View>

            {/* Quick Picks Header */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Quick Picks</Text>
            </View>

            {/* 2-Column Grid of Quick Tiles */}
            <View style={styles.quickGrid}>
              {INITIAL_QUICK_PICKS.map((track) => (
                <View key={track.id} style={styles.quickCol}>
                  <QuickTile
                    track={track}
                    isPlaying={playerState.currentTrack?.id === track.id && playerState.playing}
                    onPlay={(t) => handlePlaySong(t, INITIAL_QUICK_PICKS)}
                  />
                </View>
              ))}
            </View>

            {/* Trending Shelf */}
            <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
              <Text style={styles.sectionTitle}>Trending on FTune</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shelfScroll}>
              {INITIAL_QUICK_PICKS.slice(0, 5).map((track) => (
                <ShelfCard
                  key={`shelf-${track.id}`}
                  track={track}
                  onPlay={(t) => handlePlaySong(t, INITIAL_QUICK_PICKS)}
                />
              ))}
            </ScrollView>

            {/* Mood Chips */}
            <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
              <Text style={styles.sectionTitle}>Moods & Genres</Text>
            </View>
            <View style={styles.moodsWrap}>
              {["Chill", "Workout", "Focus", "Party", "Pop", "Rock", "Hip-Hop", "Acoustic"].map((mood) => (
                <TouchableOpacity
                  key={mood}
                  style={styles.moodChip}
                  onPress={() => {
                    handleQueryChange(mood);
                  }}
                >
                  <Text style={styles.moodChipText}>{mood}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* SEARCH TAB */}
        {activeTab === "search" && (
          <View style={styles.searchContainer}>
            {/* Search Input Bar */}
            <View style={styles.searchBar}>
              <Search size={18} color={Colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search songs, artists, albums..."
                placeholderTextColor={Colors.textMuted}
                value={query}
                onChangeText={handleQueryChange}
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => handleQueryChange("")} style={styles.clearBtn}>
                  <X size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Chips Bar */}
            <View style={styles.filterSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
              >
                {FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.chip, activeFilter === f.id && styles.activeChip]}
                    onPress={() => handleFilterChange(f.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        activeFilter === f.id && styles.activeChipText,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Results List */}
            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.loadingText}>Searching YouTube Music...</Text>
              </View>
            ) : results.length > 0 ? (
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <SongRow
                    track={item}
                    isPlaying={playerState.currentTrack?.id === item.id && playerState.playing}
                    isCurrent={playerState.currentTrack?.id === item.id}
                    isFavorite={favorites.some((f) => f.id === item.id)}
                    onPlay={(t) => handlePlaySong(t, results)}
                    onToggleFavorite={handleToggleFavorite}
                  />
                )}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            ) : (
              <View style={styles.centerState}>
                <Sparkles size={40} color={Colors.borderLight} />
                <Text style={styles.emptyTitle}>Search for anything</Text>
                <Text style={styles.emptySubtitle}>
                  Type a song or artist above to stream instantly or play on your PC!
                </Text>
              </View>
            )}
          </View>
        )}

        {/* LIBRARY / PLAYLISTS TAB */}
        {activeTab === "library" && (
          selectedPlaylist ? (
            <PlaylistDetailView
              playlist={selectedPlaylist}
              currentTrackId={playerState.currentTrack?.id}
              isPlaying={playerState.playing}
              onBack={() => setSelectedPlaylist(null)}
              onPlaySong={(t, q) => handlePlaySong(t, q)}
              onPlayAll={(tracks) => {
                if (tracks.length > 0) handlePlaySong(tracks[0], tracks, 0);
              }}
              onToggleFavorite={handleToggleFavorite}
            />
          ) : (
            <View style={styles.queueContainer}>
              {/* Library Subtabs */}
              <View style={styles.subtabRow}>
                <TouchableOpacity
                  style={[
                    styles.subtabBtn,
                    librarySubTab === "playlists" && styles.subtabBtnActive,
                  ]}
                  onPress={() => setLibrarySubTab("playlists")}
                >
                  <Text
                    style={[
                      styles.subtabText,
                      librarySubTab === "playlists" && styles.subtabTextActive,
                    ]}
                  >
                    PC Playlists ({pcPlaylists.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.subtabBtn,
                    librarySubTab === "liked" && styles.subtabBtnActive,
                  ]}
                  onPress={() => setLibrarySubTab("liked")}
                >
                  <Text
                    style={[
                      styles.subtabText,
                      librarySubTab === "liked" && styles.subtabTextActive,
                    ]}
                  >
                    Liked ({favorites.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.subtabBtn,
                    librarySubTab === "queue" && styles.subtabBtnActive,
                  ]}
                  onPress={() => setLibrarySubTab("queue")}
                >
                  <Text
                    style={[
                      styles.subtabText,
                      librarySubTab === "queue" && styles.subtabTextActive,
                    ]}
                  >
                    Queue ({playerState.queue.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* PC Playlists Section */}
              {librarySubTab === "playlists" && (
                pcPlaylists.length > 0 ? (
                  <FlatList
                    data={pcPlaylists}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => {
                      const firstArt = item.tracks?.[0]?.thumb || "";
                      return (
                        <TouchableOpacity
                          style={styles.playlistRow}
                          activeOpacity={0.7}
                          onPress={() => setSelectedPlaylist(item)}
                        >
                          <View style={styles.playlistThumbWrapper}>
                            {firstArt ? (
                              <Image source={{ uri: firstArt }} style={styles.playlistThumb} />
                            ) : (
                              <ListMusic size={22} color={Colors.textMuted} />
                            )}
                          </View>
                          <View style={styles.playlistInfo}>
                            <Text style={styles.playlistTitle} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.playlistMeta}>
                              Playlist • {item.tracks?.length || 0} songs
                            </Text>
                          </View>
                          <ChevronRight size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                      );
                    }}
                    contentContainerStyle={{ paddingBottom: 20 }}
                  />
                ) : (
                  <View style={styles.centerState}>
                    <ListMusic size={44} color={Colors.borderLight} />
                    <Text style={styles.emptyTitle}>No PC playlists found</Text>
                    <Text style={styles.emptySubtitle}>
                      {connected
                        ? "Create playlists in FTune on your PC and they will appear here automatically."
                        : "Connect to FTune on your PC to view and play all your computer's playlists."}
                    </Text>
                  </View>
                )
              )}

              {/* Liked Songs Subtab */}
              {librarySubTab === "liked" && (
                favorites.length > 0 ? (
                  <FlatList
                    data={favorites}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <SongRow
                        track={item}
                        isPlaying={playerState.currentTrack?.id === item.id && playerState.playing}
                        isCurrent={playerState.currentTrack?.id === item.id}
                        isFavorite={true}
                        onPlay={(t) => handlePlaySong(t, favorites)}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    )}
                    contentContainerStyle={{ paddingBottom: 20 }}
                  />
                ) : (
                  <View style={styles.centerState}>
                    <Heart size={44} color={Colors.borderLight} />
                    <Text style={styles.emptyTitle}>No liked songs yet</Text>
                    <Text style={styles.emptySubtitle}>
                      Tap the heart icon on any track to save it to your liked songs.
                    </Text>
                  </View>
                )
              )}

              {/* Queue Subtab */}
              {librarySubTab === "queue" && (
                playerState.queue.length > 0 ? (
                  <FlatList
                    data={playerState.queue}
                    keyExtractor={(item, index) => `${item.id}-${index}`}
                    renderItem={({ item, index }) => (
                      <SongRow
                        track={item}
                        isPlaying={index === playerState.index && playerState.playing}
                        isCurrent={index === playerState.index}
                        isFavorite={favorites.some((f) => f.id === item.id)}
                        onPlay={(t) => handleJumpToQueue(index)}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    )}
                    contentContainerStyle={{ paddingBottom: 20 }}
                  />
                ) : (
                  <View style={styles.centerState}>
                    <Disc3 size={44} color={Colors.borderLight} />
                    <Text style={styles.emptyTitle}>Queue is empty</Text>
                    <Text style={styles.emptySubtitle}>
                      Play any song from Home, Search or Playlists to start your queue.
                    </Text>
                  </View>
                )
              )}
            </View>
          )
        )}

        {/* OFFLINE DOWNLOADS TAB */}
        {activeTab === "offline" && (
          <View style={styles.queueContainer}>
            <View style={styles.offlineHeader}>
              <View>
                <Text style={styles.offlineTitle}>Downloaded Music</Text>
                <Text style={styles.offlineSubtitle}>
                  {downloadedTracks.length} songs available offline
                </Text>
              </View>
            </View>

            {downloadedTracks.length > 0 ? (
              <FlatList
                data={downloadedTracks}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.downloadRowWrapper}>
                    <View style={{ flex: 1 }}>
                      <SongRow
                        track={item}
                        isPlaying={playerState.currentTrack?.id === item.id && playerState.playing}
                        isCurrent={playerState.currentTrack?.id === item.id}
                        isFavorite={favorites.some((f) => f.id === item.id)}
                        onPlay={(t) => handlePlaySong(t, downloadedTracks)}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.deleteDlBtn}
                      onPress={() => handleDeleteDownloaded(item.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            ) : (
              <View style={styles.centerState}>
                <Download size={44} color={Colors.borderLight} />
                <Text style={styles.emptyTitle}>No offline songs yet</Text>
                <Text style={styles.emptySubtitle}>
                  Tap the download icon on any song or playlist to save it right on your phone for offline playback.
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Floating Bottom Mini Player */}
      <MiniPlayer
        playerState={playerState}
        onTogglePlay={handleTogglePlay}
        onNext={handleNext}
        onPrev={handlePrev}
        onPress={() => setFullPlayerVisible(true)}
      />

      {/* 4-Tab Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setSelectedPlaylist(null);
          setActiveTab(tab);
        }}
        bottomInset={insets.bottom}
      />

      {/* Expanded Full Screen Player Modal with Draggable Scrubber */}
      <FullPlayer
        visible={fullPlayerVisible}
        playerState={playerState}
        playbackTarget={playbackTarget}
        serverHostname={
          playbackTarget === "phone"
            ? "This Phone"
            : `${hostname}`
        }
        isFavorite={
          !!playerState.currentTrack &&
          favorites.some((f) => f.id === playerState.currentTrack?.id)
        }
        onClose={() => setFullPlayerVisible(false)}
        onTogglePlay={handleTogglePlay}
        onNext={handleNext}
        onPrev={handlePrev}
        onSeek={handleSeek}
        onSetVolume={handleSetVolume}
        onToggleShuffle={handleToggleShuffle}
        onCycleRepeat={handleCycleRepeat}
        onToggleFavorite={handleToggleFavorite}
        onJumpToQueue={handleJumpToQueue}
      />

      {/* PC Connection Modal */}
      <ConnectModal
        visible={connectModalVisible}
        onClose={() => setConnectModalVisible(false)}
        onConnected={(host) => {
          setHostname(host);
          setConnected(true);
          setPlaybackTarget("pc");
          fetchPCLibrary().then((lib) => {
            if (lib?.playlists) setPcPlaylists(lib.playlists);
          });
        }}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandName: {
    fontSize: 19,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  modeSwitcher: {
    flexDirection: "row",
    backgroundColor: "#16161c",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 2,
  },
  targetBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 5,
  },
  targetBtnActive: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  targetBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  targetBtnTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotGreen: {
    backgroundColor: Colors.success,
  },
  dotOrange: {
    backgroundColor: "#f59e0b",
  },
  contentArea: {
    flex: 1,
  },
  homeScrollContent: {
    paddingBottom: 24,
  },
  bannerRow: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  bannerText: {
    fontSize: 11.5,
    fontWeight: "500",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
  },
  quickCol: {
    width: "50%",
  },
  shelfScroll: {
    paddingLeft: 16,
  },
  moodsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
  },
  moodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  moodChipText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#ffffff",
  },
  searchContainer: {
    flex: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16161c",
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
  },
  clearBtn: {
    padding: 4,
  },
  filterSection: {
    marginBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  activeChip: {
    backgroundColor: "#ffffff",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  activeChipText: {
    color: "#000000",
    fontWeight: "700",
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  queueContainer: {
    flex: 1,
  },
  subtabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 8,
  },
  subtabBtn: {
    paddingVertical: 10,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  subtabBtnActive: {
    borderBottomColor: "#ffffff",
  },
  subtabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  subtabTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  playlistThumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#1a1a22",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  playlistThumb: {
    width: "100%",
    height: "100%",
  },
  playlistInfo: {
    flex: 1,
    marginLeft: 12,
  },
  playlistTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 3,
  },
  playlistMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  offlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  offlineTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  offlineSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  downloadRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
  },
  deleteDlBtn: {
    padding: 8,
  },
});
