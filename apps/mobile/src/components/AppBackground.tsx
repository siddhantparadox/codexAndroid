import { LinearGradient } from "expo-linear-gradient";
import React, { type PropsWithChildren } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import type { Theme } from "../theme/tokens";
import { space } from "../theme/tokens";

export function AppBackground({
  theme,
  children
}: PropsWithChildren<{ theme: Theme }>): React.ReactElement {
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <LinearGradient
        colors={[
          theme.bg,
          theme.mode === "carbon" ? "#0C0F15" : "#F7F0E6",
          theme.bg
        ]}
        start={{ x: 0.1, y: 0.05 }}
        end={{ x: 0.9, y: 0.95 }}
        style={StyleSheet.absoluteFill}
      />

      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        style={[
          StyleSheet.absoluteFill,
          { opacity: theme.mode === "carbon" ? 0.1 : 0.06 }
        ]}
      >
        {Array.from({ length: 60 }).map((_, index) => {
          const step = 24;
          const x = index * step;
          return (
            <Line
              key={`v-${index}`}
              x1={x}
              y1="0"
              x2={x}
              y2="100%"
              stroke={theme.hairline}
              strokeWidth="1"
            />
          );
        })}
        {Array.from({ length: 120 }).map((_, index) => {
          const step = 24;
          const y = index * step;
          return (
            <Line
              key={`h-${index}`}
              x1="0"
              y1={y}
              x2="100%"
              y2={y}
              stroke={theme.hairline}
              strokeWidth="1"
            />
          );
        })}
      </Svg>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? space.x6 : space.x8
  }
});
