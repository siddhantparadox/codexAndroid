export type AppScreenKey = "threads" | "agent" | "approvals" | "settings";

export type AppScreenMeta = {
  key: AppScreenKey;
  title: string;
};

export const APP_SCREENS: AppScreenMeta[] = [
  { key: "threads", title: "Threads" },
  { key: "agent", title: "Agent" },
  { key: "approvals", title: "Approvals" },
  { key: "settings", title: "Settings" }
];

export const getScreenBadgeCount = (
  key: AppScreenKey,
  counts: { pendingApprovals: number; transcriptItems: number; threadItems: number }
): number => {
  if (key === "approvals") {
    return counts.pendingApprovals;
  }

  if (key === "threads") {
    return counts.threadItems;
  }

  if (key === "agent") {
    return counts.transcriptItems;
  }

  return 0;
};
