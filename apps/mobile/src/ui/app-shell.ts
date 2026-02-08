export type AppScreenKey = "connect" | "turn" | "approvals" | "transcript";

export type AppScreenMeta = {
  key: AppScreenKey;
  title: string;
};

export const APP_SCREENS: AppScreenMeta[] = [
  { key: "connect", title: "Connect" },
  { key: "turn", title: "Turn" },
  { key: "approvals", title: "Approvals" },
  { key: "transcript", title: "Transcript" }
];

export const getScreenBadgeCount = (
  key: AppScreenKey,
  counts: { pendingApprovals: number; transcriptItems: number; threadItems: number }
): number => {
  if (key === "approvals") {
    return counts.pendingApprovals;
  }

  if (key === "transcript") {
    return counts.transcriptItems;
  }

  if (key === "turn") {
    return counts.threadItems;
  }

  return 0;
};
