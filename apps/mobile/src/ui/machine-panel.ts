export type MachinePanelPlacement = {
  showInThreads: boolean;
  showInSettings: boolean;
};

export const getMachinePanelPlacement = (connected: boolean): MachinePanelPlacement => ({
  showInThreads: !connected,
  showInSettings: true
});
