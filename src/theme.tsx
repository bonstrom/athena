import { createTheme, Theme, alpha } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    assistant: Palette["primary"];
    aiNote: Palette["primary"];
  }
  interface PaletteOptions {
    assistant?: PaletteOptions["primary"];
    aiNote?: PaletteOptions["primary"];
  }
}

declare module "@mui/material/Paper" {
  interface PaperPropsColorOverrides {
    assistant: true;
    aiNote: true;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    assistant: true;
    aiNote: true;
  }
}

export type ThemeMode = "light" | "dark";

export interface ColorPreset {
  id: string;
  label: string;
  primary: string;
  secondary: string;
  assistant: string;
  aiNote: string;
}

export const colorPresets: ColorPreset[] = [
  {
    id: "default",
    label: "Default Blue",
    primary: "#3f51b5",
    secondary: "#f50057",
    assistant: "#2c3e50",
    aiNote: "#39346e",
  },
  {
    id: "midnight",
    label: "Midnight Purple",
    primary: "#7e57c2",
    secondary: "#ff4081",
    assistant: "#311b92",
    aiNote: "#4a148c",
  },
  {
    id: "forest",
    label: "Forest Green",
    primary: "#2e7d32",
    secondary: "#ffa000",
    assistant: "#1b5e20",
    aiNote: "#33691e",
  },
  {
    id: "rose",
    label: "Rose Pink",
    primary: "#ec407a",
    secondary: "#00bcd4",
    assistant: "#880e4f",
    aiNote: "#ad1457",
  },
  {
    id: "gold",
    label: "Golden Amber",
    primary: "#ffa000",
    secondary: "#7c4dff",
    assistant: "#4e342e",
    aiNote: "#5d4037",
  },
];

export const getAppTheme = (mode: ThemeMode, presetId: string): Theme => {
  const preset = colorPresets.find((p) => p.id === presetId) || colorPresets[0];

  return createTheme({
    palette: {
      mode,
      primary: {
        main: preset.primary,
      },
      secondary: {
        main: preset.secondary,
      },
      background: {
        default: mode === "dark" ? "#121212" : "#f5f5f5",
        paper: mode === "dark" ? "#1e1e1e" : "#ffffff",
      },
      text: {
        primary: mode === "dark" ? "#ffffff" : "rgba(0, 0, 0, 0.87)",
        secondary: mode === "dark" ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
      },
      assistant: {
        main: mode === "dark" ? preset.assistant : alpha(preset.assistant, 0.1),
        contrastText: mode === "dark" ? "#ffffff" : "rgba(0, 0, 0, 0.87)",
      },
      aiNote: {
        main: mode === "dark" ? preset.aiNote : alpha(preset.aiNote, 0.1),
        contrastText: mode === "dark" ? "#ffffff" : "rgba(0, 0, 0, 0.87)",
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          a: {
            color: mode === "dark" ? preset.primary : preset.primary,
            textDecoration: "underline",
            "&:hover": {
              textDecoration: "none",
            },
            "&:visited": {
              color: mode === "dark" ? preset.secondary : preset.secondary,
            },
          },
        },
      },
    },
  });
};

const theme = getAppTheme("dark", "default");
export default theme;
