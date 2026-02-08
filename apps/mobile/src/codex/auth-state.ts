export const isAuthRequiredForTurns = (
  authMode: string | null | undefined
): boolean =>
  !authMode || authMode === "none" || authMode === "unknown";
