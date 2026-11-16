import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/** Matches PC CoverGlow (Ftune-pc/src/components/CoverGlow.tsx): 600ms crossfade. */
export const GLOW_FADE_MS = 600;

interface GlowLayer {
  id: number;
  url: string;
  opacity: Animated.Value;
}

interface CoverGlowProps {
  url: string | null | undefined;
  playing?: boolean;
  height?: number;
}

/**
 * Top-of-panel cover glow matching the PC version:
 * - Stretches and heavily blurs the playing cover across the top band
 * - Crossfades each new cover smoothly over the previous one (600ms)
 * - Fades cleanly down into the pure black #000000 canvas with zero hard edges
 */
export const CoverGlow: React.FC<CoverGlowProps> = ({
  url,
  playing = false,
  height = 330,
}) => {
  const normalizedUrl = url && url.trim() ? url.trim() : null;
  const [layers, setLayers] = useState<GlowLayer[]>(() =>
    normalizedUrl ? [{ id: 0, url: normalizedUrl, opacity: new Animated.Value(0.88) }] : []
  );
  const currentUrlRef = useRef<string | null>(normalizedUrl);
  const nextIdRef = useRef(1);
  const driftX = useRef(new Animated.Value(0)).current;
  const driftScale = useRef(new Animated.Value(1)).current;

  // Subtle living drift while music plays, settling smoothly when paused
  useEffect(() => {
    if (!playing) {
      Animated.parallel([
        Animated.timing(driftX, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(driftScale, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    const xAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(driftX, {
          toValue: 10,
          duration: 6500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(driftX, {
          toValue: -10,
          duration: 6500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const sAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(driftScale, {
          toValue: 1.06,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(driftScale, {
          toValue: 1.0,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    xAnim.start();
    sAnim.start();
    return () => {
      xAnim.stop();
      sAnim.stop();
    };
  }, [playing]);

  // Crossfade in new cover layer over previous, or fade all out when null
  useEffect(() => {
    if (normalizedUrl === currentUrlRef.current) return;
    currentUrlRef.current = normalizedUrl;

    if (!normalizedUrl) {
      setLayers((prev) => {
        for (const l of prev) {
          Animated.timing(l.opacity, {
            toValue: 0,
            duration: GLOW_FADE_MS,
            easing: Easing.ease,
            useNativeDriver: true,
          }).start();
        }
        return prev;
      });
      const timer = setTimeout(() => setLayers([]), GLOW_FADE_MS + 40);
      return () => clearTimeout(timer);
    }

    const newOpacity = new Animated.Value(0);
    const newLayer: GlowLayer = {
      id: nextIdRef.current++,
      url: normalizedUrl,
      opacity: newOpacity,
    };

    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top?.url === normalizedUrl) return prev;
      return top ? [top, newLayer] : [newLayer];
    });

    Animated.timing(newOpacity, {
      toValue: 0.88,
      duration: GLOW_FADE_MS,
      easing: Easing.ease,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      setLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev));
    }, GLOW_FADE_MS + 40);

    return () => clearTimeout(timer);
  }, [normalizedUrl]);

  if (layers.length === 0) return null;

  return (
    <View pointerEvents="none" style={[styles.container, { height }]}>
      <Animated.View
        style={[
          styles.driftWrap,
          {
            transform: [{ translateX: driftX }, { scale: driftScale }],
          },
        ]}
      >
        {layers.map((layer) => (
          <Animated.View
            key={layer.id}
            style={[styles.layer, { opacity: layer.opacity }]}
          >
            <Image
              source={{ uri: layer.url }}
              style={styles.artImage}
              resizeMode="cover"
              blurRadius={Platform.OS === "android" ? 42 : 70}
            />
          </Animated.View>
        ))}
      </Animated.View>

      {/* Smooth vertical fade mask matching PC .cover-glow mask-image */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="coverGlowMask" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity="0.34" />
            <Stop offset="0.32" stopColor="#000000" stopOpacity="0.48" />
            <Stop offset="0.65" stopColor="#000000" stopOpacity="0.80" />
            <Stop offset="1" stopColor="#000000" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#coverGlowMask)" />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    zIndex: 0,
  },
  driftWrap: {
    position: "absolute",
    top: -48,
    left: -48,
    right: -48,
    bottom: -48,
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
  artImage: {
    width: "100%",
    height: "100%",
  },
});
