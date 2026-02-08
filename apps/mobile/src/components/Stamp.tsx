import React from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import type { Theme } from "../theme/tokens";
import { radii, space } from "../theme/tokens";
import { Typo } from "./Typo";

export function Stamp({
  theme,
  kind,
  visible,
  reducedMotion
}: {
  theme: Theme;
  kind: "approved" | "declined";
  visible: boolean;
  reducedMotion?: boolean;
}): React.ReactElement {
  const color = kind === "approved" ? theme.acid : theme.danger;
  const opacity = useSharedValue(visible ? 1 : 0);
  const scale = useSharedValue(visible ? 1 : reducedMotion ? 1 : 2.2);

  React.useEffect(() => {
    if (reducedMotion) {
      opacity.value = withTiming(visible ? 1 : 0, { duration: 160 });
      scale.value = withTiming(1, { duration: 160 });
      return;
    }

    opacity.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 140 : 120
    });
    scale.value = withSpring(visible ? 1 : 2.2, {
      damping: 12,
      stiffness: 220,
      mass: 0.7
    });
  }, [opacity, reducedMotion, scale, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: "-12deg" }]
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.stamp, { borderColor: color }, animatedStyle]}
    >
      <Typo theme={theme} variant="heading" weight="display" style={{ color }}>
        {kind === "approved" ? "APPROVED" : "DECLINED"}
      </Typo>
      <Typo theme={theme} variant="micro" tone="muted" style={{ marginTop: 2 }}>
        codex mobile
      </Typo>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    position: "absolute",
    right: space.x5,
    top: space.x5,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderRadius: radii.cardInner,
    borderWidth: 2,
    backgroundColor: "rgba(0,0,0,0.05)"
  }
});
