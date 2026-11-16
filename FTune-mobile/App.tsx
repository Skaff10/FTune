import React, { useEffect, useState, useRef } from "react";
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
  Sparkles,
  Disc3,
  Heart,
  Download,
  ListMusic,
  ChevronRight,
  Trash2,
  SlidersHorizontal,
  Link2,
  User,
} from "lucide-react-native";
import { Colors } from "./src/theme/colors";
import type {
  PCPlaylist,
  RemoteLibraryState,
  RemotePlayerState,
  SearchFilter,
  Track,
  SpotifyStatus,
  CloudSyncStatus,
} from "./src/types";
import {
  initServerAddress,
  searchMusic,
  sendRemoteAction,
  connectWebSocket,
  autoDiscover,
  fetchPCLibrary,
} from "./src/services/api";
import { nativeAudio } from "./src/services/nativeAudio";
import { resolveAudioStream } from "./src/services/streamResolver";
import {
  getDownloadedTracks,
  subscribeDownloads,
  deleteDownloadedTrack,
} from "./src/services/downloadManager";
import { spotifyService } from "./src/services/spotify";
import { SongRow } from "./src/components/SongRow";
import { MiniPlayer } from "./src/components/MiniPlayer";
import { FullPlayer } from "./src/components/FullPlayer";
import { ConnectModal } from "./src/components/ConnectModal";
import { BottomNavBar, type TabKey } from "./src/components/BottomNavBar";
import { QuickTile } from "./src/components/QuickTile";
import { ShelfCard } from "./src/components/ShelfCard";
import { PlaylistDetailView } from "./src/components/PlaylistDetailView";
import { SpotifyLoginModal } from "./src/components/SpotifyLoginModal";
import { AccountModal } from "./src/components/AccountModal";
import { SpotifyIcon, SPOTIFY_GREEN } from "./src/components/SpotifyIcon";
import { FTuneLogo } from "./src/components/FTuneLogo";
import { cloudAccountService } from "./src/services/cloudAccount";
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

  // Playback Target: "phone" (native audio) or "pc" (controls FTune Desktop)
  const [playbackTarget, setPlaybackTarget] = useState<"phone" | "pc">("phone");

  // Offline Favorites & Downloaded Tracks
  const [favorites, setFavorites] = useState<Track[]>(INITIAL_QUICK_PICKS.slice(0, 4));
  const [downloadedTracks, setDownloadedTracks] = useState<Track[]>([]);

  // Library Playlists (Borrowed Spotify Playlists + PC Playlists)
  const [borrowedPlaylists, setBorrowedPlaylists] = useState<PCPlaylist[]>([]);
  const [pcPlaylists, setPcPlaylists] = useState<PCPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PCPlaylist | null>(null);

  // Discreet Library Fetch drawer & modal state
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus>({ connected: false });
  const [libraryFetchExpanded, setLibraryFetchExpanded] = useState(false);
  const [spotifyModalVisible, setSpotifyModalVisible] = useState(false);
  const [spotifyModalInitialTab, setSpotifyModalInitialTab] = useState<"login" | "link" | "pc">(
    "login"
  );

  // Library subtab (Playlists, Liked, Offline, Queue)
  const [librarySubTab, setLibrarySubTab] = useState<
    "playlists" | "liked" | "offline" | "queue"
  >("playlists");

  // Modals
  const [connectModalVisible, setConnectModalVisible] = useState(false);
  const [fullPlayerVisible, setFullPlayerVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(
    cloudAccountService.getStatus()
  );

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

  // Subscribe to Spotify service, borrowed playlists, and Cloud Account sync
  useEffect(() => {
    const unsubSpotify = spotifyService.subscribe((status) => {
      setSpotifyStatus(status);
      setBorrowedPlaylists([...spotifyService.getBorrowedPlaylists()]);
    });

    const unsubCloud = cloudAccountService.subscribe((st) => {
      setCloudSyncStatus(st);
    });

    cloudAccountService.onLibraryRestored = ({ playlists, favorites: restoredFavs }) => {
      setBorrowedPlaylists([...playlists]);
      setFavorites([...restoredFavs]);
    };

    return () => {
      unsubSpotify();
      unsubCloud();
      cloudAccountService.onLibraryRestored = null;
    };
  }, []);

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
          spotifyService.refreshPlaylists();
        }
      });

      cleanupWs = connectWebSocket(
        (newState) => {
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
            spotifyService.refreshPlaylists();
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
      // Standalone phone playback via expo-audio (resolves sp_... tracks automatically)
      const streamUrl = await resolveAudioStream(track.id, track);
      if (streamUrl) {
        await nativeAudio.play(streamUrl);
      } else {
        Alert.alert("Playback error", "Could not resolve audio stream for this track.");
      }
    } else {
      // Send playback command to FTune Desktop (resolve sp_... track first if borrowed)
      const resolvedTrack = await spotifyService.resolvePlayableTrack(track);
      sendRemoteAction({
        type: "play-track",
        track: resolvedTrack,
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
    cloudAccountService.scheduleSync();
  };

  const handleDeleteDownloaded = async (trackId: string) => {
    await deleteDownloadedTrack(trackId);
    setDownloadedTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const handleDeleteBorrowedPlaylist = (playlist: PCPlaylist) => {
    Alert.alert(
      "Remove Playlist",
      `Remove "${playlist.name}" from your Library?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const updated = await spotifyService.removeBorrowedPlaylist(playlist.id);
            setBorrowedPlaylists([...updated]);
          },
        },
      ]
    );
  };

  const allPlaylists: PCPlaylist[] = [...borrowedPlaylists, ...pcPlaylists];

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
          <FTuneLogo size={24} color={Colors.inkHi} />
          <Text style={styles.brandName}>FTune</Text>
        </View>

        {/* Right Side: Dual Mode Switcher + Google Account Avatar */}
        <View style={styles.headerRightRow}>
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
                color={playbackTarget === "phone" ? Colors.inkHi : Colors.inkDim}
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
                color={playbackTarget === "pc" ? Colors.inkHi : Colors.inkDim}
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

          {/* Cloud Account Avatar Button */}
          <TouchableOpacity
            style={styles.accountAvatarBtn}
            activeOpacity={0.75}
            onPress={() => setAccountModalVisible(true)}
          >
            {cloudSyncStatus.signedIn && cloudSyncStatus.user ? (
              <View style={styles.accountAvatarWrap}>
                <View style={styles.accountAvatarInitialBox}>
                  <Text style={styles.accountAvatarInitialText}>
                    {(cloudSyncStatus.user.username || "U")[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.accountSyncDot} />
              </View>
            ) : (
              <View style={styles.accountSignInPill}>
                <User size={14} color={Colors.inkHi} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Tab Content */}
      <View style={styles.contentArea}>
        {/* 1. HOME TAB */}
        {activeTab === "home" && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.homeScrollContent}
          >
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
              {["Chill", "Workout", "Focus", "Party", "Pop", "Rock", "Hip-Hop", "Acoustic"].map(
                (mood) => (
                  <TouchableOpacity
                    key={mood}
                    style={styles.moodChip}
                    onPress={() => {
                      handleQueryChange(mood);
                    }}
                  >
                    <Text style={styles.moodChipText}>{mood}</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </ScrollView>
        )}

        {/* 2. SEARCH TAB */}
        {activeTab === "search" && (
          <View style={styles.searchContainer}>
            {/* Search Input Bar */}
            <View style={styles.searchBar}>
              <Search size={18} color={Colors.inkDim} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search songs, artists, albums..."
                placeholderTextColor={Colors.inkDim}
                value={query}
                onChangeText={handleQueryChange}
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => handleQueryChange("")} style={styles.clearBtn}>
                  <X size={16} color={Colors.inkHi} />
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
                <ActivityIndicator size="large" color={Colors.inkHi} />
                <Text style={styles.loadingText}>Searching YouTube Music...</Text>
              </View>
            ) : results.length > 0 ? (
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
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

        {/* 3. LIBRARY TAB (Playlists, Liked, Offline, Queue + Discreet Library Fetch) */}
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
              isFavorite={(id) => favorites.some((f) => f.id === id)}
            />
          ) : (
            <View style={styles.queueContainer}>
              {/* Library Subtabs Row + Discreet Tucked-Away Fetch Toggle */}
              <View style={styles.subtabRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subtabScroll}
                >
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
                      Playlists ({allPlaylists.length})
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
                      librarySubTab === "offline" && styles.subtabBtnActive,
                    ]}
                    onPress={() => setLibrarySubTab("offline")}
                  >
                    <Text
                      style={[
                        styles.subtabText,
                        librarySubTab === "offline" && styles.subtabTextActive,
                      ]}
                    >
                      Offline ({downloadedTracks.length})
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
                </ScrollView>

                {/* Tucked-away discreet Library Fetch icon button */}
                <TouchableOpacity
                  style={[
                    styles.discreetFetchBtn,
                    libraryFetchExpanded && styles.discreetFetchBtnActive,
                  ]}
                  onPress={() => setLibraryFetchExpanded((prev) => !prev)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <SlidersHorizontal
                    size={15}
                    color={libraryFetchExpanded ? Colors.inkHi : Colors.inkGhost}
                  />
                </TouchableOpacity>
              </View>

              {/* Collapsible Tucked-Away Library Fetch Drawer */}
              {libraryFetchExpanded && (
                <View style={styles.hiddenFetchDrawer}>
                  <View style={styles.hiddenFetchActions}>
                    <TouchableOpacity
                      style={styles.hiddenFetchOption}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSpotifyModalInitialTab("login");
                        setSpotifyModalVisible(true);
                      }}
                    >
                      <SpotifyIcon size={16} />
                      <Text style={styles.hiddenFetchOptionText}>Fetch Spotify Playlist</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.hiddenFetchOption}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSpotifyModalInitialTab("link");
                        setSpotifyModalVisible(true);
                      }}
                    >
                      <Link2 size={15} color={SPOTIFY_GREEN} />
                      <Text style={styles.hiddenFetchOptionText}>Import Spotify Playlist</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* 3A. Playlists Subtab (Borrowed Spotify Playlists + PC Playlists) */}
              {librarySubTab === "playlists" && (
                allPlaylists.length > 0 ? (
                  <FlatList
                    data={allPlaylists}
                    keyExtractor={(item) => item.id}
                    initialNumToRender={12}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews={true}
                    renderItem={({ item }) => {
                      const coverArt = item.thumb || item.tracks?.[0]?.thumb || "";
                      const isBorrowed = item.source === "spotify";
                      return (
                        <TouchableOpacity
                          style={styles.playlistRow}
                          activeOpacity={0.7}
                          onPress={() => setSelectedPlaylist(item)}
                        >
                          <View style={styles.playlistThumbWrapper}>
                            {coverArt ? (
                              <Image source={{ uri: coverArt }} style={styles.playlistThumb} />
                            ) : (
                              <ListMusic size={22} color={Colors.inkDim} />
                            )}
                          </View>
                          <View style={styles.playlistInfo}>
                            <Text style={styles.playlistTitle} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.playlistMeta} numberOfLines={1}>
                              {item.tracks?.length || 0} songs
                            </Text>
                          </View>

                          {isBorrowed && (
                            <TouchableOpacity
                              style={styles.deleteDlBtn}
                              onPress={() => handleDeleteBorrowedPlaylist(item)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Trash2 size={15} color={Colors.inkGhost} />
                            </TouchableOpacity>
                          )}

                          <ChevronRight size={18} color={Colors.inkDim} />
                        </TouchableOpacity>
                      );
                    }}
                    contentContainerStyle={{ paddingBottom: 20 }}
                  />
                ) : (
                  <View style={styles.centerState}>
                    <ListMusic size={44} color={Colors.borderLight} />
                    <Text style={styles.emptyTitle}>No playlists in Library yet</Text>
                    <Text style={styles.emptySubtitle}>
                      Tap the tune icon in the top-right corner of Library to borrow your playlists or import a link.
                    </Text>
                  </View>
                )
              )}

              {/* 3B. Liked Songs Subtab */}
              {librarySubTab === "liked" && (
                favorites.length > 0 ? (
                  <FlatList
                    data={favorites}
                    keyExtractor={(item) => item.id}
                    initialNumToRender={12}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews={true}
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
                      Tap the heart icon on any track or borrow your Liked Songs from Library Fetch.
                    </Text>
                  </View>
                )
              )}

              {/* 3C. Offline Downloads Subtab (Moved inside Library!) */}
              {librarySubTab === "offline" && (
                downloadedTracks.length > 0 ? (
                  <FlatList
                    data={downloadedTracks}
                    keyExtractor={(item) => item.id}
                    initialNumToRender={12}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews={true}
                    renderItem={({ item }) => (
                      <View style={styles.downloadRowWrapper}>
                        <View style={{ flex: 1 }}>
                          <SongRow
                            track={item}
                            isPlaying={
                              playerState.currentTrack?.id === item.id && playerState.playing
                            }
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
                          <Trash2 size={16} color={Colors.inkDim} />
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
                )
              )}

              {/* 3D. Queue Subtab */}
              {librarySubTab === "queue" && (
                playerState.queue.length > 0 ? (
                  <FlatList
                    data={playerState.queue}
                    keyExtractor={(item, index) => `${item.id}-${index}`}
                    initialNumToRender={12}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews={true}
                    renderItem={({ item, index }) => (
                      <SongRow
                        track={item}
                        isPlaying={index === playerState.index && playerState.playing}
                        isCurrent={index === playerState.index}
                        isFavorite={favorites.some((f) => f.id === item.id)}
                        onPlay={() => handleJumpToQueue(index)}
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
                      Play any song from Home, Search or Library to start your queue.
                    </Text>
                  </View>
                )
              )}
            </View>
          )
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

      {/* 3-Tab Bottom Navigation Bar (Home, Search, Library) */}
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
        serverHostname={playbackTarget === "phone" ? "This Phone" : `${hostname}`}
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
          spotifyService.refreshPlaylists();
        }}
      />

      {/* Library Fetch: In-App Spotify Login, Playlist/Liked Borrow Picker & Import Link Modal */}
      <SpotifyLoginModal
        visible={spotifyModalVisible}
        initialTab={spotifyModalInitialTab}
        onClose={() => setSpotifyModalVisible(false)}
        onSuccess={async (res) => {
          setSpotifyStatus(spotifyService.getStatus());
          setBorrowedPlaylists([...spotifyService.getBorrowedPlaylists()]);
          if (res?.likedTracks && res.likedTracks.length > 0) {
            setFavorites(res.likedTracks);
          } else {
            const favs = await getOfflineFavorites();
            if (favs.length > 0) setFavorites(favs);
          }
          setActiveTab("library");
          setLibrarySubTab("playlists");
          if (res?.openPlaylist) {
            setSelectedPlaylist(res.openPlaylist);
          }
          cloudAccountService.scheduleSync();
        }}
      />

      {/* Cloud Account Modal */}
      <AccountModal
        visible={accountModalVisible}
        onClose={() => setAccountModalVisible(false)}
        onSyncComplete={({ playlists, favorites: syncedFavs }) => {
          setBorrowedPlaylists([...playlists]);
          setFavorites([...syncedFavs]);
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
    backgroundColor: Colors.base,
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
    fontSize: 20,
    fontWeight: "800",
    color: Colors.inkHi,
    letterSpacing: -0.5,
  },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  accountAvatarBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  accountAvatarWrap: {
    position: "relative",
    width: 30,
    height: 30,
  },
  accountAvatarImg: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  accountAvatarInitialBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.inkHi,
    alignItems: "center",
    justifyContent: "center",
  },
  accountAvatarInitialText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#000000",
  },
  accountSyncDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: Colors.success,
    borderWidth: 1.5,
    borderColor: Colors.base,
  },
  accountSignInPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  modeSwitcher: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
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
    color: Colors.inkDim,
  },
  targetBtnTextActive: {
    color: Colors.inkHi,
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
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  bannerText: {
    fontSize: 11.5,
    fontWeight: "500",
    color: Colors.inkDim,
    textAlign: "center",
  },
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.inkHi,
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
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  moodChipText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: Colors.inkHi,
  },
  searchContainer: {
    flex: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.panel,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.inkHi,
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
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  activeChip: {
    backgroundColor: Colors.inkHi,
    borderColor: Colors.inkHi,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.inkDim,
  },
  activeChipText: {
    color: Colors.onPrimary,
    fontWeight: "700",
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    color: Colors.inkDim,
    fontSize: 13,
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.inkHi,
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.inkDim,
    textAlign: "center",
    lineHeight: 18,
  },
  queueContainer: {
    flex: 1,
  },
  subtabRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.hairline,
    marginBottom: 4,
  },
  subtabScroll: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  subtabBtn: {
    paddingVertical: 10,
    marginRight: 18,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  subtabBtnActive: {
    borderBottomColor: Colors.inkHi,
  },
  subtabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.inkDim,
  },
  subtabTextActive: {
    color: Colors.inkHi,
    fontWeight: "700",
  },
  discreetFetchBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    marginLeft: 4,
  },
  discreetFetchBtnActive: {
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  hiddenFetchDrawer: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  hiddenFetchActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hiddenFetchOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  hiddenFetchOptionText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.inkHi,
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  playlistThumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.panel,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.artworkBorder,
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
    color: Colors.inkHi,
    marginBottom: 3,
  },
  playlistMeta: {
    fontSize: 12,
    color: Colors.inkDim,
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
