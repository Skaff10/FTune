import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  FlatList,
  Image,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  X,
  ExternalLink,
  Link2,
  Laptop,
  CheckCircle2,
  Heart,
  ListMusic,
  Check,
  RefreshCw,
  LogOut,
  Download,
} from "lucide-react-native";
import { Colors } from "../theme/colors";
import { SpotifyIcon, SPOTIFY_GREEN } from "./SpotifyIcon";
import { spotifyService, LIKED_ID, LIKED_SLEEVE } from "../services/spotify";
import { isServerConnected } from "../services/api";
import { SpringTouchable } from "./AnimatedComponents";
import type { PCPlaylist, SpotifyPlaylistInfo, Track } from "../types";

interface SpotifyLoginModalProps {
  visible: boolean;
  initialTab?: "login" | "link" | "pc";
  onClose: () => void;
  onSuccess: (result?: {
    borrowed?: PCPlaylist[];
    likedTracks?: Track[];
    openPlaylist?: PCPlaylist;
  }) => void;
}

const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Runs before page scripts on open.spotify.com to intercept the Web Player's
 * own /api/token response or Pathfinder Authorization header immediately.
 */
const BEFORE_LOAD_SCRIPT = `
  (function() {
    if (window.__ftuneHooked) return;
    window.__ftuneHooked = true;

    function reportToken(token, name) {
      if (!token || typeof token !== 'string' || token.length < 20) return;
      if (window.__ftuneReportedToken === token) return;
      window.__ftuneReportedToken = token;
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'spotify-success',
          token: token,
          name: name || ''
        }));
      }
    }

    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function(input, init) {
        try {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          if (init && init.headers) {
            var auth = init.headers['Authorization'] || init.headers['authorization'] ||
              (init.headers.get && (init.headers.get('Authorization') || init.headers.get('authorization')));
            if (auth && typeof auth === 'string' && auth.indexOf('Bearer ') === 0 && url.indexOf('spotify.com') !== -1) {
              var bearer = auth.slice(7).trim();
              if (bearer.length > 30 && window.__ftuneIsSignedIn) {
                reportToken(bearer, '');
              }
            }
          }
        } catch (e) {}

        return origFetch.apply(this, arguments).then(function(response) {
          try {
            var rUrl = response.url || (typeof input === 'string' ? input : '');
            if (rUrl.indexOf('/api/token') !== -1 || rUrl.indexOf('get_access_token') !== -1) {
              response.clone().json().then(function(data) {
                if (data && data.accessToken && data.isAnonymous === false) {
                  window.__ftuneIsSignedIn = true;
                  reportToken(data.accessToken, '');
                }
              }).catch(function(){});
            }
          } catch (e) {}
          return response;
        });
      };
    }
  })();
  true;
`;

/**
 * Pure-JS SHA1 + HMAC-SHA1 + TOTP minting inside open.spotify.com WebView.
 * Because this runs on https://open.spotify.com, fetch('/api/token?...', { credentials: 'include' })
 * automatically includes the HttpOnly sp_dc cookie set by accounts.spotify.com!
 */
