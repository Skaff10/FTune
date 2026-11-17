import React, { useState, useRef } from "react";
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
import { X, CheckCircle, AlertCircle, RefreshCw, Laptop } from "lucide-react-native";
import { Colors } from "../theme/colors";
import {
  pingServer,
  setServerAddress,
  autoDiscover,
  cancelAutoDiscover,
  getServerUrl,
} from "../services/api";

interface ConnectModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected: (hostname: string) => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({ visible, onClose, onConnected }) => {
  const [ipInput, setIpInput] = useState(
    getServerUrl().replace(/^https?:\/\//, "").split(":")[0] || ""
  );
  const [portInput, setPortInput] = useState("8765");
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scanAbortRef.current?.abort();
    };
  }, []);

  const stopScan = () => {
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
      scanAbortRef.current = null;
    }
    cancelAutoDiscover();
    setScanning(false);
  };

  const runAutoScan = async () => {
    stopScan();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanning(true);
    setStatusMessage("Scanning local Wi-Fi for FTune PC...");
    setIsSuccess(null);

    const found = await autoDiscover({ signal: controller.signal });
    if (!mountedRef.current || controller.signal.aborted) return;

    setScanning(false);
    if (scanAbortRef.current === controller) {
      scanAbortRef.current = null;
    }

    if (found) {
      const cleanIp = found.replace(/^https?:\/\//, "").split(":")[0];
      setIpInput(cleanIp);
      setIsSuccess(true);
      setStatusMessage("Found FTune PC!");
      const info = await pingServer(found, 800);
      if (!mountedRef.current || controller.signal.aborted) return;
      onConnected(info?.hostname || "FTune PC");
      onClose();
    } else {
      setIsSuccess(false);
      setStatusMessage("FTune PC not found automatically. Enter your PC's IP address above.");
    }
  };

  React.useEffect(() => {
    if (visible) {
      const cur = getServerUrl().replace(/^https?:\/\//, "").split(":")[0];
      if (cur) setIpInput(cur);
      setConnecting(false);
      setStatusMessage(null);
      setIsSuccess(null);
      void runAutoScan();
    } else {
      stopScan();
    }
  }, [visible]);

  const handleTestConnect = async () => {
    if (!ipInput.trim() || connecting) return;
    stopScan();
    setConnecting(true);
    setStatusMessage("Connecting to PC...");
    setIsSuccess(null);

    const target = `http://${ipInput.trim()}:${portInput.trim() || "8765"}`;
    const info = await pingServer(target, 1200);
    if (!mountedRef.current) return;
    setConnecting(false);

    if (info) {
      setIsSuccess(true);
      setStatusMessage(`Connected to ${info.hostname || "FTune PC"}!`);
      await setServerAddress(target);
      onConnected(info.hostname);
      onClose();
    } else {
      setIsSuccess(false);
      setStatusMessage(
        "Could not connect. Make sure FTune is running on PC and both devices are on the same Wi-Fi."
      );
    }
  };

  const handleClose = () => {
    stopScan();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={handleClose}>
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
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Enter your PC's local IP address (shown in FTune on your computer) or scan Wi-Fi.
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
            <View
              style={[
                styles.statusBox,
                isSuccess === true
                  ? styles.statusSuccess
                  : isSuccess === false
                  ? styles.statusError
                  : styles.statusPending,
              ]}
            >
              {isSuccess === true ? (
                <CheckCircle size={16} color={Colors.success} />
              ) : isSuccess === false ? (
                <AlertCircle size={16} color={Colors.danger} />
              ) : (
                <ActivityIndicator size="small" color={Colors.accent} />
              )}
              <Text
                style={[
                  styles.statusText,
                  isSuccess === true
                    ? styles.textSuccess
                    : isSuccess === false
                    ? styles.textError
                    : styles.textPending,
                ]}
              >
                {statusMessage}
              </Text>
            </View>
          )}

          <View style={styles.buttonCol}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (connecting || !ipInput.trim()) && styles.disabledButton,
              ]}
              onPress={handleTestConnect}
              disabled={connecting || !ipInput.trim()}
            >
              {connecting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.primaryButtonText}>Connect to PC</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, (connecting || scanning) && styles.disabledButton]}
              onPress={() => void runAutoScan()}
              disabled={connecting || scanning}
            >
              {scanning ? (
                <ActivityIndicator size="small" color={Colors.textPrimary} />
              ) : (
                <RefreshCw size={16} color={Colors.textPrimary} />
              )}
              <Text style={styles.secondaryButtonText}>
                {scanning ? "Scanning Wi-Fi..." : "Auto-Scan Local Wi-Fi"}
              </Text>
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
  statusPending: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
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
  textPending: {
    color: Colors.textSecondary,
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

