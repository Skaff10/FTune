import React, { useEffect, useRef } from "react";
import {
  Animated,
  View,
  StyleSheet,
  TouchableOpacity,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { Heart } from "lucide-react-native";
import { Colors } from "../theme/colors";

/**
 * Animated Equalizer Bars (EqBars)
 * 3 dynamic audio bars that dance when music is playing, matching PC Ftune EqBars.
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
  const bar1 = useRef(new Animated.Value(0.3)).current;
  const bar2 = useRef(new Animated.Value(0.7)).current;
  const bar3 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!animating) {
      bar1.setValue(0.3);
      bar2.setValue(0.5);
      bar3.setValue(0.3);
      return;
    }

    const animateBar = (val: Animated.Value, minVal: number, maxVal: number, duration: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: maxVal,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: minVal,
            duration: duration * 0.9,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = animateBar(bar1, 0.25, 1.0, 380);
    const anim2 = animateBar(bar2, 0.35, 1.0, 310);
    const anim3 = animateBar(bar3, 0.2, 0.9, 440);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [animating]);

  const barWidth = Math.max(2.2, size * 0.18);
  const gap = Math.max(1.8, size * 0.14);

  return (
    <View style={[styles.eqContainer, { height: size, width: barWidth * 3 + gap * 2 }]}>
      <Animated.View
        style={[
          styles.eqBar,
          {
            backgroundColor: color,
            width: barWidth,
            transform: [{ scaleY: bar1 }],
          },
        ]}
      />
      <View style={{ width: gap }} />
      <Animated.View
        style={[
          styles.eqBar,
          {
            backgroundColor: color,
            width: barWidth,
            transform: [{ scaleY: bar2 }],
          },
        ]}
      />
      <View style={{ width: gap }} />
      <Animated.View
        style={[
          styles.eqBar,
          {
            backgroundColor: color,
            width: barWidth,
            transform: [{ scaleY: bar3 }],
          },
        ]}
      />
    </View>
  );
};

/**
 * Animated Heart / Favorite Button
 * Pops and springs when toggled, matching PC's pip-like-pop effect.
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
  activeColor = "#FA2D48", // Apple Music heart red
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    // Spring pop animation
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.45,
        friction: 3,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1.0,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();

    onPress();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Heart
          size={size}
          color={isFavorite ? activeColor : color}
          fill={isFavorite ? activeColor : "none"}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

/**
 * SpringTouchable
 * Apple HIG compliant button wrapper that gives immediate tactile spring feedback.
 */
interface SpringTouchableProps {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  activeScale?: number;
  disabled?: boolean;
}

export const SpringTouchable: React.FC<SpringTouchableProps> = ({
  onPress,
  style,
  children,
  activeScale = 0.95,
  disabled = false,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: activeScale,
      speed: 24,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      speed: 18,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
};

/**
 * Ambient Glow Background
 * Creates an Apple Music style soft glow wash around heroes & cards.
 */
interface AmbientGlowProps {
  color?: string;
  intensity?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const AmbientGlow: React.FC<AmbientGlowProps> = ({
  color = "rgba(139, 92, 246, 0.25)",
  intensity = 0.2,
  children,
  style,
}) => {
  return (
    <View style={[styles.glowContainer, style]}>
      <View
        style={[
          styles.glowWash,
          {
            backgroundColor: color,
            opacity: intensity,
          },
        ]}
      />
      {children}
    </View>
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
  glowContainer: {
    position: "relative",
  },
  glowWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
  },
});
