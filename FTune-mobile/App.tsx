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
  AppState,
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
  fetchPCPlayerState,
  pingServer,
  getServerUrl,
  requestPCSync,
  reconnectWebSocket,
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
import { CoverGlow } from "./src/components/CoverGlow";
import { SpotifyIcon } from "./src/components/SpotifyIcon";
import { FTuneLogo } from "./src/components/FTuneLogo";
import { cloudAccountService } from "./src/services/cloudAccount";
import {
  getOfflineFavorites,
  toggleOfflineFavorite,
  saveRecentTrack,
  getRecentTracks,
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

const EMPTY_PLAYER_STATE: RemotePlayerState = {
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
};

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

  // Separate authoritative states so Phone & PC never clobber each other
  const [phoneState, setPhoneState] = useState<RemotePlayerState>(EMPTY_PLAYER_STATE);
  const [pcState, setPcState] = useState<RemotePlayerState>(EMPTY_PLAYER_STATE);

  // Offline Favorites, Recents & Downloaded Tracks
  const [favorites, setFavorites] = useState<Track[]>(INITIAL_QUICK_PICKS.slice(0, 4));
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
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

  const searchDebounce = useRef<any>(null);
  const playbackTargetRef = useRef<"phone" | "pc">("phone");
  const connectedRef = useRef(false);
  const phoneStateRef = useRef<RemotePlayerState>(EMPTY_PLAYER_STATE);
  const pcStateRef = useRef<RemotePlayerState>(EMPTY_PLAYER_STATE);
  const phoneOpTokenRef = useRef(0);
  const pendingSwitchToPcRef = useRef(false);
  const pcHandoffPendingRef = useRef(false);
  const onTrackEndedHandlerRef = useRef<() => void>(() => {});
  const onNextTrackHandlerRef = useRef<() => void>(() => {});
  const onPrevTrackHandlerRef = useRef<() => void>(() => {});

  const updatePhoneState = (
    updater:
      | RemotePlayerState
      | ((prev: RemotePlayerState) => RemotePlayerState)
  ) => {
    const next =
      typeof updater === "function" ? updater(phoneStateRef.current) : updater;
    phoneStateRef.current = next;
    setPhoneState(next);
  };

  const updatePcState = (
    updater:
      | RemotePlayerState
      | ((prev: RemotePlayerState) => RemotePlayerState)
  ) => {
    const next =
      typeof updater === "function" ? updater(pcStateRef.current) : updater;
    pcStateRef.current = next;
    setPcState(next);
  };

  const updatePlaybackTarget = (target: "phone" | "pc") => {
    playbackTargetRef.current = target;
    setPlaybackTarget(target);
  };

  const playerState = playbackTarget === "pc" ? pcState : phoneState;

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

  // Play a track directly on the phone via nativeAudio (cancellation-safe)
  const playOnPhone = async (
    track: Track,
    queue: Track[],
    startIndex: number,
    startPosition = 0
  ) => {
    const token = ++phoneOpTokenRef.current;

    // Pause previous playback immediately without destroying the media notification session
    nativeAudio.prepareForTrack(track);

    updatePhoneState((prev) => ({
      ...prev,
      currentTrack: track,
      playing: true,
      position: Math.max(0, startPosition || 0),
      duration: track.duration || prev.duration || 0,
      queue,
      index: startIndex,
    }));

    const streamUrl = await resolveAudioStream(track.id, track);

    // Abort if user paused, switched tracks, or switched to PC while resolving
    if (token !== phoneOpTokenRef.current || playbackTargetRef.current !== "phone") {
      return;
    }

    if (!streamUrl) {
      updatePhoneState((prev) => ({ ...prev, playing: false }));
      Alert.alert("Playback error", "Could not resolve audio stream for this track.");
      return;
    }

    const ok = await nativeAudio.play(
      streamUrl,
      startPosition,
      phoneStateRef.current.volume,
      track
    );

    if (token !== phoneOpTokenRef.current || playbackTargetRef.current !== "phone") {
      if (playbackTargetRef.current !== "phone") {
        nativeAudio.stop();
      } else {
        nativeAudio.pause();
      }
      return;
    }

    if (!ok) {
      updatePhoneState((prev) => ({ ...prev, playing: false }));
    }
  };

  // Fresh track-end handler (always sees current queue/repeat/shuffle refs)
  onTrackEndedHandlerRef.current = () => {
    if (playbackTargetRef.current !== "phone") return;
    const { queue, index, repeat, shuffle, currentTrack } = phoneStateRef.current;
    if (queue.length === 0) {
      updatePhoneState((prev) => ({ ...prev, playing: false, position: 0 }));
      return;
    }
    if (repeat === "one" && currentTrack) {
      void playOnPhone(currentTrack, queue, index, 0);
      return;
    }
    if (shuffle && queue.length > 1) {
      let nextIdx = Math.floor(Math.random() * queue.length);
      if (nextIdx === index) nextIdx = (index + 1) % queue.length;
      const nextTrack = queue[nextIdx];
      if (nextTrack) {
        void playOnPhone(nextTrack, queue, nextIdx, 0);
      }
      return;
    }
    if (index + 1 < queue.length) {
      const nextIdx = index + 1;
      const nextTrack = queue[nextIdx];
      if (nextTrack) {
        void playOnPhone(nextTrack, queue, nextIdx, 0);
      }
      return;
    }
    if (repeat === "all") {
      const first = queue[0];
      if (first) {
        void playOnPhone(first, queue, 0, 0);
      }
      return;
    }
    updatePhoneState((prev) => ({ ...prev, playing: false, position: 0 }));
  };

  // Wire up Native Audio engine listeners for standalone Phone playback
  useEffect(() => {
    nativeAudio.onStateChange = (isPlaying) => {
      if (playbackTargetRef.current === "phone") {
        updatePhoneState((prev) =>
          prev.playing === isPlaying ? prev : { ...prev, playing: isPlaying }
        );
      }
    };

    nativeAudio.onTimeUpdate = (posSec, durSec) => {
      if (playbackTargetRef.current === "phone") {
        updatePhoneState((prev) => ({
          ...prev,
          position: posSec,
          duration: durSec > 0 ? durSec : prev.duration,
        }));
      }
    };

    nativeAudio.onTrackEnded = () => {
      onTrackEndedHandlerRef.current();
    };

    nativeAudio.onNextTrack = () => {
      onNextTrackHandlerRef.current();
    };

    nativeAudio.onPrevTrack = () => {
      onPrevTrackHandlerRef.current();
    };

    nativeAudio.onError = () => {
      if (playbackTargetRef.current === "phone") {
        updatePhoneState((prev) => ({ ...prev, playing: false }));
      }
    };

    return () => {
      nativeAudio.onStateChange = null;
      nativeAudio.onTimeUpdate = null;
      nativeAudio.onTrackEnded = null;
      nativeAudio.onNextTrack = null;
      nativeAudio.onPrevTrack = null;
      nativeAudio.onError = null;
    };
  }, []);

  // Smooth position progression on PC mode between state pushes
  useEffect(() => {
    if (playbackTarget === "pc" && pcState.playing) {
      const interval = setInterval(() => {
        updatePcState((prev) => {
          if (!prev.playing || prev.position >= prev.duration) return prev;
          return { ...prev, position: prev.position + 1 };
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [playbackTarget, pcState.playing, pcState.duration]);

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

  // Initialize storage, offline downloads, favorites, recents, and PC connection
  useEffect(() => {
    let cleanupWs: (() => void) | null = null;
    let unsubDls: (() => void) | null = null;

    const init = async () => {
      await initServerAddress();

      const [savedFavs, savedRecents, dls] = await Promise.all([
        getOfflineFavorites(),
        getRecentTracks(),
        getDownloadedTracks(),
      ]);

      if (savedFavs && savedFavs.length > 0) {
        setFavorites(savedFavs);
      }
      if (savedRecents && savedRecents.length > 0) {
        setRecentTracks(savedRecents);
      }
      setDownloadedTracks(dls);

      unsubDls = subscribeDownloads((tracks) => {
        setDownloadedTracks(tracks);
      });

      cleanupWs = connectWebSocket(
        (newState) => {
          // Ignore stale PC snapshots while a handoff from Phone -> PC is in flight
          if (pcHandoffPendingRef.current) return;
          // Always mirror PC state cleanly into pcState only (never overwrites phoneState)
          updatePcState((prev) => ({ ...prev, ...newState }));
        },
        (isConnected) => {
          connectedRef.current = isConnected;
          setConnected(isConnected);
          if (isConnected) {
            const url = getServerUrl();
            if (url) {
              pingServer(url, 1200).then((info) => {
                if (info?.hostname) setHostname(info.hostname);
              });
            }
            fetchPCLibrary().then((lib) => {
              if (lib?.playlists) setPcPlaylists(lib.playlists);
            });
            fetchPCPlayerState().then((st) => {
              if (st) updatePcState((prev) => ({ ...prev, ...st }));
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

      // Auto-scan local Wi-Fi silently in background without hijacking Phone playback
      autoDiscover().then((found) => {
        if (found) {
          pingServer(found, 1200).then((info) => {
            if (info?.hostname) setHostname(info.hostname);
          });
          fetchPCLibrary().then((lib) => {
            if (lib?.playlists) setPcPlaylists(lib.playlists);
          });
          fetchPCPlayerState().then((st) => {
            if (st) updatePcState((prev) => ({ ...prev, ...st }));
          });
          spotifyService.refreshPlaylists();
        }
      });
    };

    init();

    const appStateSub = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        if (!connectedRef.current) {
          void autoDiscover();
        } else if (playbackTargetRef.current === "pc") {
          requestPCSync();
        }
      }
    });

    return () => {
      appStateSub.remove();
      if (unsubDls) unsubDls();
      if (cleanupWs) cleanupWs();
    };
  }, []);

  // Switch cleanly from Phone -> PC: stop phone audio and run track on PC
  const switchToPC = async () => {
    if (!connectedRef.current) {
      const savedUrl = getServerUrl();
      if (savedUrl) {
        const info = await pingServer(savedUrl, 450);
        if (info) {
          if (info.hostname) setHostname(info.hostname);
          connectedRef.current = true;
          setConnected(true);
          reconnectWebSocket();
        }
      }
      if (!connectedRef.current) {
        pendingSwitchToPcRef.current = true;
        setConnectModalVisible(true);
        return;
      }
    }

    const prevTarget = playbackTargetRef.current;
    const fromPhone = phoneStateRef.current;

    // 1. Guarantee Phone audio stops immediately & cancel any pending stream resolve
    phoneOpTokenRef.current++;
    nativeAudio.stop();
    updatePhoneState((prev) => ({ ...prev, playing: false }));

    // 2. Switch UI target to PC
    updatePlaybackTarget("pc");

    // 3. Automatically start music on PC
    if (prevTarget === "phone" && fromPhone.currentTrack) {
      const handoffTrack = fromPhone.currentTrack;
      const handoffQueue =
        fromPhone.queue.length > 0 ? [...fromPhone.queue] : [handoffTrack];
      const handoffIndex = Math.max(
        0,
        Math.min(fromPhone.index, handoffQueue.length - 1)
      );
      const handoffPos = fromPhone.position || 0;

      // Optimistic PC UI update right away
      pcHandoffPendingRef.current = true;
      updatePcState((prev) => ({
        ...prev,
        currentTrack: handoffTrack,
        playing: true,
        position: handoffPos,
        duration: handoffTrack.duration || prev.duration,
        queue: handoffQueue,
        index: handoffIndex,
      }));

      try {
        const resolvedTrack = await spotifyService.resolvePlayableTrack(handoffTrack);
        // If user already switched back to phone during resolve, abort PC start
        if (playbackTargetRef.current !== "pc") return;

        handoffQueue[handoffIndex] = resolvedTrack;
        await sendRemoteAction({
          type: "handoff",
          track: resolvedTrack,
          queue: handoffQueue,
          startIndex: handoffIndex,
          position: handoffPos,
          playing: true,
        });
      } finally {
        pcHandoffPendingRef.current = false;
      }
    } else {
      const cachedPc = pcStateRef.current;
      if (cachedPc.currentTrack) {
        updatePcState(cachedPc);
        if (!cachedPc.playing) {
          updatePcState((prev) => ({ ...prev, playing: true }));
          void sendRemoteAction({ type: "play" });
        }
        requestPCSync();
      } else {
        const freshPc = (await fetchPCPlayerState()) || cachedPc;
        if (playbackTargetRef.current !== "pc") return;
        updatePcState(freshPc);
        if (freshPc.currentTrack && !freshPc.playing) {
          updatePcState((prev) => ({ ...prev, playing: true }));
          await sendRemoteAction({ type: "play" });
        }
      }
    }
  };

  // Switch cleanly from PC -> Phone: pause PC and automatically run track on Phone
  const switchToPhone = async () => {
    const prevTarget = playbackTargetRef.current;
    const fromPc = pcStateRef.current;

    // 1. Pause PC immediately so audio never plays on both devices
    if (connectedRef.current) {
      updatePcState((prev) => ({ ...prev, playing: false }));
      void sendRemoteAction({ type: "pause" });
    }

    // 2. Switch UI target to Phone
    updatePlaybackTarget("phone");

    // 3. Automatically run music on Phone
    if (prevTarget === "pc" && fromPc.currentTrack) {
      const q = fromPc.queue.length > 0 ? fromPc.queue : [fromPc.currentTrack];
      const idx = Math.max(0, Math.min(fromPc.index, q.length - 1));
      await playOnPhone(fromPc.currentTrack, q, idx, fromPc.position || 0);
      return;
    }

    const curPhone = phoneStateRef.current;
    if (curPhone.currentTrack) {
      if (nativeAudio.hasLoadedPlayer() && nativeAudio.resume()) {
        updatePhoneState((prev) => ({ ...prev, playing: true }));
      } else {
        const q = curPhone.queue.length > 0 ? curPhone.queue : [curPhone.currentTrack];
        const idx = Math.max(0, Math.min(curPhone.index, q.length - 1));
        await playOnPhone(curPhone.currentTrack, q, idx, curPhone.position || 0);
      }
    }
  };

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

  // Playback action dispatcher (Routes strictly to current target)
  const handlePlaySong = async (track: Track, customQueue?: Track[], startIndex?: number) => {
    saveRecentTrack(track).then(() => {
      setRecentTracks((prev) => [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 20));
    });

    const q = customQueue || (results.length > 0 ? results : [track]);
    const trackIndex =
      typeof startIndex === "number"
        ? startIndex
        : Math.max(0, q.findIndex((t) => t.id === track.id));

    if (playbackTargetRef.current === "phone" || !connectedRef.current) {
      await playOnPhone(track, q, trackIndex, 0);
    } else {
      phoneOpTokenRef.current++;
      nativeAudio.stop();
      updatePhoneState((prev) => ({ ...prev, playing: false }));

      const nextQueue = [...q];
      updatePcState((prev) => ({
        ...prev,
        currentTrack: track,
        playing: true,
        position: 0,
        duration: track.duration,
        queue: nextQueue,
        index: trackIndex,
      }));

      const resolvedTrack = await spotifyService.resolvePlayableTrack(track);
      if (playbackTargetRef.current !== "pc") return;

      nextQueue[trackIndex] = resolvedTrack;
      await sendRemoteAction({
        type: "play-track",
        track: resolvedTrack,
        queue: nextQueue,
        startIndex: trackIndex,
        position: 0,
      });
    }
  };

  const handleTogglePlay = async () => {
    if (playbackTargetRef.current === "pc" && connectedRef.current) {
      const curPc = pcStateRef.current;
      if (!curPc.currentTrack && curPc.queue.length > 0) {
        await handlePlaySong(curPc.queue[0], curPc.queue, 0);
        return;
      }
      const nextPlaying = !curPc.playing;
      updatePcState((prev) => ({ ...prev, playing: nextPlaying }));
      await sendRemoteAction({ type: nextPlaying ? "play" : "pause" });
      return;
    }

    const curPhone = phoneStateRef.current;
    if (curPhone.playing) {
      phoneOpTokenRef.current++;
      nativeAudio.pause();
      updatePhoneState((prev) => ({ ...prev, playing: false }));
    } else {
      if (nativeAudio.hasLoadedPlayer() && nativeAudio.resume()) {
        updatePhoneState((prev) => ({ ...prev, playing: true }));
      } else if (curPhone.currentTrack) {
        const q = curPhone.queue.length > 0 ? curPhone.queue : [curPhone.currentTrack];
        const idx = Math.max(0, Math.min(curPhone.index, q.length - 1));
        await playOnPhone(curPhone.currentTrack, q, idx, curPhone.position || 0);
      } else if (curPhone.queue.length > 0) {
        await playOnPhone(curPhone.queue[0], curPhone.queue, 0, 0);
      }
    }
  };

  const handleNext = () => {
    if (playbackTargetRef.current === "pc" && connectedRef.current) {
      void sendRemoteAction({ type: "next" });
      return;
    }

    const { queue, index, shuffle } = phoneStateRef.current;
    if (queue.length === 0) return;
    let nextIdx = (index + 1) % queue.length;
    if (shuffle && queue.length > 1) {
      nextIdx = Math.floor(Math.random() * queue.length);
      if (nextIdx === index) nextIdx = (index + 1) % queue.length;
    }
    const nextTrack = queue[nextIdx];
    if (nextTrack) {
      void handlePlaySong(nextTrack, queue, nextIdx);
    }
  };

  const handlePrev = () => {
    if (playbackTargetRef.current === "pc" && connectedRef.current) {
      void sendRemoteAction({ type: "prev" });
      return;
    }

    const { queue, index, position } = phoneStateRef.current;
    if (position > 3) {
      handleSeek(0);
      return;
    }
    if (queue.length === 0) return;
    const prevIdx = (index - 1 + queue.length) % queue.length;
    const prevTrack = queue[prevIdx];
    if (prevTrack) {
      void handlePlaySong(prevTrack, queue, prevIdx);
    }
  };

  onNextTrackHandlerRef.current = () => {
    handleNext();
  };

  onPrevTrackHandlerRef.current = () => {
    handlePrev();
  };

  const handleSeek = (position: number) => {
    if (playbackTargetRef.current === "pc" && connectedRef.current) {
      updatePcState((prev) => ({ ...prev, position }));
      void sendRemoteAction({ type: "seek", position });
    } else {
      updatePhoneState((prev) => ({ ...prev, position }));
      void nativeAudio.seek(position);
    }
  };

  const handleSetVolume = (volume: number) => {
    if (playbackTargetRef.current === "pc" && connectedRef.current) {
      updatePcState((prev) => ({ ...prev, volume }));
      void sendRemoteAction({ type: "set-volume", volume });
    } else {
      updatePhoneState((prev) => ({ ...prev, volume }));
      nativeAudio.setVolume(volume);
    }
  };

  const handleToggleShuffle = () => {
    if (playbackTargetRef.current === "pc" && connectedRef.current) {
      updatePcState((prev) => ({ ...prev, shuffle: !prev.shuffle }));
      void sendRemoteAction({ type: "toggle-shuffle" });
    } else {
      updatePhoneState((prev) => ({ ...prev, shuffle: !prev.shuffle }));
    }
  };

  const handleCycleRepeat = () => {
    const modes: ("off" | "all" | "one")[] = ["off", "all", "one"];
    if (playbackTargetRef.current === "pc" && connectedRef.current) {
      const curIdx = modes.indexOf(pcStateRef.current.repeat);
      const nextMode = modes[(curIdx + 1) % modes.length];
      updatePcState((prev) => ({ ...prev, repeat: nextMode }));
      void sendRemoteAction({ type: "cycle-repeat" });
    } else {
      const curIdx = modes.indexOf(phoneStateRef.current.repeat);
      const nextMode = modes[(curIdx + 1) % modes.length];
      updatePhoneState((prev) => ({ ...prev, repeat: nextMode }));
    }
  };

  const handleJumpToQueue = (index: number) => {
    if (playbackTargetRef.current === "pc" && connectedRef.current) {
      const track = pcStateRef.current.queue[index];
      if (!track) return;
      void sendRemoteAction({ type: "jump-to", index });
    } else {
      const track = phoneStateRef.current.queue[index];
      if (!track) return;
      void handlePlaySong(track, phoneStateRef.current.queue, index);
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
      ? Math.max(insets.top, RNStatusBar.currentHeight || 0, 32)
      : Math.max(insets.top, 20);

  // PC CoverGlow parity: active track cover glows, or lead Home cover on first visit
  const homeLeadThumb =
    recentTracks[0]?.thumb || INITIAL_QUICK_PICKS[0]?.thumb || null;
  const glowUrl =
    activeTab === "library" && selectedPlaylist
      ? null
      : playerState.currentTrack?.thumb ?? (activeTab === "home" ? homeLeadThumb : null);

  return (
    <View style={[styles.root, { paddingTop: topPadding }]}>
      <StatusBar style="light" />

      {/* PC-Parity Top-of-Panel Artwork Glow Animation */}
      <CoverGlow url={glowUrl} playing={playerState.playing} height={340} />

      {/* Top Header Bar */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <FTuneLogo size={24} color={Colors.inkHi} />
          <Text style={styles.brandName}>FTune</Text>
        </View>

        {/* Right Side: Dual Mode Switcher + Cloud Account Avatar */}
        <View style={styles.headerRightRow}>
          <View style={styles.modeSwitcher}>
            <TouchableOpacity
              style={[
                styles.targetBtn,
                playbackTarget === "phone" && styles.targetBtnActive,
              ]}
              onPress={() => void switchToPhone()}
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
              onPress={() => void switchToPC()}
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
            {/* Quick Picks 2-Column Grid */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Quick Picks</Text>
            </View>

            <View style={styles.quickGrid}>
              {INITIAL_QUICK_PICKS.map((track) => (
                <View key={track.id} style={styles.quickCol}>
                  <QuickTile
                    track={track}
                    isPlaying={
                      playerState.currentTrack?.id === track.id && playerState.playing
                    }
                    onPlay={(t) => void handlePlaySong(t, INITIAL_QUICK_PICKS)}
                  />
                </View>
              ))}
            </View>

            {/* Recently Played Shelf (matches PC HomeView) */}
            {recentTracks.length > 0 && (
              <>
                <View style={[styles.sectionHeaderRow, { marginTop: 26 }]}>
                  <Text style={styles.sectionTitle}>Recently Played</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.shelfScroll}
                >
                  {recentTracks.slice(0, 10).map((track) => (
                    <ShelfCard
                      key={`recent-${track.id}`}
                      track={track}
                      isPlaying={
                        playerState.currentTrack?.id === track.id && playerState.playing
                      }
                      onPlay={(t) => void handlePlaySong(t, recentTracks)}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {/* Trending Shelf */}
            <View style={[styles.sectionHeaderRow, { marginTop: 26 }]}>
              <Text style={styles.sectionTitle}>Trending on FTune</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.shelfScroll}
            >
              {INITIAL_QUICK_PICKS.slice(0, 5).map((track) => (
                <ShelfCard
                  key={`shelf-${track.id}`}
                  track={track}
                  isPlaying={
                    playerState.currentTrack?.id === track.id && playerState.playing
                  }
                  onPlay={(t) => void handlePlaySong(t, INITIAL_QUICK_PICKS)}
                />
              ))}
            </ScrollView>

            {/* Mood Chips */}
            <View style={[styles.sectionHeaderRow, { marginTop: 26 }]}>
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
                    onPlay={(t) => void handlePlaySong(t, results)}
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

        {/* 3. LIBRARY TAB */}
        {activeTab === "library" && (
          selectedPlaylist ? (
            <PlaylistDetailView
              playlist={selectedPlaylist}
              currentTrackId={playerState.currentTrack?.id}
              isPlaying={playerState.playing}
              onBack={() => setSelectedPlaylist(null)}
              onPlaySong={(t, q) => void handlePlaySong(t, q)}
              onPlayAll={(tracks) => {
                if (tracks.length > 0) void handlePlaySong(tracks[0], tracks, 0);
              }}
              onToggleFavorite={handleToggleFavorite}
              isFavorite={(id) => favorites.some((f) => f.id === id)}
            />
          ) : (
            <View style={styles.queueContainer}>
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
                      <Text style={styles.hiddenFetchOptionText}>Import Playlist</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* 3A. Playlists Subtab */}
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
                        onPlay={(t) => void handlePlaySong(t, favorites)}
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

              {/* 3C. Offline Downloads Subtab */}
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
                            onPlay={(t) => void handlePlaySong(t, downloadedTracks)}
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
        onTogglePlay={() => void handleTogglePlay()}
        onNext={handleNext}
        onPrev={handlePrev}
        onPress={() => setFullPlayerVisible(true)}
      />

      {/* 3-Tab Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setSelectedPlaylist(null);
          setActiveTab(tab);
        }}
        bottomInset={insets.bottom}
      />

      {/* Expanded Full Screen Player Modal */}
      <FullPlayer
        visible={fullPlayerVisible}
        playerState={playerState}
        playbackTarget={playbackTarget}
        serverHostname={hostname}
        isFavorite={
          !!playerState.currentTrack &&
          favorites.some((f) => f.id === playerState.currentTrack?.id)
        }
        onClose={() => setFullPlayerVisible(false)}
        onTogglePlay={() => void handleTogglePlay()}
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
        onClose={() => {
          pendingSwitchToPcRef.current = false;
          setConnectModalVisible(false);
        }}
        onConnected={(host) => {
          setHostname(host);
          connectedRef.current = true;
          setConnected(true);
          fetchPCLibrary().then((lib) => {
            if (lib?.playlists) setPcPlaylists(lib.playlists);
          });
          spotifyService.refreshPlaylists();
          if (pendingSwitchToPcRef.current) {
            pendingSwitchToPcRef.current = false;
            void switchToPC();
          }
        }}
      />

      {/* Library Fetch Modal */}
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
    position: "relative",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "transparent",
    zIndex: 2,
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
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  modeSwitcher: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.38)",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
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
    backgroundColor: "rgba(255, 255, 255, 0.16)",
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
    zIndex: 1,
  },
  homeScrollContent: {
    paddingBottom: 24,
  },
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.inkHi,
    letterSpacing: -0.35,
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
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.10)",
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
    backgroundColor: "rgba(28, 28, 30, 0.85)",
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.12)",
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  hiddenFetchDrawer: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
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
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  playlistThumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.panel,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
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
