import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Home, Search, Library, Download } from "lucide-react-native";
import { Colors } from "../theme/colors";
import { SpotifyIcon, SPOTIFY_GREEN } from "./SpotifyIcon";

export type TabKey = "home" | "search" | "spotify" | "library" | "offline";

interface BottomNavBarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  bottomInset: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onSelectTab,
  bottomInset,
}) => {
  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, 10) }]}>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => onSelectTab("home")}
        activeOpacity={0.7}
      >
        <Home
          size={21}
          color={activeTab === "home" ? Colors.inkHi : Colors.inkDim}
        />
        <Text style={[styles.tabLabel, activeTab === "home" && styles.tabLabelActive]}>
          Home
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onSelectTab("search")}
        activeOpacity={0.7}
      >
        <Search
          size={21}
          color={activeTab === "search" ? Colors.inkHi : Colors.inkDim}
        />
        <Text style={[styles.tabLabel, activeTab === "search" && styles.tabLabelActive]}>
          Search
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onSelectTab("spotify")}
        activeOpacity={0.7}
      >
        <SpotifyIcon
          size={21}
          color={activeTab === "spotify" ? SPOTIFY_GREEN : Colors.inkDim}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === "spotify" && [styles.tabLabelActive, { color: SPOTIFY_GREEN }],
          ]}
        >
          Spotify
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onSelectTab("library")}
        activeOpacity={0.7}
      >
        <Library
          size={21}
          color={activeTab === "library" ? Colors.inkHi : Colors.inkDim}
        />
        <Text style={[styles.tabLabel, activeTab === "library" && styles.tabLabelActive]}>
          Library
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onSelectTab("offline")}
        activeOpacity={0.7}
      >
        <Download
          size={21}
          color={activeTab === "offline" ? Colors.inkHi : Colors.inkDim}
        />
        <Text style={[styles.tabLabel, activeTab === "offline" && styles.tabLabelActive]}>
          Offline
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: Colors.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.hairline,
    paddingTop: 8,
    justifyContent: "space-around",
    alignItems: "center",
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingVertical: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.inkDim,
    marginTop: 3,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: Colors.inkHi,
    fontWeight: "700",
  },
});
