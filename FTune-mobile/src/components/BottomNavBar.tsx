import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Home, Search, Library, Download } from "lucide-react-native";
import { Colors } from "../theme/colors";

export type TabKey = "home" | "search" | "library" | "offline";

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
          color={activeTab === "home" ? "#ffffff" : Colors.textMuted}
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
          color={activeTab === "search" ? "#ffffff" : Colors.textMuted}
        />
        <Text style={[styles.tabLabel, activeTab === "search" && styles.tabLabelActive]}>
          Search
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onSelectTab("library")}
        activeOpacity={0.7}
      >
        <Library
          size={21}
          color={activeTab === "library" ? "#ffffff" : Colors.textMuted}
        />
        <Text style={[styles.tabLabel, activeTab === "library" && styles.tabLabelActive]}>
          Playlists
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onSelectTab("offline")}
        activeOpacity={0.7}
      >
        <Download
          size={21}
          color={activeTab === "offline" ? "#ffffff" : Colors.textMuted}
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
    backgroundColor: "#0d0d10",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 8,
    justifyContent: "space-around",
    alignItems: "center",
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textMuted,
    marginTop: 4,
  },
  tabLabelActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
