import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Home, Search, Library } from "lucide-react-native";
import { Colors } from "../theme/colors";

export type TabKey = "home" | "search" | "library";

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#08080A",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.10)",
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
