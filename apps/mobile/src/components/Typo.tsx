import React from "react";
import { StyleSheet, Text, type TextProps } from "react-native";
import { fontFamilies } from "../theme/fonts";
import { type Theme, typeScale } from "../theme/tokens";

type Variant =
  | "displayXL"
  | "displayL"
  | "heading"
  | "body"
  | "small"
  | "micro"
  | "mono";

export function Typo({
  theme,
  variant = "body",
  tone = "ink",
  weight,
  style,
  ...props
}: TextProps & {
  theme: Theme;
  variant?: Variant;
  tone?: "ink" | "muted" | "paper";
  weight?: "normal" | "medium" | "semibold" | "display";
}): React.ReactElement {
  const color =
    tone === "muted" ? theme.textMuted : tone === "paper" ? theme.cardText : theme.text;

  const fontFamily =
    variant === "mono"
      ? weight === "medium"
        ? fontFamilies.monoMedium
        : fontFamilies.mono
      : weight === "display"
        ? fontFamilies.display
        : weight === "semibold"
          ? fontFamilies.bodySemibold
          : weight === "medium"
            ? fontFamilies.bodyMedium
            : fontFamilies.body;

  return (
    <Text
      {...props}
      selectable={props.selectable ?? true}
      style={[styles.base, typeScale[variant], { color, fontFamily }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: { includeFontPadding: false }
});
