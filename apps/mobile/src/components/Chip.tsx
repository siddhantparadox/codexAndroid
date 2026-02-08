import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Theme } from "../theme/tokens";
import { radii, space } from "../theme/tokens";
import { Typo } from "./Typo";

export function Chip({
  theme,
  label,
  selected,
  tone = "paper",
  onPress
}: {
  theme: Theme;
  label: string;
  selected?: boolean;
  tone?: "paper" | "ink";
  onPress?: () => void;
}): React.ReactElement {
  const bg = selected ? theme.acid : tone === "paper" ? theme.cardAlt : theme.panel;
  const border = selected ? "rgba(0,0,0,0.15)" : theme.hairline;
  const textColor =
    selected || tone === "paper" ? theme.cardText : theme.text;

  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.chip,
            {
              backgroundColor: bg,
              borderColor: border,
              transform: [{ scale: pressed ? 0.98 : 1 }]
            }
          ]}
        >
          <Typo
            theme={theme}
            variant="micro"
            tone={tone === "paper" ? "paper" : "ink"}
            weight="semibold"
            style={{ color: textColor }}
          >
            {label}
          </Typo>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radii.chip,
    borderWidth: 1,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    marginRight: space.x2
  }
});
