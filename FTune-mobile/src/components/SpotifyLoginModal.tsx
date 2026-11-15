import React, { useState, useRef } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { X, ExternalLink, Link2, Laptop, CheckCircle2 } from "lucide-react-native";
import { Colors } from "../theme/colors";
import { SpotifyIcon, SPOTIFY_GREEN } from "./SpotifyIcon";
import { spotifyService } from "../services/spotify";
import { isServerConnected } from "../services/api";
import { SpringTouchable } from "./AnimatedComponents";

interface SpotifyLoginModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INJECTED_AUTH_SCRIPT = `
  (function() {
    function checkToken() {
      if (window.location.hostname.indexOf('open.spotify.com') !== -1) {
        fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web-player', { credentials: 'include' })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data && data.accessToken && data.isAnonymous === false) {
              fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': 'Bearer ' + data.accessToken }
              })
              .then(function(pRes) { return pRes.json(); })
              .then(function(profile) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'spotify-success',
                  token: data.accessToken,
                  name: profile.display_name || profile.id || 'Spotify Listener'
                }));
              })
              .catch(function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'spotify-success',
                  token: data.accessToken,
                  name: 'Spotify Listener'
                }));
              });
            }
          })
          .catch(function() {});
      }
    }
    checkToken();
    setInterval(checkToken, 2000);
  })();
  true;
`;

const CustomWebView = WebView as any;

