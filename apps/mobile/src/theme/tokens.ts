export const palette = {
  ink0: "#07090C",
  ink1: "#0B0D10",
  ink2: "#11151B",

  paper0: "#F2E8D8",
  paper1: "#E9DDCA",
  paperInk: "#0F1217",

  textOnInk: "#F7F0E6",
  textMuted: "rgba(247,240,230,0.70)",

  hairlineOnInk: "rgba(247,240,230,0.10)",
  hairlineOnPaper: "rgba(15,18,23,0.10)",

  acid: "#B7F500",
  cyan: "#2BE7FF",
  amber: "#FFB020",
  vermillion: "#FF4D3D"
} as const;

export const radii = {
  card: 18,
  cardInner: 14,
  pill: 999,
  chip: 999
} as const;

export const space = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 20,
  x6: 24,
  x8: 32,
  x10: 40
} as const;

export const typeScale = {
  displayXL: { fontSize: 34, lineHeight: 40, letterSpacing: -0.2 },
  displayL: { fontSize: 28, lineHeight: 34, letterSpacing: -0.2 },
  heading: { fontSize: 20, lineHeight: 26, letterSpacing: 0.1 },
  body: { fontSize: 16, lineHeight: 22, letterSpacing: 0 },
  small: { fontSize: 14, lineHeight: 18, letterSpacing: 0.1 },
  micro: { fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  mono: { fontSize: 13, lineHeight: 18, letterSpacing: 0.2 }
} as const;

export const carbonTheme = {
  mode: "carbon" as const,
  bg: palette.ink1,
  panel: palette.ink2,
  text: palette.textOnInk,
  textMuted: palette.textMuted,
  hairline: palette.hairlineOnInk,

  card: palette.paper0,
  cardAlt: palette.paper1,
  cardText: palette.paperInk,
  cardHairline: palette.hairlineOnPaper,

  acid: palette.acid,
  cyan: palette.cyan,
  amber: palette.amber,
  danger: palette.vermillion
};

export const parchmentTheme = {
  mode: "parchment" as const,
  bg: palette.paper0,
  panel: palette.paper1,
  text: palette.paperInk,
  textMuted: "rgba(15,18,23,0.70)",
  hairline: "rgba(15,18,23,0.10)",

  card: palette.ink1,
  cardAlt: palette.ink2,
  cardText: palette.textOnInk,
  cardHairline: "rgba(247,240,230,0.10)",

  acid: palette.acid,
  cyan: palette.cyan,
  amber: palette.amber,
  danger: palette.vermillion
};

export type Theme = typeof carbonTheme | typeof parchmentTheme;
export type ThemeName = Theme["mode"];
