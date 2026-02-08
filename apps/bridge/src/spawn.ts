export const shouldUseShellForCodex = (
  codexBin: string,
  platform: NodeJS.Platform = process.platform
): boolean => platform === "win32" && /\.(cmd|bat)$/i.test(codexBin);

