import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Platform,
  StatusBar as RNStatusBar,
  BackHandler,
  PanResponder,
  ActivityIndicator,
  FlatList,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Laptop,
  Download,
  Check,
  ListMusic,
  X,
} from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { RemotePlayerState, Track } from "../types";
import { isTrackDownloadedSync, downloadTrack, subscribeDownloads } from "../services/downloadManager";
import { AnimatedHeart } from "./AnimatedComponents";

const { width, height } = Dimensions.get("window");
const COVER_SIZE = Math.min(width - 64, Math.round(height * 0.36), 340);

interface BackdropLayer {
  id: number;
  url: string;
  opacity: Animated.Value;
}

/**
 * Fullscreen crossfading + drifting artwork backdrop matching PC NowPlaying (FsBackdrop).
 */
const FsBackdrop: React.FC<{ artwork?: string | null; playing: boolean }> = ({
  artwork,
  playing,
}) => {
  const url = artwork && artwork.trim() ? artwork.trim() : null;
  const [layers, setLayers] = useState<BackdropLayer[]>(() =>
    url ? [{ id: 0, url, opacity: new Animated.Value(1) }] : []
  );
  const currentUrlRef = useRef<string | null>(url);
  const nextIdRef = useRef(1);

  const drift1X = useRef(new Animated.Value(0)).current;
  const drift1Y = useRef(new Animated.Value(0)).current;
  const drift2X = useRef(new Animated.Value(0)).current;
  const drift2Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a1 = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(drift1X, {
            toValue: 22,
            duration: 9000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(drift1Y, {
            toValue: 16,
            duration: 9000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(drift1X, {
            toValue: -18,
            duration: 9000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(drift1Y, {
            toValue: -14,
            duration: 9000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    const a2 = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(drift2X, {
            toValue: -20,
            duration: 11000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(drift2Y, {
            toValue: 18,
            duration: 11000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(drift2X, {
            toValue: 20,
            duration: 11000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(drift2Y, {
            toValue: -16,
            duration: 11000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
    };
  }, []);

  useEffect(() => {
    if (url === currentUrlRef.current) return;
    currentUrlRef.current = url;
    if (!url) {
      setLayers([]);
      return;
    }

    const newOpacity = new Animated.Value(0);
    const layer: BackdropLayer = {
      id: nextIdRef.current++,
      url,
      opacity: newOpacity,
    };

    setLayers((prev) => {
      const top = prev[prev.length - 1];
      return top ? [top, layer] : [layer];
    });

    Animated.timing(newOpacity, {
      toValue: 1,
      duration: 1000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      setLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev));
    }, 1050);

    return () => clearTimeout(timer);
  }, [url]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0a0a0d" }]} />
      {layers.map((layer) => (
        <Animated.View
          key={layer.id}
          style={[StyleSheet.absoluteFill, { opacity: layer.opacity }]}
        >
          {/* Base heavily blurred artwork lighting the room */}
          <Animated.Image
            source={{ uri: layer.url }}
            blurRadius={Platform.OS === "android" ? 55 : 90}
            resizeMode="cover"
            style={[
              styles.backdropImg,
              {
                opacity: playing ? 0.56 : 0.44,
                transform: [{ scale: 1.45 }, { translateX: drift1X }, { translateY: drift1Y }],
              },
            ]}
          />
          {/* Secondary counter-drifting artwork glow layer (matches PC animate-drift2) */}
          <Animated.Image
            source={{ uri: layer.url }}
            blurRadius={Platform.OS === "android" ? 70 : 100}
            resizeMode="cover"
            style={[
              styles.backdropImg,
              {
                opacity: playing ? 0.28 : 0.18,
                transform: [
                  { scale: 1.75 },
                  { translateX: drift2X },
                  { translateY: drift2Y },
                ],
              },
            ]}
          />
        </Animated.View>
      ))}

      {/* Legibility scrim matching PC NowPlaying */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="fsScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity="0.28" />
            <Stop offset="0.45" stopColor="#000000" stopOpacity="0.34" />
            <Stop offset="0.82" stopColor="#060608" stopOpacity="0.72" />
            <Stop offset="1" stopColor="#050507" stopOpacity="0.90" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#fsScrim)" />
      </Svg>
    </View>
  );
};

const VIZ_BARS = 24;

/**
 * Ambient symmetric visualizer matching PC NowPlaying (FsVisualizer).
 * Dances smoothly on staggered loops while playing, settles calmly when paused.
 */
const FsVisualizer: React.FC<{ playing: boolean }> = ({ playing }) => {
  const barMeta = useMemo(
    () =>
      Array.from({ length: VIZ_BARS }, (_, i) => {
        const r1 = ((i * 137) % 101) / 101;
        const r2 = ((i * 61) % 97) / 97;
        // Taper outer edges just like PC .fs-viz mask-image
        const distFromCenter = Math.abs(i - (VIZ_BARS - 1) / 2) / ((VIZ_BARS - 1) / 2);
        const edgeAlpha = Math.max(0.18, 1 - distFromCenter * 0.82);
        return {
          dur: Math.round(700 + r1 * 650),
          delay: Math.round(r2 * 450),
          rest: 0.14 + r1 * 0.12,
          peak: 0.45 + (1 - distFromCenter * 0.35) * 0.55,
          edgeAlpha,
        };
      }),
    []
  );

  const anims = useRef(barMeta.map((b) => new Animated.Value(b.rest))).current;

  useEffect(() => {
    if (!playing) {
      anims.forEach((v, i) => {
        Animated.timing(v, {
          toValue: barMeta[i].rest,
          duration: 500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
      return;
    }

    const loops = anims.map((v, i) => {
      const m = barMeta[i];
      return Animated.loop(
        Animated.sequence([
          Animated.delay(m.delay),
          Animated.timing(v, {
            toValue: m.peak,
            duration: m.dur,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: m.rest + 0.08,
            duration: Math.round(m.dur * 0.85),
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
    });

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [playing]);

  return (
    <View style={styles.vizRow} pointerEvents="none">
      {barMeta.map((b, i) => (
        <Animated.View
          key={i}
          style={[
            styles.vizBar,
            {
              opacity: playing ? b.edgeAlpha * 0.42 : b.edgeAlpha * 0.22,
              transform: [{ scaleY: anims[i] }],
            },
          ]}
        />
      ))}
    </View>
  );
};

interface FullPlayerProps {
  visible: boolean;
  playerState: RemotePlayerState;
  playbackTarget: "phone" | "pc";
  serverHostname?: string;
  isFavorite?: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (position: number) => void;
  onSetVolume: (vol: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleFavorite?: (track: Track) => void;
  onJumpToQueue?: (index: number) => void;
}

export const FullPlayer: React.FC<FullPlayerProps> = ({
  visible,
  playerState,
  playbackTarget,
  isFavorite = false,
  onClose,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onSetVolume,
  onToggleShuffle,
  onCycleRepeat,
  onToggleFavorite,
  onJumpToQueue,
}) => {
  const track = playerState.currentTrack;

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(() =>
    track?.id ? isTrackDownloadedSync(track.id) : false
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);

  const insets = useSafeAreaInsets();

  // Breathing animation on hero artwork while playing (matches PC .fs-art-breathe)
  const breatheScale = useRef(new Animated.Value(1)).current;
  const artEnterScale = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0.32)).current;

  useEffect(() => {
    if (!visible || !playerState.playing) {
      Animated.parallel([
        Animated.timing(breatheScale, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(haloOpacity, {
          toValue: 0.25,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(breatheScale, {
            toValue: 1.018,
            duration: 2600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0.56,
            duration: 2600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(breatheScale, {
            toValue: 1.0,
            duration: 2600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0.34,
            duration: 2600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    breatheLoop.start();
    return () => breatheLoop.stop();
  }, [visible, playerState.playing]);

  // Subtle entrance pop when song changes
  useEffect(() => {
    if (!track?.id) return;
    artEnterScale.setValue(0.95);
    Animated.timing(artEnterScale, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [track?.id]);

  // Listen to Android hardware back press to close player
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (queueVisible) {
        setQueueVisible(false);
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, queueVisible, onClose]);

  useEffect(() => {
    if (!track?.id) {
      setIsDownloaded(false);
      return;
    }
    setIsDownloaded(isTrackDownloadedSync(track.id));
    const unsub = subscribeDownloads(() => {
      setIsDownloaded(isTrackDownloadedSync(track.id));
    });
    return unsub;
  }, [track?.id]);

  const handleDownload = async () => {
    if (!track || isDownloaded || isDownloading) return;
    setIsDownloading(true);
    const res = await downloadTrack(track);
    setIsDownloading(false);
    if (res) setIsDownloaded(true);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > 26 || Math.abs(gesture.dy) > 26;
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 80 && Math.abs(gesture.dx) < 60) {
          onClose();
        } else if (gesture.dx < -60 && Math.abs(gesture.dy) < 60) {
          onNext();
        } else if (gesture.dx > 60 && Math.abs(gesture.dy) < 60) {
          onPrev();
        }
      },
    })
  ).current;

  if (!track) return null;

  const duration = playerState.duration || track.duration || 1;
  const currentPos = Math.min(duration, Math.max(0, isSeeking ? seekValue : playerState.position || 0));

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const topPadding =
    Platform.OS === "android"
      ? Math.max(insets.top, RNStatusBar.currentHeight || 0, 32)
      : Math.max(insets.top, 20);

  const thumbUri =
    track.thumb || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600";

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: topPadding,
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        {/* PC-Parity Crossfading + Drifting Artwork Glow Backdrop */}
        <FsBackdrop artwork={thumbUri} playing={playerState.playing} />

        {/* Top Header Row — shows "Playing on PC" ONLY when playing on PC; blank when on mobile */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ChevronDown size={26} color={Colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            {playbackTarget === "pc" ? (
              <View style={styles.pcPlayingBadge}>
                <Laptop size={13} color={Colors.inkHi} />
                <Text style={styles.pcPlayingText}>Playing on PC</Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setQueueVisible(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ListMusic size={21} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Hero Artwork with Ambient Glow Halo + Breathing Animation */}
        <View style={styles.artworkArea} {...panResponder.panHandlers}>
          {/* Ambient glow halo behind the sleeve */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.artworkHaloWrap,
              { opacity: haloOpacity, transform: [{ scale: breatheScale }] },
            ]}
          >
            <Image
              source={{ uri: thumbUri }}
              style={styles.artworkHaloImg}
              blurRadius={Platform.OS === "android" ? 40 : 65}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.artworkWrapper,
              {
                transform: [{ scale: Animated.multiply(breatheScale, artEnterScale) }],
              },
            ]}
          >
            <Image source={{ uri: thumbUri }} style={styles.artwork} />
          </Animated.View>
        </View>

        {/* Track Title, Artist, Explicit badge & Action Buttons */}
        <View style={styles.metaRow}>
          <View style={styles.metaInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {track.title}
            </Text>
            <View style={styles.artistRow}>
              {track.explicit && (
                <View style={styles.explicitBadge}>
                  <Text style={styles.explicitText}>E</Text>
                </View>
              )}
              <Text style={styles.trackArtist} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
          </View>

          <View style={styles.metaActions}>
            <TouchableOpacity
              style={styles.iconCircle}
              onPress={handleDownload}
              disabled={isDownloaded || isDownloading}
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : isDownloaded ? (
                <View style={styles.downloadDoneBadge}>
                  <Check size={13} color="#000" strokeWidth={3} />
                </View>
              ) : (
                <Download size={19} color={Colors.textSecondary} />
              )}
            </TouchableOpacity>

            {onToggleFavorite && (
              <View style={styles.iconCircle}>
                <AnimatedHeart
                  isFavorite={isFavorite}
                  onPress={() => onToggleFavorite(track)}
                  size={21}
                  color={Colors.inkDim}
                />
              </View>
            )}
          </View>
        </View>

        {/* PC-Parity Ambient Waveform Visualizer */}
        <FsVisualizer playing={playerState.playing} />

        {/* Timeline Scrubber with DRAG SUPPORT */}
        <View style={styles.scrubberSection}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration > 0 ? duration : 1}
            value={currentPos}
            minimumTrackTintColor="#ffffff"
            maximumTrackTintColor="rgba(255, 255, 255, 0.24)"
            thumbTintColor="#ffffff"
            onSlidingStart={() => {
              setIsSeeking(true);
            }}
            onValueChange={(val) => {
              setSeekValue(val);
            }}
            onSlidingComplete={(val) => {
              setIsSeeking(false);
              onSeek(val);
            }}
          />

          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>{formatTime(currentPos)}</Text>
            <Text style={styles.timeLabel}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Main Transport Playback Controls (with PC active dot indicators) */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={onToggleShuffle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Shuffle
              size={20}
              color={playerState.shuffle ? "#ffffff" : Colors.textMuted}
            />
            {playerState.shuffle && <View style={styles.activeDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onPrev}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <SkipBack size={30} color="#ffffff" fill="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.playCircle}
            onPress={onTogglePlay}
            activeOpacity={0.8}
          >
            {playerState.playing ? (
              <Pause size={28} color="#000000" fill="#000000" />
            ) : (
              <Play
                size={28}
                color="#000000"
                fill="#000000"
                style={{ marginLeft: 3 }}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onNext}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <SkipForward size={30} color="#ffffff" fill="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sideBtn}
            onPress={onCycleRepeat}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {playerState.repeat === "one" ? (
              <Repeat1 size={21} color="#ffffff" />
            ) : (
              <Repeat
                size={20}
                color={playerState.repeat === "all" ? "#ffffff" : Colors.textMuted}
              />
            )}
            {playerState.repeat !== "off" && <View style={styles.activeDot} />}
          </TouchableOpacity>
        </View>

        {/* Volume Control Slider */}
        <View style={styles.volumeRow}>
          <TouchableOpacity
            onPress={() => onSetVolume(playerState.volume > 0 ? 0 : 0.8)}
          >
            {playerState.volume === 0 || playerState.muted ? (
              <VolumeX size={17} color={Colors.textMuted} />
            ) : (
              <Volume2 size={17} color={Colors.textMuted} />
            )}
          </TouchableOpacity>

          <Slider
            style={styles.volumeSlider}
            minimumValue={0}
            maximumValue={1}
            value={playerState.volume}
            minimumTrackTintColor="#ffffff"
            maximumTrackTintColor="rgba(255, 255, 255, 0.22)"
            thumbTintColor="#ffffff"
            onValueChange={onSetVolume}
          />

          <Text style={styles.volumePercentText}>
            {Math.round(playerState.volume * 100)}%
          </Text>
        </View>
      </View>

      {/* Up Next / Queue Sheet Modal */}
      <Modal
        visible={queueVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setQueueVisible(false)}
      >
        <View style={styles.queueOverlay}>
          <View style={[styles.queueSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.queueHeader}>
              <Text style={styles.queueTitle}>Up Next Queue</Text>
              <TouchableOpacity
                onPress={() => setQueueVisible(false)}
                style={styles.queueCloseBtn}
              >
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={playerState.queue}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              renderItem={({ item, index }) => {
                const isCurrent = index === playerState.index;
                return (
                  <TouchableOpacity
                    style={[styles.queueItem, isCurrent && styles.queueItemActive]}
                    onPress={() => {
                      if (onJumpToQueue) onJumpToQueue(index);
                      setQueueVisible(false);
                    }}
                  >
                    <Image source={{ uri: item.thumb }} style={styles.queueThumb} />
                    <View style={styles.queueItemInfo}>
                      <Text
                        style={[styles.queueItemTitle, isCurrent && styles.queueItemTitleActive]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text style={styles.queueItemArtist} numberOfLines={1}>
                        {item.artist}
                      </Text>
                    </View>
                    {isCurrent && (
                      <View style={styles.playingPill}>
                        <Text style={styles.playingPillText}>NOW PLAYING</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            />
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  backdropImg: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  headerBtn: {
    padding: 6,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pcPlayingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  pcPlayingText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.inkHi,
    letterSpacing: -0.1,
  },
  artworkArea: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
    position: "relative",
  },
  artworkHaloWrap: {
    position: "absolute",
    width: COVER_SIZE + 46,
    height: COVER_SIZE + 46,
    borderRadius: 36,
    overflow: "hidden",
  },
  artworkHaloImg: {
    width: "100%",
    height: "100%",
  },
  artworkWrapper: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  metaInfo: {
    flex: 1,
    marginRight: 16,
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  explicitBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginRight: 6,
  },
  explicitText: {
    color: "#ffffff",
    fontSize: 9.5,
    fontWeight: "800",
  },
  trackArtist: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  metaActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  downloadDoneBadge: {
    width: 19,
    height: 19,
    borderRadius: 9.5,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  vizRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 26,
    gap: 4.5,
    marginTop: 8,
  },
  vizBar: {
    width: 3,
    height: 26,
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
  scrubberSection: {
    marginTop: 4,
  },
  slider: {
    width: "100%",
    height: 34,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
    paddingHorizontal: 4,
  },
  timeLabel: {
    fontSize: 11.5,
    fontWeight: "500",
    color: Colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 6,
    paddingHorizontal: 4,
  },
  sideBtn: {
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  activeDot: {
    position: "absolute",
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ffffff",
  },
  skipBtn: {
    padding: 10,
  },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  volumeSlider: {
    flex: 1,
    height: 34,
    marginHorizontal: 12,
  },
  volumePercentText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textMuted,
    minWidth: 32,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  queueOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "flex-end",
  },
  queueSheet: {
    backgroundColor: "#141418",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
    maxHeight: height * 0.7,
  },
  queueHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  queueTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
  },
  queueCloseBtn: {
    padding: 4,
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  queueItemActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  queueThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  queueItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  queueItemTitle: {
    fontSize: 13.5,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  queueItemTitleActive: {
    fontWeight: "700",
    color: "#ffffff",
  },
  queueItemArtist: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  playingPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  playingPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
});