export const SpotifyLoginModal: React.FC<SpotifyLoginModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"login" | "link" | "pc">("login");
  const [loading, setLoading] = useState(true);
  const [publicUrl, setPublicUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [pcSyncing, setPcSyncing] = useState(false);
  const webViewRef = useRef<any>(null);

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === "spotify-success" && data.token) {
        await spotifyService.setAuthSession({
          token: data.token,
          name: data.name,
        });
        onSuccess();
        onClose();
      }
    } catch (e) {
      console.warn("[spotify-login] message error:", e);
    }
  };

  const handleImportPublicLink = async () => {
    if (!publicUrl.trim()) return;
    setImporting(true);
    try {
      const playlist = await spotifyService.fetchPublicPlaylist(publicUrl.trim());
      Alert.alert(
        "Playlist Imported!",
        `Successfully loaded "${playlist.name}" with ${playlist.songs.length} songs.`,
        [
          {
            text: "View in Library",
            onPress: () => {
              onSuccess();
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert("Import Failed", err?.message || "Could not read this Spotify playlist.");
    } finally {
      setImporting(false);
    }
  };

  const handleSyncPC = async () => {
    setPcSyncing(true);
    try {
      const playlists = await spotifyService.refreshPlaylists();
      if (playlists.length > 0) {
        Alert.alert("PC Synced!", `Fetched ${playlists.length} playlists from your FTune PC!`);
        onSuccess();
        onClose();
      } else {
        Alert.alert(
          "No Playlists Found",
          "Make sure FTune Desktop on your PC is signed into Spotify, then try again."
        );
      }
    } catch (err: any) {
      Alert.alert("Sync Error", err?.message || "Could not sync with PC.");
    } finally {
      setPcSyncing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        {/* Apple HIG Sheet Grabber */}
        <View style={styles.grabberContainer}>
          <View style={styles.grabber} />
        </View>

        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <SpotifyIcon size={24} />
            <Text style={styles.headerTitle}>Connect Spotify</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color={Colors.inkDim} />
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View style={styles.subtabs}>
          <TouchableOpacity
            style={[styles.subtab, activeTab === "login" && styles.subtabActive]}
            onPress={() => setActiveTab("login")}
          >
            <Text style={[styles.subtabText, activeTab === "login" && styles.subtabTextActive]}>
              Spotify Sign In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subtab, activeTab === "pc" && styles.subtabActive]}
            onPress={() => setActiveTab("pc")}
          >
            <Text style={[styles.subtabText, activeTab === "pc" && styles.subtabTextActive]}>
              Sync from PC
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subtab, activeTab === "link" && styles.subtabActive]}
            onPress={() => setActiveTab("link")}
          >
            <Text style={[styles.subtabText, activeTab === "link" && styles.subtabTextActive]}>
              Import Link
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: In-App WebView Login */}
        {activeTab === "login" && (
          <View style={styles.webContainer}>
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={SPOTIFY_GREEN} />
                <Text style={styles.loadingText}>Loading Spotify login...</Text>
              </View>
            )}
            <CustomWebView
              ref={webViewRef}
              source={{
                uri: "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F",
              }}
              injectedJavaScript={INJECTED_AUTH_SCRIPT}
              onMessage={handleMessage}
              onLoadEnd={() => setLoading(false)}
              userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
              javaScriptEnabled={true}
              domStorageEnabled={true}
              sharedCookiesEnabled={true}
              style={{ flex: 1, backgroundColor: Colors.surface }}
            />
          </View>
        )}

        {/* TAB 2: Sync from PC */}
        {activeTab === "pc" && (
          <View style={styles.formContainer}>
            <View style={styles.pcHeroCard}>
              <Laptop size={44} color={Colors.inkHi} />
              <Text style={styles.pcHeroTitle}>Sync with FTune Desktop</Text>
              <Text style={styles.pcHeroSubtitle}>
                {isServerConnected()
                  ? "Your phone is connected to FTune on PC! Tap below to import your Spotify playlists and Liked Songs."
                  : "Connect your phone to FTune Desktop on the same Wi-Fi network to seamlessly sync your Spotify account."}
              </Text>

              <SpringTouchable
                style={[styles.primaryActionBtn, pcSyncing && { opacity: 0.7 }]}
                onPress={handleSyncPC}
                disabled={pcSyncing}
              >
                {pcSyncing ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <CheckCircle2 size={18} color="#000000" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryActionBtnText}>Sync Spotify Playlists</Text>
                  </>
                )}
              </SpringTouchable>
            </View>
          </View>
        )}

        {/* TAB 3: Import Public Link */}
        {activeTab === "link" && (
          <View style={styles.formContainer}>
            <View style={styles.pcHeroCard}>
              <Link2 size={40} color={SPOTIFY_GREEN} />
              <Text style={styles.pcHeroTitle}>Import Spotify Playlist</Text>
              <Text style={styles.pcHeroSubtitle}>
                Paste any public Spotify playlist or album link. FTune will automatically fetch the tracklist and match it to YouTube Music!
              </Text>

              <View style={styles.urlInputBox}>
                <TextInput
                  style={styles.urlInput}
                  placeholder="https://open.spotify.com/playlist/..."
                  placeholderTextColor={Colors.inkDim}
                  value={publicUrl}
                  onChangeText={setPublicUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <SpringTouchable
                style={[styles.primaryActionBtn, importing && { opacity: 0.7 }]}
                onPress={handleImportPublicLink}
                disabled={importing || !publicUrl.trim()}
              >
                {importing ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <ExternalLink size={18} color="#000000" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryActionBtnText}>Import Playlist</Text>
                  </>
                )}
              </SpringTouchable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: Colors.base,
  },
  grabberContainer: {
    width: "100%",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.hairline,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: Colors.inkHi,
    letterSpacing: -0.3,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: Colors.elevated,
  },
  subtabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: Colors.surface,
  },
  subtab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: Colors.panel,
  },
  subtabActive: {
    backgroundColor: Colors.inkHi,
  },
  subtabText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: Colors.inkDim,
  },
  subtabTextActive: {
    color: Colors.onPrimary,
  },
  webContainer: {
    flex: 1,
    position: "relative",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.inkDim,
  },
  formContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  pcHeroCard: {
    backgroundColor: Colors.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairline,
    padding: 24,
    alignItems: "center",
  },
  pcHeroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.inkHi,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  pcHeroSubtitle: {
    fontSize: 13.5,
    color: Colors.inkDim,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 20,
  },
  urlInputBox: {
    width: "100%",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  urlInput: {
    fontSize: 14,
    color: Colors.inkHi,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
    width: "100%",
  },
  primaryActionBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.onPrimary,
  },
});
