import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { X, RefreshCw, LogOut, User } from "lucide-react-native";
import { Colors } from "../theme/colors";
import { cloudAccountService } from "../services/cloudAccount";
import type { CloudSyncStatus, PCPlaylist, Track } from "../types";

interface AccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSyncComplete: (data: { playlists: PCPlaylist[]; favorites: Track[] }) => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  visible,
  onClose,
  onSyncComplete,
}) => {
  const [status, setStatus] = useState<CloudSyncStatus>(cloudAccountService.getStatus());
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = cloudAccountService.subscribe((st) => {
      setStatus(st);
    });
    return unsub;
  }, []);

  const handleSubmit = async () => {
    if (!username.trim() || !password || submitting) return;
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await cloudAccountService.signIn(username, password);
      } else {
        await cloudAccountService.signUp(username, password);
      }
      setPassword("");
      onClose();
    } catch (err: any) {
      Alert.alert(
        mode === "signin" ? "Sign In Failed" : "Sign Up Failed",
        err?.message || "Please check your details and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      const res = await cloudAccountService.syncNow("merge");
      onSyncComplete(res);
      Alert.alert("Synced", "Playlists and Liked Songs are up to date.");
    } catch (err: any) {
      Alert.alert("Sync Failed", err?.message || "Could not sync right now.");
    }
  };

  const handleSignOut = async () => {
    await cloudAccountService.signOut();
    onSyncComplete({ playlists: [], favorites: [] });
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {status.signedIn ? "Account" : mode === "signin" ? "Sign In" : "Create Account"}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color={Colors.inkDim} />
            </TouchableOpacity>
          </View>

          {status.signedIn && status.user ? (
            <View style={styles.signedInBody}>
              <View style={styles.profileRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(status.user.username?.[0] || "U").toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{status.user.displayName}</Text>
                  <Text style={styles.userHandle}>@{status.user.username}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, status.syncing && { opacity: 0.7 }]}
                activeOpacity={0.75}
                onPress={handleSyncNow}
                disabled={status.syncing}
              >
                {status.syncing ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <RefreshCw size={16} color="#000" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryBtnText}>Sync Now</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.signOutBtn}
                activeOpacity={0.75}
                onPress={handleSignOut}
                disabled={status.syncing}
              >
                <LogOut size={15} color={Colors.danger} style={{ marginRight: 8 }} />
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formBody}>
              <View style={styles.modeTabs}>
                <TouchableOpacity
                  style={[styles.modeTab, mode === "signin" && styles.modeTabActive]}
                  onPress={() => setMode("signin")}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      mode === "signin" && styles.modeTabTextActive,
                    ]}
                  >
                    Sign In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeTab, mode === "signup" && styles.modeTabActive]}
                  onPress={() => setMode("signup")}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      mode === "signup" && styles.modeTabTextActive,
                    ]}
                  >
                    Create Account
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                placeholder={mode === "signin" ? "Username or email" : "Username"}
                placeholderTextColor={Colors.inkDim}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={Colors.inkDim}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={true}
                onSubmitEditing={handleSubmit}
              />

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (!username.trim() || !password || submitting) && { opacity: 0.5 },
                ]}
                activeOpacity={0.75}
                onPress={handleSubmit}
                disabled={!username.trim() || !password || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <User size={16} color="#000" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryBtnText}>
                      {mode === "signin" ? "Sign In" : "Create Account"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#111113",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.inkHi,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  formBody: {
    gap: 12,
  },
  modeTabs: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    padding: 3,
    marginBottom: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  modeTabActive: {
    backgroundColor: Colors.inkHi,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.inkDim,
  },
  modeTabTextActive: {
    color: "#000000",
    fontWeight: "700",
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: Colors.inkHi,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.inkHi,
    borderRadius: 999,
    paddingVertical: 13,
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#000000",
  },
  signedInBody: {
    gap: 12,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
    marginBottom: 4,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.inkHi,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#000000",
  },
  userName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.inkHi,
  },
  userHandle: {
    fontSize: 13,
    color: Colors.inkDim,
    marginTop: 1,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.danger,
  },
});
