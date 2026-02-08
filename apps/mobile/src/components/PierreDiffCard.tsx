import React from "react";
import { StyleSheet, View } from "react-native";
import { parseUnifiedDiff } from "../codex/pierre-diff";
import type { Theme } from "../theme/tokens";
import { radii, space } from "../theme/tokens";
import { IndexCard } from "./IndexCard";
import { Typo } from "./Typo";

const lineKindColors = (theme: Theme): Record<"context" | "add" | "delete", string> => ({
  context: theme.cardAlt,
  add: "rgba(183,245,0,0.16)",
  delete: "rgba(255,77,61,0.14)"
});

type PierreDiffCardProps = {
  theme: Theme;
  diff: string;
  title?: string;
  status?: string;
};

export function PierreDiffCard({
  theme,
  diff,
  title = "Pierre Diff",
  status
}: PierreDiffCardProps): React.ReactElement {
  const parsed = React.useMemo(
    () => parseUnifiedDiff(diff, { maxFiles: 4, maxLinesPerHunk: 40 }),
    [diff]
  );
  const kindColors = lineKindColors(theme);

  return (
    <IndexCard theme={theme} accent="danger">
      <View style={styles.headerRow}>
        <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
          {title}
          {status ? ` (${status})` : ""}
        </Typo>
        <View style={styles.countRow}>
          <View style={[styles.deltaChip, { borderColor: "rgba(183,245,0,0.55)" }]}>
            <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
              +{parsed.totalAdded}
            </Typo>
          </View>
          <View style={[styles.deltaChip, { borderColor: "rgba(255,77,61,0.55)" }]}>
            <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
              -{parsed.totalDeleted}
            </Typo>
          </View>
        </View>
      </View>

      {parsed.files.length === 0 ? (
        <View style={[styles.emptyState, { borderColor: theme.cardHairline }]}>
          <Typo theme={theme} variant="small" tone="paper">
            Diff stream has no unified patch content yet.
          </Typo>
        </View>
      ) : (
        parsed.files.map((file) => (
          <View
            key={`${file.displayPath}-${file.hunks.length}`}
            style={[styles.fileBlock, { borderColor: theme.cardHairline }]}
          >
            <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
              {file.displayPath}
            </Typo>
            {file.hunks.map((hunk) => (
              <View key={`${file.displayPath}:${hunk.header}`} style={styles.hunkBlock}>
                <Typo theme={theme} variant="micro" tone="paper" style={styles.hunkHeader}>
                  {hunk.header}
                </Typo>
                {hunk.lines.map((line, index) => (
                  <View
                    key={`${hunk.header}-${index}-${line.oldLine ?? "x"}-${line.newLine ?? "x"}`}
                    style={[styles.diffLine, { backgroundColor: kindColors[line.kind] }]}
                  >
                    <Typo theme={theme} variant="micro" tone="paper" style={styles.lineNumber}>
                      {line.oldLine ?? ""}
                    </Typo>
                    <Typo theme={theme} variant="micro" tone="paper" style={styles.lineNumber}>
                      {line.newLine ?? ""}
                    </Typo>
                    <Typo theme={theme} variant="mono" tone="paper" style={styles.lineText}>
                      {line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " "}
                      {line.text}
                    </Typo>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))
      )}

      {parsed.truncated ? (
        <Typo theme={theme} variant="micro" tone="paper">
          Diff preview truncated for mobile performance.
        </Typo>
      ) : null}
    </IndexCard>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.x2
  },
  countRow: {
    flexDirection: "row",
    gap: space.x2
  },
  deltaChip: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: space.x2,
    paddingVertical: 2
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2
  },
  fileBlock: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    padding: space.x2,
    gap: space.x2
  },
  hunkBlock: {
    gap: 2
  },
  hunkHeader: {
    opacity: 0.85
  },
  diffLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 6
  },
  lineNumber: {
    minWidth: 28,
    textAlign: "right",
    opacity: 0.62,
    fontVariant: ["tabular-nums"]
  },
  lineText: {
    flex: 1,
    fontVariant: ["tabular-nums"]
  }
});
