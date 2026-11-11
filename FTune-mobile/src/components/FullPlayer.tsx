import React, { useState, useEffect, useRef } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
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
  Smartphone,
  Heart,
  Download,
  Check,
  ListMusic,
  X,
} from "lucide-react-native";
import { Colors } from "../theme/colors";
import type { RemotePlayerState, Track } from "../types";
import { isTrackDownloaded, downloadTrack } from "../services/downloadManager";

const { width, height } = Dimensions.get("window");
const COVER_SIZE = Math.min(width - 56, 360);

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
  serverHostname,
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

  // Local dragging state for the scrubber slider
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  // Offline download state for the current song
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Queue Sheet visibility
  const [queueVisible, setQueueVisible] = useState(false);

  const insets = useSafeAreaInsets();

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

  // Check download status when current track changes
  useEffect(() => {
    if (!track?.id) return;
    let mounted = true;
    isTrackDownloaded(track.id).then((val) => {
      if (mounted) setIsDownloaded(val);
    });
    return () => {
      mounted = false;
    };
  }, [track?.id]);

  const handleDownload = async () => {
    if (!track || isDownloaded || isDownloading) return;
    setIsDownloading(true);
    const res = await downloadTrack(track);
    setIsDownloading(false);
    if (res) setIsDownloaded(true);
  };

  // Swiping gestures on artwork:
  // Swipe Down -> Close Player
  // Swipe Left -> Next Track
  // Swipe Right -> Prev Track
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > 20 || Math.abs(gesture.dy) > 20;
      },
      onPanResponderRelease: (_, gesture) => {
        // Vertical swipe down to close
        if (gesture.dy > 80 && Math.abs(gesture.dx) < 60) {
          onClose();
        }
        // Horizontal swipe left for Next
        else if (gesture.dx < -60 && Math.abs(gesture.dy) < 60) {
          onNext();
        }
        // Horizontal swipe right for Prev
        else if (gesture.dx > 60 && Math.abs(gesture.dy) < 60) {
          onPrev();
        }
      },
    })
  ).current;

  if (!track) return null;

  const currentPos = isSeeking ? seekValue : playerState.position || 0;
  const duration = playerState.duration || track.duration || 1;

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const topPadding =
    Platform.OS === "android"
      ? Math.max(insets.top, RNStatusBar.currentHeight || 0, 36)
      : Math.max(insets.top, 20);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: topPadding,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        {/* Subtle Ambient Artwork Tint Backdrop */}
        <View style={styles.ambientOverlay} />

        {/* Top Header Row */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ChevronDown size={28} color={Colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerSubtitle}>
              {playbackTarget === "phone" ? "PLAYING ON PHONE" : "PLAYING ON PC"}
            </Text>
            <View style={styles.deviceIndicatorRow}>
              {playbackTarget === "phone" ? (
                <Smartphone size={13} color={Colors.textSecondary} />
              ) : (
                <Laptop size={13} color={Colors.accentSky} />
              )}
              <Text style={styles.deviceIndicatorText} numberOfLines={1}>
                {playbackTarget === "phone"
                  ? "This Phone (Solo)"
                  : serverHostname || "FTune PC"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setQueueVisible(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ListMusic size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Artwork with Swipe Gesture Recognition */}
        <View style={styles.artworkArea} {...panResponder.panHandlers}>
          <View style={styles.artworkWrapper}>
            <Image
              source={{
                uri:
                  track.thumb ||
                  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600",
              }}
              style={styles.artwork}
            />
          </View>
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
            {/* Download Button */}
            <TouchableOpacity
              style={styles.iconCircle}
              onPress={handleDownload}
              disabled={isDownloaded || isDownloading}
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : isDownloaded ? (
                <View style={styles.downloadDoneBadge}>
                  <Check size={14} color="#000" strokeWidth={3} />
                </View>
              ) : (
                <Download size={20} color={Colors.textSecondary} />
              )}
            </TouchableOpacity>

            {/* Favorite / Liked Song Button */}
            {onToggleFavorite && (
              <TouchableOpacity
                style={styles.iconCircle}
                onPress={() => onToggleFavorite(track)}
              >
                <Heart
                  size={22}
                  color={isFavorite ? "#ef4444" : Colors.textSecondary}
                  fill={isFavorite ? "#ef4444" : "transparent"}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Timeline Scrubber with DRAG SUPPORT */}
        <View style={styles.scrubberSection}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration > 0 ? duration : 1}
            value={currentPos}
            minimumTrackTintColor="#ffffff"
            maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
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

        {/* Main Transport Playback Controls */}
        <View style={styles.controlsRow}>
          {/* Shuffle Toggle */}
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={onToggleShuffle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Shuffle
              size={21}
              color={playerState.shuffle ? "#ffffff" : Colors.textMuted}
            />
          </TouchableOpacity>

          {/* Previous Track Button */}
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onPrev}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <SkipBack size={32} color="#ffffff" fill="#ffffff" />
          </TouchableOpacity>

          {/* Large White Play / Pause Circle (FTune Desktop Spec) */}
          <TouchableOpacity
            style={styles.playCircle}
            onPress={onTogglePlay}
            activeOpacity={0.85}
          >
            {playerState.playing ? (
              <Pause size={30} color="#000000" fill="#000000" />
            ) : (
              <Play
                size={30}
                color="#000000"
                fill="#000000"
                style={{ marginLeft: 3 }}
              />
            )}
          </TouchableOpacity>

          {/* Next Track Button */}
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onNext}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <SkipForward size={32} color="#ffffff" fill="#ffffff" />
          </TouchableOpacity>

          {/* Repeat Cycle Toggle */}
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={onCycleRepeat}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {playerState.repeat === "one" ? (
              <Repeat1 size={22} color="#ffffff" />
            ) : (
              <Repeat
                size={21}
                color={playerState.repeat === "all" ? "#ffffff" : Colors.textMuted}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Volume Control Slider */}
        <View style={styles.volumeRow}>
          <TouchableOpacity
            onPress={() => onSetVolume(playerState.volume > 0 ? 0 : 0.8)}
          >
            {playerState.volume === 0 || playerState.muted ? (
              <VolumeX size={18} color={Colors.textMuted} />
            ) : (
              <Volume2 size={18} color={Colors.textMuted} />
            )}
          </TouchableOpacity>

          <Slider
            style={styles.volumeSlider}
            minimumValue={0}
            maximumValue={1}
            value={playerState.volume}
            minimumTrackTintColor="#ffffff"
            maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
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
  ambientOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  headerBtn: {
    padding: 6,
  },
  headerTitleWrap: {
    alignItems: "center",
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textMuted,
    letterSpacing: 1.2,
  },
  deviceIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  deviceIndicatorText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  artworkArea: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 14,
  },
  artworkWrapper: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 16,
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
    fontSize: 21,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.4,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  downloadDoneBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  scrubberSection: {
    marginTop: 10,
  },
  slider: {
    width: "100%",
    height: 36,
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
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 10,
    paddingHorizontal: 4,
  },
  sideBtn: {
    padding: 10,
  },
  skipBtn: {
    padding: 10,
  },
  playCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    marginTop: 4,
  },
  volumeSlider: {
    flex: 1,
    height: 36,
    marginHorizontal: 12,
  },
  volumePercentText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textMuted,
    minWidth: 32,
    textAlign: "right",
  },
  queueOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  queueSheet: {
    backgroundColor: "#16161c",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    maxHeight: height * 0.7,
  },
  queueHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
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
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  queueItemActive: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
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