const INJECTED_AUTH_SCRIPT = `
  (function() {
    function sha1(bytes) {
      var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
      var ml = bytes.length * 8;
      var paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
      var buf = new Uint8Array(paddedLen);
      buf.set(bytes);
      buf[bytes.length] = 0x80;
      var view = new DataView(buf.buffer);
      view.setUint32(paddedLen - 4, ml >>> 0, false);
      view.setUint32(paddedLen - 8, Math.floor(ml / 0x100000000), false);
      var w = new Uint32Array(80);
      function rotl(n, s) { return ((n << s) | (n >>> (32 - s))) >>> 0; }
      for (var i = 0; i < paddedLen; i += 64) {
        for (var j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
        for (var j = 16; j < 80; j++) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
        var a = h0, b = h1, c = h2, d = h3, e = h4;
        for (var j = 0; j < 80; j++) {
          var f, k;
          if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
          else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
          else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
          else { f = b ^ c ^ d; k = 0xca62c1d6; }
          var temp = (rotl(a, 5) + (f >>> 0) + e + k + w[j]) >>> 0;
          e = d; d = c; c = rotl(b, 30); b = a; a = temp;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
      }
      var out = new Uint8Array(20);
      var outView = new DataView(out.buffer);
      outView.setUint32(0, h0, false); outView.setUint32(4, h1, false); outView.setUint32(8, h2, false); outView.setUint32(12, h3, false); outView.setUint32(16, h4, false);
      return out;
    }

    function hmacSha1(keyBytes, msgBytes) {
      var blockSize = 64;
      var k = keyBytes.length > blockSize ? sha1(keyBytes) : keyBytes;
      var ipad = new Uint8Array(blockSize + msgBytes.length);
      var opad = new Uint8Array(blockSize + 20);
      for (var i = 0; i < blockSize; i++) {
        var b = i < k.length ? k[i] : 0;
        ipad[i] = b ^ 0x36;
        opad[i] = b ^ 0x5c;
      }
      ipad.set(msgBytes, blockSize);
      opad.set(sha1(ipad), blockSize);
      return sha1(opad);
    }

    function computeTotp(secret, epochMs) {
      var xored = '';
      for (var i = 0; i < secret.length; i++) {
        xored += String.fromCharCode(secret.charCodeAt(i) ^ ((i % 33) + 9));
      }
      var keyBytes = new TextEncoder().encode(xored);
      var counter = Math.floor(epochMs / 30000);
      var block = new Uint8Array(8);
      var dv = new DataView(block.buffer);
      dv.setUint32(0, Math.floor(counter / 0x100000000), false);
      dv.setUint32(4, counter >>> 0, false);
      var h = hmacSha1(keyBytes, block);
      var o = h[h.length - 1] & 0x0f;
      var code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
      var str = String(code % 1000000);
      while (str.length < 6) str = '0' + str;
      return str;
    }

    var currentSecret = ',7/*F("rLJ2oxaKL^f+E1xvP@N';
    var currentVer = 61;
    var checking = false;

    function sendSuccess(token, name) {
      if (!token || window.__ftuneReportedToken === token) return;
      window.__ftuneReportedToken = token;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'spotify-success',
        token: token,
        name: name || ''
      }));
    }

    function tryMintToken() {
      if (checking || window.__ftuneReportedToken) return;
      var host = window.location.hostname || '';
      var path = window.location.pathname || '';

      // If accounts.spotify.com landed on /status after login, jump straight to open.spotify.com
      if (host.indexOf('accounts.spotify.com') !== -1 && path.indexOf('/status') !== -1) {
        window.location.replace('https://open.spotify.com/');
        return;
      }

      if (host.indexOf('open.spotify.com') === -1) return;

      checking = true;
      var code = computeTotp(currentSecret, Date.now());
      var url = 'https://open.spotify.com/api/token?reason=init&productType=web-player&totp=' + code + '&totpServer=' + code + '&totpVer=' + currentVer;

      fetch(url, { credentials: 'include' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.accessToken && data.isAnonymous === false) {
            sendSuccess(data.accessToken, '');
          } else if (data && data.totpVerExpired) {
            // Scrape updated secret from web-player bundle if Spotify rotated version
            var html = document.documentElement ? document.documentElement.innerHTML : '';
            var m = /https:\\/\\/open\\.spotifycdn\\.com\\/cdn\\/build\\/web-player\\/web-player\\.[0-9a-f]+\\.js/.exec(html);
            if (m && m[0]) {
              return fetch(m[0]).then(function(sr) { return sr.text(); }).then(function(script) {
                var re = /\\{secret:(['"])((?:\\\\.|(?!\\1).)*)\\1,version:(\\d+)\\}/g;
                var match, bestVer = -1, bestSec = '';
                while ((match = re.exec(script)) !== null) {
                  var v = parseInt(match[3], 10);
                  if (v > bestVer) { bestVer = v; bestSec = match[2]; }
                }
                if (bestVer > 0 && bestSec) {
                  currentVer = bestVer;
                  currentSecret = bestSec;
                }
              });
            }
          }
        })
        .catch(function() {})
        .finally(function() {
          checking = false;
        });
    }

    tryMintToken();
    setInterval(tryMintToken, 1200);
  })();
  true;
`;

const CustomWebView = WebView as any;

