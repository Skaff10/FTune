import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet, TouchableOpacity } from "react-native";
import { Heart } from "lucide-react-native";
import { Colors } from "../theme/colors";

/**
 * Lightweight Equalizer Bars (EqBars)
 */
interface EqBarsProps {
  color?: string;
  size?: number;
  animating?: boolean;
}

export const EqBars: React.FC<EqBarsProps> = ({
  color = Colors.inkHi,
  size = 14,
  animating = true,
}) => {
  const bar1 = useRef(new Animated.Value(0.35)).current;
  const bar2 = useRef(new Animated.Value(0.75)).current;
  const bar3 = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (!animating) {
      bar1.setValue(0.3);
      bar2.setValue(0.5);
      bar3.setValue(0.3);
      return;
    }

    const animateBar = (val: Animated.Value, minVal: number, maxVal: number, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: maxVal, duration, useNativeDriver: true }),
          Animated.timing(val, { toValue: minVal, duration: duration * 0.9, useNativeDriver: true }),
        ])
      );

    const a1 = animateBar(bar1, 0.25, 1.0, 380);
    const a2 = animateBar(bar2, 0.35, 1.0, 310);
    const a3 = animateBar(bar3, 0.2, 0.9, 440);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [animating]);

  const barWidth = Math.max(2, size * 0.18);
  const gap = Math.max(1.5, size * 0.14);

  return (
    <View style={[styles.eqContainer, { height: size, width: barWidth * 3 + gap * 2 }]}>
      <Animated.View
        style={[styles.eqBar, { backgroundColor: color, width: barWidth, transform: [{ scaleY: bar1 }] }]}
      />
      <View style={{ width: gap }} />
      <Animated.View
        style={[styles.eqBar, { backgroundColor: color, width: barWidth, transform: [{ scaleY: bar2 }] }]}
      />
      <View style={{ width: gap }} />
      <Animated.View
        style={[styles.eqBar, { backgroundColor: color, width: barWidth, transform: [{ scaleY: bar3 }] }]}
      />
    </View>
  );
};

/**
 * Crisp Favorite Heart Button (zero tap delay)
 */
interface AnimatedHeartProps {
  isFavorite: boolean;
  onPress: () => void;
  size?: number;
  color?: string;
  activeColor?: string;
}

export const AnimatedHeart: React.FC<AnimatedHeartProps> = ({
  isFavorite,
  onPress,
  size = 18,
  color = Colors.inkDim,
  activeColor = "#FA2D48",
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.65}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Heart
        size={size}
        color={isFavorite ? activeColor : color}
        fill={isFavorite ? activeColor : "none"}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  eqContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  eqBar: {
    height: "100%",
    borderRadius: 1.5,
  },
});
