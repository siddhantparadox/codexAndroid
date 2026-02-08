import React, { type PropsWithChildren } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import type { Theme } from "../theme/tokens";
import { radii, space } from "../theme/tokens";

export function IndexCard({
  theme,
  tilt = 0,
  accent,
  style,
  children
}: PropsWithChildren<{
  theme: Theme;
  tilt?: number;
  accent?: "acid" | "cyan" | "amber" | "danger";
  style?: ViewStyle;
}>): React.ReactElement {
  const accentColor = accent ? theme[accent] : undefined;

  return (
    <View style={[styles.wrap, { transform: [{ rotate: `${tilt}deg` }] }, style]}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardHairline }]}>
        <View
          style={[
            styles.rail,
            {
              backgroundColor: accentColor ?? theme.cardHairline,
              opacity: accentColor ? 0.9 : 1
            }
          ]}
        />
        <View style={styles.inner}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8
  },
  rail: { width: 6 },
  inner: { flex: 1, padding: space.x4, gap: space.x2 }
});