export const SpotifyLoginModal: React.FC<SpotifyLoginModalProps> = ({
  visible,
  initialTab = "login",
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"login" | "link" | "pc">(initialTab);
  const [loadingWeb, setLoadingWeb] = useState(true);
  const [extractingSession, setExtractingSession] = useState(false);

  // Connected & Borrow Picker state
  const [isConnected, setIsConnected] = useState(spotifyService.getStatus().connected);
  const [accountName, setAccountName] = useState(spotifyService.getStatus().name || "Spotify Listener");
  const [availablePlaylists, setAvailablePlaylists] = useState<SpotifyPlaylistInfo[]>(
    spotifyService.getPlaylists()
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshingList, setRefreshingList] = useState(false);
  const [borrowing, setBorrowing] = useState(false);
  const [borrowProgress, setBorrowProgress] = useState("");
  const [showSignInWebView, setShowSignInWebView] = useState(!spotifyService.getStatus().connected);

  // Import Link state
  const [publicUrl, setPublicUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // PC Sync state
  const [pcSyncing, setPcSyncing] = useState(false);

  const webViewRef = useRef<any>(null);
  const handledTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
      const st = spotifyService.getStatus();
      const lists = spotifyService.getPlaylists();
      setIsConnected(st.connected);
      setAccountName(st.name || "Spotify Listener");
      setAvailablePlaylists(lists);
      setShowSignInWebView(!st.connected);
      setExtractingSession(false);
      handledTokenRef.current = null;

      // Pre-select all playlists by default if none are borrowed yet
      if (lists.length > 0 && selectedIds.size === 0) {
        setSelectedIds(new Set(lists.map((p) => p.id)));
      }
    }
  }, [visible, initialTab]);

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === "spotify-success" && data.token) {
        if (handledTokenRef.current === data.token) return;
        handledTokenRef.current = data.token;
        setExtractingSession(true);

        const status = await spotifyService.setAuthSession({
          token: data.token,
          name: data.name,
        });
        const lists = spotifyService.getPlaylists();

        setIsConnected(status.connected);
        setAccountName(status.name || "Spotify Listener");
        setAvailablePlaylists(lists);
        // Select all by default so user can immediately borrow everyone or toggle individual ones
        setSelectedIds(new Set(lists.map((p) => p.id)));
        setExtractingSession(false);
        setShowSignInWebView(false);
      }
    } catch (e) {
      console.warn("[spotify-login] message error:", e);
      setExtractingSession(false);
    }
  };

  const handleNavigationChange = (navState: any) => {
    const url = navState?.url || "";
    // The instant Spotify redirects from accounts.spotify.com to open.spotify.com (or /status),
    // hide the raw webpage so it never acts like a normal browser opening spotify.com!
    if (
      url.includes("open.spotify.com") ||
      (url.includes("accounts.spotify.com") && url.includes("/status"))
    ) {
      setExtractingSession(true);
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === availablePlaylists.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availablePlaylists.map((p) => p.id)));
    }
  };

  const handleRefreshPlaylists = async () => {
    if (refreshingList) return;
    setRefreshingList(true);
    try {
      const lists = await spotifyService.refreshPlaylists();
      setAvailablePlaylists(lists);
      if (selectedIds.size === 0 && lists.length > 0) {
        setSelectedIds(new Set(lists.map((p) => p.id)));
      }
    } catch (e) {
      console.warn("[spotify-login] refresh error:", e);
    } finally {
      setRefreshingList(false);
    }
  };

  const handleBorrowPlaylists = async (idsToBorrow: string[]) => {
    if (idsToBorrow.length === 0 || borrowing) {
      Alert.alert("Select Playlists", "Choose at least one playlist or Liked Songs to borrow.");
      return;
    }

    setBorrowing(true);
    try {
      const result = await spotifyService.borrowPlaylists(idsToBorrow, (prog) => {
        setBorrowProgress(`Borrowing ${prog.current}/${prog.total}: ${prog.name}...`);
      });
      setBorrowProgress("");
      onSuccess({
        borrowed: result.borrowed,
        likedTracks: result.likedTracks,
      });
      onClose();
    } catch (err: any) {
      Alert.alert(
        "Borrow Failed",
        err?.message || "Could not borrow selected playlists from Spotify."
      );
    } finally {
      setBorrowing(false);
      setBorrowProgress("");
    }
  };

  const handleDisconnectAccount = async () => {
    await spotifyService.disconnect();
    setIsConnected(false);
    setAvailablePlaylists([]);
    setSelectedIds(new Set());
    setShowSignInWebView(true);
    handledTokenRef.current = null;
  };

  const handleImportPublicLink = async () => {
    if (!publicUrl.trim() || importing) return;
    setImporting(true);
    try {
      const savedPlaylist = await spotifyService.importAndBorrowLink(publicUrl.trim());
      setPublicUrl("");
      onSuccess({
        borrowed: [savedPlaylist],
        openPlaylist: savedPlaylist,
      });
      onClose();
    } catch (err: any) {
      Alert.alert(
        "Import Failed",
        err?.message || "Could not read this Spotify playlist or album link."
      );
    } finally {
      setImporting(false);
    }
  };

  const handleSyncPC = async () => {
    setPcSyncing(true);
    try {
      const playlists = await spotifyService.refreshPlaylists();
      if (playlists.length > 0) {
        setIsConnected(true);
        setAvailablePlaylists(playlists);
        setSelectedIds(new Set(playlists.map((p) => p.id)));
        setShowSignInWebView(false);
        setActiveTab("login");
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

  const allSelected =
    availablePlaylists.length > 0 && selectedIds.size === availablePlaylists.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {/* Sheet Grabber */}
        <View style={styles.grabberContainer}>
          <View style={styles.grabber} />
        </View>

        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <SpotifyIcon size={22} />
            <Text style={styles.headerTitle}>Library Fetch & Borrow</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
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
              {isConnected ? "Borrow Playlists" : "Spotify Login"}
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

          <TouchableOpacity
            style={[styles.subtab, activeTab === "pc" && styles.subtabActive]}
            onPress={() => setActiveTab("pc")}
          >
            <Text style={[styles.subtabText, activeTab === "pc" && styles.subtabTextActive]}>
              Sync PC
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: In-App Login OR Borrow Playlists & Liked Music Picker */}
        {activeTab === "login" && (
          <View style={styles.webContainer}>
            {showSignInWebView ? (
              <>
                {(loadingWeb || extractingSession) && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={SPOTIFY_GREEN} />
                    <Text style={styles.loadingTitle}>
                      {extractingSession
                        ? "Authenticated! Loading your playlists & Liked Songs..."
                        : "Loading Spotify Sign In..."}
                    </Text>
                    {extractingSession && (
                      <Text style={styles.loadingSub}>
                        Preparing your playlists so you can choose which ones to borrow
                      </Text>
                    )}
                  </View>
                )}

                <CustomWebView
                  ref={webViewRef}
                  source={{
                    uri: "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F",
                  }}
                  injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD_SCRIPT}
                  injectedJavaScript={INJECTED_AUTH_SCRIPT}
                  onMessage={handleWebViewMessage}
                  onNavigationStateChange={handleNavigationChange}
                  onLoadStart={(e: any) => handleNavigationChange(e?.nativeEvent)}
                  onLoadEnd={() => setLoadingWeb(false)}
                  onShouldStartLoadWithRequest={(req: any) => {
                    const url = req?.url || "";
                    // Prevent OS from hijacking spotify:// or intent:// links to external browser/app
                    if (!url.startsWith("https://") && !url.startsWith("http://") && !url.startsWith("about:")) {
                      return false;
                    }
                    if (url.includes("open.spotify.com")) {
                      setExtractingSession(true);
                    }
                    return true;
                  }}
                  setSupportMultipleWindows={false}
                  userAgent={DESKTOP_CHROME_UA}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  sharedCookiesEnabled={true}
                  thirdPartyCookiesEnabled={true}
                  style={{ flex: 1, backgroundColor: Colors.surface }}
                />
              </>
            ) : (
              /* BORROW PLAYLISTS & LIKED MUSIC PICKER */
              <View style={styles.borrowContainer}>
                {/* Account Status & Controls Row */}
                <View style={styles.accountBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accountTitle} numberOfLines={1}>
                      {accountName}
                    </Text>
                    <Text style={styles.accountSub}>
                      Choose any playlist or Liked Songs to borrow into your Library
                    </Text>
                  </View>

                  <View style={styles.accountActions}>
                    <TouchableOpacity
                      style={styles.iconPillBtn}
                      onPress={handleRefreshPlaylists}
                      disabled={refreshingList || borrowing}
                    >
                      <RefreshCw size={15} color={Colors.inkHi} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconPillBtn}
                      onPress={handleDisconnectAccount}
                      disabled={borrowing}
                    >
                      <LogOut size={15} color={Colors.inkDim} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Selection Header Row */}
                <View style={styles.selectHeaderRow}>
                  <Text style={styles.selectCountText}>
                    {selectedIds.size} of {availablePlaylists.length} selected
                  </Text>
                  <TouchableOpacity onPress={toggleSelectAll} activeOpacity={0.7}>
                    <Text style={styles.selectAllBtnText}>
                      {allSelected ? "Deselect All" : "Select All (Everyone)"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {refreshingList ? (
                  <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color={SPOTIFY_GREEN} />
                    <Text style={styles.loadingSub}>Fetching your Spotify library...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={availablePlaylists}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
                    renderItem={({ item }) => {
                      const isLiked = item.id === LIKED_ID;
                      const isChecked = selectedIds.has(item.id);
                      const alreadyBorrowed = spotifyService.isPlaylistBorrowed(item.id);

                      return (
                        <TouchableOpacity
                          style={[
                            styles.borrowRow,
                            isChecked && styles.borrowRowSelected,
                          ]}
                          activeOpacity={0.75}
                          onPress={() => toggleSelectId(item.id)}
                          disabled={borrowing}
                        >
                          {/* Artwork */}
                          <View style={styles.borrowThumbWrap}>
                            {isLiked ? (
                              <View style={styles.likedThumbBox}>
                                <Image
                                  source={{ uri: LIKED_SLEEVE }}
                                  style={styles.borrowThumb}
                                />
                                <View style={styles.likedHeartOverlay}>
                                  <Heart size={18} color="#fff" fill="#fff" />
                                </View>
                              </View>
                            ) : item.thumb ? (
                              <Image source={{ uri: item.thumb }} style={styles.borrowThumb} />
                            ) : (
                              <View style={[styles.borrowThumb, styles.placeholderBox]}>
                                <ListMusic size={20} color={Colors.inkDim} />
                              </View>
                            )}
                          </View>

                          {/* Info */}
                          <View style={styles.borrowInfo}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={styles.borrowTitle} numberOfLines={1}>
                                {item.name}
                              </Text>
                              {isLiked && (
                                <View style={styles.likedTag}>
                                  <Text style={styles.likedTagText}>LIKED</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.borrowMeta} numberOfLines={1}>
                              {isLiked
                                ? `Your Spotify Liked Music${item.total ? ` • ${item.total} songs` : ""}`
                                : `${item.owner ? `By ${item.owner}` : "Playlist"}${
                                    item.total ? ` • ${item.total} songs` : ""
                                  }`}
                              {alreadyBorrowed ? " • In Library" : ""}
                            </Text>
                          </View>

                          {/* Checkbox */}
                          <View
                            style={[
                              styles.checkbox,
                              isChecked && styles.checkboxActive,
                            ]}
                          >
                            {isChecked && <Check size={14} color="#000000" strokeWidth={3} />}
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}

                {/* Bottom Sticky Borrow Action Footer */}
                <View style={styles.borrowFooter}>
                  {borrowing ? (
                    <View style={styles.borrowingStatusBox}>
                      <ActivityIndicator size="small" color={SPOTIFY_GREEN} />
                      <Text style={styles.borrowingStatusText}>
                        {borrowProgress || "Borrowing playlists into your Library..."}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.borrowFooterBtns}>
                      <SpringTouchable
                        style={[
                          styles.borrowSelectedBtn,
                          selectedIds.size === 0 && { opacity: 0.45 },
                        ]}
                        disabled={selectedIds.size === 0}
                        onPress={() => handleBorrowPlaylists(Array.from(selectedIds))}
                      >
                        <Download size={16} color="#000000" style={{ marginRight: 6 }} />
                        <Text style={styles.borrowSelectedBtnText}>
                          {allSelected
                            ? `Borrow All (${availablePlaylists.length})`
                            : `Borrow Selected (${selectedIds.size})`}
                        </Text>
                      </SpringTouchable>

                      {!allSelected && availablePlaylists.length > 1 && (
                        <SpringTouchable
                          style={styles.borrowAllSecondaryBtn}
                          onPress={() =>
                            handleBorrowPlaylists(availablePlaylists.map((p) => p.id))
                          }
                        >
                          <Text style={styles.borrowAllSecondaryText}>Borrow Everyone</Text>
                        </SpringTouchable>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {/* TAB 2: Import Public Link */}
        {activeTab === "link" && (
          <View style={styles.formContainer}>
            <View style={styles.pcHeroCard}>
              <Link2 size={40} color={SPOTIFY_GREEN} />
              <Text style={styles.pcHeroTitle}>Import Spotify Link</Text>
              <Text style={styles.pcHeroSubtitle}>
                Paste any Spotify playlist, album, or share link below. FTune will fetch all tracks and borrow it directly into your Library!
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
                  onSubmitEditing={handleImportPublicLink}
                />
                {publicUrl.length > 0 && (
                  <TouchableOpacity onPress={() => setPublicUrl("")} style={{ padding: 4 }}>
                    <X size={16} color={Colors.inkDim} />
                  </TouchableOpacity>
                )}
              </View>

              <SpringTouchable
                style={[
                  styles.primaryActionBtn,
                  (importing || !publicUrl.trim()) && { opacity: 0.6 },
                ]}
                onPress={handleImportPublicLink}
                disabled={importing || !publicUrl.trim()}
              >
                {importing ? (
                  <>
                    <ActivityIndicator size="small" color="#000000" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryActionBtnText}>Importing into Library...</Text>
                  </>
                ) : (
                  <>
                    <ExternalLink size={18} color="#000000" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryActionBtnText}>Import & Borrow Playlist</Text>
                  </>
                )}
              </SpringTouchable>
            </View>
          </View>
        )}

        {/* TAB 3: Sync from PC */}
        {activeTab === "pc" && (
          <View style={styles.formContainer}>
            <View style={styles.pcHeroCard}>
              <Laptop size={44} color={Colors.inkHi} />
              <Text style={styles.pcHeroTitle}>Sync with FTune Desktop</Text>
              <Text style={styles.pcHeroSubtitle}>
                {isServerConnected()
                  ? "Your phone is connected to FTune on PC! Tap below to load your PC's Spotify playlists and choose which ones to borrow."
                  : "Connect your phone to FTune Desktop on the same Wi-Fi network to sync your PC's Spotify playlists."}
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
                    <Text style={styles.primaryActionBtnText}>Fetch Playlists from PC</Text>
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
    fontSize: 18,
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
    fontWeight: "700",
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
    backgroundColor: Colors.base,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    zIndex: 20,
  },
  loadingTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "700",
    color: Colors.inkHi,
    textAlign: "center",
  },
  loadingSub: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.inkDim,
    textAlign: "center",
    lineHeight: 18,
  },
  borrowContainer: {
    flex: 1,
  },
  accountBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  accountTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.inkHi,
  },
  accountSub: {
    fontSize: 12,
    color: Colors.inkDim,
    marginTop: 2,
  },
  accountActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 10,
  },
  iconPillBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  selectHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  selectCountText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: Colors.inkDim,
  },
  selectAllBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: SPOTIFY_GREEN,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  borrowRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  borrowRowSelected: {
    borderColor: SPOTIFY_GREEN,
    backgroundColor: "rgba(30, 215, 96, 0.08)",
  },
  borrowThumbWrap: {
    width: 50,
    height: 50,
    borderRadius: 10,
    overflow: "hidden",
    marginRight: 12,
  },
  borrowThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  likedThumbBox: {
    width: 50,
    height: 50,
    position: "relative",
  },
  likedHeartOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(30, 215, 96, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderBox: {
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  borrowInfo: {
    flex: 1,
    marginRight: 10,
  },
  borrowTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: Colors.inkHi,
    flexShrink: 1,
  },
  likedTag: {
    backgroundColor: "rgba(30, 215, 96, 0.18)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  likedTagText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: SPOTIFY_GREEN,
  },
  borrowMeta: {
    fontSize: 12,
    color: Colors.inkDim,
    marginTop: 3,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.inkDim,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: SPOTIFY_GREEN,
    borderColor: SPOTIFY_GREEN,
  },
  borrowFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.hairline,
  },
  borrowingStatusBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 10,
  },
  borrowingStatusText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.inkHi,
  },
  borrowFooterBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  borrowSelectedBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPOTIFY_GREEN,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  borrowSelectedBtnText: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#000000",
  },
  borrowAllSecondaryBtn: {
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  borrowAllSecondaryText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: Colors.inkHi,
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
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  urlInput: {
    flex: 1,
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
