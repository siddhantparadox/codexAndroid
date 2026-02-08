export type ComposerMode = "chat" | "agent";
export type NetworkAccessMode = "off" | "on";
export type EffortLevel = "low" | "medium" | "high";
export type ReasoningMode = "summary" | "raw";

type BaseTurnSettings = {
  mode: ComposerMode;
  networkAccess: NetworkAccessMode;
  selectedModelId: string | null;
  effortLevel: EffortLevel;
  reasoningMode: ReasoningMode;
  cwd?: string;
};

export type ThreadStartSettings = BaseTurnSettings;
export type TurnStartSettings = BaseTurnSettings & {
  threadId: string;
  promptText: string;
};

const buildSandboxPolicy = (settings: BaseTurnSettings): Record<string, unknown> => {
  if (settings.mode === "chat") {
    return {
      type: "readOnly",
      networkAccess: false
    };
  }

  return {
    type: "workspaceWrite",
    writableRoots: settings.cwd ? [settings.cwd] : undefined,
    networkAccess: settings.networkAccess === "on"
  };
};

const buildSharedOverrides = (settings: BaseTurnSettings): Record<string, unknown> => ({
  model: settings.selectedModelId ?? "gpt-5.2-codex",
  approvalPolicy: "unlessTrusted",
  sandboxPolicy: buildSandboxPolicy(settings),
  effort: settings.effortLevel,
  summary: settings.reasoningMode === "summary" ? "concise" : undefined,
  cwd: settings.cwd
});

export const buildThreadStartParams = (
  settings: ThreadStartSettings
): Record<string, unknown> => ({
  ...buildSharedOverrides(settings)
});

export const buildTurnStartParams = (
  settings: TurnStartSettings
): Record<string, unknown> => ({
  threadId: settings.threadId,
  input: [{ type: "text", text: settings.promptText }],
  ...buildSharedOverrides(settings)
});
