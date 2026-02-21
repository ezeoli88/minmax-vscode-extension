export interface Theme {
  name: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  dimText: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  purple: string;
  planBadge: string;
  builderBadge: string;
  userBubble: string;
  assistantBubble: string;
}

export const themes: Record<string, Theme> = {
  "tokyo-night": {
    name: "Tokyo Night",
    bg: "#1a1b26",
    surface: "#24283b",
    border: "#3b4261",
    text: "#c0caf5",
    dimText: "#565f89",
    accent: "#7aa2f7",
    success: "#9ece6a",
    warning: "#e0af68",
    error: "#f7768e",
    purple: "#bb9af7",
    planBadge: "#73daca",
    builderBadge: "#c25450",
    userBubble: "#3b4261",
    assistantBubble: "#1a1b26",
  },
  "rose-pine": {
    name: "Rosé Pine",
    bg: "#191724",
    surface: "#1f1d2e",
    border: "#403d52",
    text: "#e0def4",
    dimText: "#6e6a86",
    accent: "#31748f",
    success: "#9ccfd8",
    warning: "#f6c177",
    error: "#eb6f92",
    purple: "#c4a7e7",
    planBadge: "#9ccfd8",
    builderBadge: "#b4637a",
    userBubble: "#403d52",
    assistantBubble: "#191724",
  },
  gruvbox: {
    name: "Gruvbox",
    bg: "#282828",
    surface: "#3c3836",
    border: "#504945",
    text: "#ebdbb2",
    dimText: "#928374",
    accent: "#83a598",
    success: "#b8bb26",
    warning: "#fabd2f",
    error: "#fb4934",
    purple: "#d3869b",
    planBadge: "#8ec07c",
    builderBadge: "#cc241d",
    userBubble: "#504945",
    assistantBubble: "#282828",
  },
};

export const defaultTheme = "tokyo-night";
