import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Wifi, X, CheckCircle, AlertCircle, RefreshCw, Laptop } from "lucide-react-native";
import { Colors } from "../theme/colors";
import { pingServer, setServerAddress, autoDiscover, getServerUrl } from "../services/api";

interface ConnectModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected: (hostname: string) => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({ visible, onClose, onConnected }) => {
  const [ipInput, setIpInput] = useState(
    getServerUrl().replace(/^https?:\/\//, "").split(":")[0] || "192.168.0.120"
  );
  const [portInput, setPortInput] = useState("8765");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);

  React.useEffect(() => {
    if (visible) {
      const cur = getServerUrl().replace(/^https?:\/\//, "").split(":")[0];
      if (cur) setIpInput(cur);
    }
  }, [visible]);

  const handleTestConnect = async () => {
    if (!ipInput.trim()) return;
    setLoading(true);
    setStatusMessage("Connecting to PC...");
    setIsSuccess(null);

    const target = `http://${ipInput.trim()}:${portInput.trim() || "8765"}`;
    const info = await pingServer(target);
    setLoading(false);

    if (info) {
      setIsSuccess(true);
      setStatusMessage(`Connected to ${info.hostname || "FTune PC"}!`);
      await setServerAddress(target);
      setTimeout(() => {
        onConnected(info.hostname);
        onClose();
      }, 1000);
    } else {
      setIsSuccess(false);
      setStatusMessage("Could not connect. Make sure FTune is running on PC and both devices are on the same Wi-Fi.");
    }
  };

  const handleAutoScan = async () => {
    setLoading(true);
    setStatusMessage("Scanning local Wi-Fi for FTune PC...");
    setIsSuccess(null);

    const found = await autoDiscover();
    setLoading(false);

    if (found) {
      const cleanIp = found.replace(/^https?:\/\//, "").split(":")[0];
      setIpInput(cleanIp);
      setIsSuccess(true);
      setStatusMessage("Found FTune PC!");
      const info = await pingServer(found);
      setTimeout(() => {
        onConnected(info?.hostname || "FTune PC");
        onClose();
      }, 1000);
    } else {
      setIsSuccess(false);
      setStatusMessage("Auto-scan didn't find FTune. Please enter your PC's IP address manually.");
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Laptop size={20} color={Colors.accent} />
              <Text style={styles.title}>Connect to FTune PC</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Enter your PC's local IP address (shown in FTune on your computer) or click Auto-Scan.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PC IP Address</Text>
            <View style={styles.rowInputs}>
              <TextInput
                style={styles.ipInput}
                value={ipInput}
                onChangeText={setIpInput}
                placeholder="192.168.1.100"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.portInput}
                value={portInput}
                onChangeText={setPortInput}
                placeholder="8765"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
            </View>
          </View>

          {statusMessage && (
            <View style={[styles.statusBox, isSuccess ? styles.statusSuccess : styles.statusError]}>
              {isSuccess ? (
                <CheckCircle size={16} color={Colors.success} />
              ) : (
                <AlertCircle size={16} color={Colors.danger} />
              )}
              <Text style={[styles.statusText, isSuccess ? styles.textSuccess : styles.textError]}>
                {statusMessage}
              </Text>
            </View>
          )}

          <View style={styles.buttonCol}>
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={handleTestConnect}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.primaryButtonText}>Connect to PC</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, loading && styles.disabledButton]}
              onPress={handleAutoScan}
              disabled={loading}
            >
              <RefreshCw size={16} color={Colors.textPrimary} />
              <Text style={styles.secondaryButtonText}>Auto-Scan Local Wi-Fi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  description: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textMuted,
    marginBottom: 6,
  },
  rowInputs: {
    flexDirection: "row",
    gap: 8,
  },
  ipInput: {
    flex: 3,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  portInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
    textAlign: "center",
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  statusSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  statusError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  statusText: {
    fontSize: 12,
    flex: 1,
  },
  textSuccess: {
    color: Colors.success,
  },
  textError: {
    color: Colors.danger,
  },
  buttonCol: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    flexDirection: "row",
    backgroundColor: Colors.surfaceHover,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
});

