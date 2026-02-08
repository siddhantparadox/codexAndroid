import { MotiView } from "moti";
import React from "react";
import { StyleSheet } from "react-native";
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

  return (
    <MotiView
      pointerEvents="none"
      from={{ opacity: 0, scale: reducedMotion ? 1 : 2.2, rotate: "-12deg" }}
      animate={
        visible
          ? { opacity: 1, scale: 1, rotate: "-12deg" }
          : { opacity: 0, scale: reducedMotion ? 1 : 2.2, rotate: "-12deg" }
      }
      transition={
        reducedMotion
          ? { type: "timing", duration: 160 }
          : {
              type: "spring",
              damping: 12,
              stiffness: 220,
              mass: 0.7
            }
      }
      style={[styles.stamp, { borderColor: color }]}
    >
      <Typo theme={theme} variant="heading" weight="display" style={{ color }}>
        {kind === "approved" ? "APPROVED" : "DECLINED"}
      </Typo>
      <Typo theme={theme} variant="micro" tone="muted" style={{ marginTop: 2 }}>
        codex mobile
      </Typo>
    </MotiView>
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
