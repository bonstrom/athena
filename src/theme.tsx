import { createTheme, Theme } from "@mui/material/styles";

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

export interface ThemePalette {
  primary: string;
  secondary: string;
  assistant: string;
  aiNote: string;
}

export interface ColorPreset {
  id: string;
  label: string;
  light: ThemePalette;
  dark: ThemePalette;
}

export const colorPresets: ColorPreset[] = [
  {
    id: "default",
    label: "Default Blue",
    light: {
      primary: "#1a73e8",
      secondary: "#d81b60",
      assistant: "#f8f9fa",
      aiNote: "#edf2f7",
    },
    dark: {
      primary: "#1a73e8",
      secondary: "#ff4081",
      assistant: "#1e2433",
      aiNote: "#242a3d",
    },
  },
  {
    id: "midnight",
    label: "Midnight Purple",
    light: {
      primary: "#7e57c2",
      secondary: "#f06292",
      assistant: "#faf5ff",
      aiNote: "#f3e8ff",
    },
    dark: {
      primary: "#7e57c2",
      secondary: "#ff4081",
      assistant: "#281e3d",
      aiNote: "#2d2445",
    },
  },
  {
    id: "forest",
    label: "Forest Green",
    light: {
      primary: "#2e7d32",
      secondary: "#f9a825",
      assistant: "#f0fdf4",
      aiNote: "#ecfdf5",
    },
    dark: {
      primary: "#2e7d32",
      secondary: "#ffa000",
      assistant: "#1b281b",
      aiNote: "#1e301e",
    },
  },
  {
    id: "rose",
    label: "Rose Pink",
    light: {
      primary: "#d81b60",
      secondary: "#00acc1",
      assistant: "#fff1f2",
      aiNote: "#fff5f7",
    },
    dark: {
      primary: "#ec407a",
      secondary: "#00bcd4",
      assistant: "#331821",
      aiNote: "#401d2a",
    },
  },
  {
    id: "gold",
    label: "Golden Amber",
    light: {
      primary: "#ef6c00",
      secondary: "#6200ea",
      assistant: "#fffaf0",
      aiNote: "#fff7ed",
    },
    dark: {
      primary: "#ff8f00",
      secondary: "#7c4dff",
      assistant: "#332314",
      aiNote: "#4d351d",
    },
  },
];

export const getAppTheme = (mode: ThemeMode, presetId: string): Theme => {
  const preset = colorPresets.find((p) => p.id === presetId) || colorPresets[0];
  const palette = mode === "light" ? preset.light : preset.dark;

  return createTheme({
    palette: {
      mode,
      primary: {
        main: palette.primary,
        contrastText: mode === "dark" ? "#ffffff" : "rgba(0, 0, 0, 0.87)",
      },
      secondary: {
        main: palette.secondary,
        contrastText: mode === "dark" ? "#ffffff" : "rgba(0, 0, 0, 0.87)",
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
        main: palette.assistant,
        contrastText: mode === "dark" ? "#ffffff" : "rgba(0, 0, 0, 0.87)",
      },
      aiNote: {
        main: palette.aiNote,
        contrastText: mode === "dark" ? "#ffffff" : "rgba(0, 0, 0, 0.87)",
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          a: {
            color: palette.primary,
            textDecoration: "underline",
            "&:hover": {
              textDecoration: "none",
            },
            "&:visited": {
              color: palette.secondary,
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            borderRadius: 12,
            fontWeight: "bold",
            textShadow: mode === "dark" ? "0px 0px 2px rgba(0, 0, 0, 0.8)" : "none",
          },
          contained: {
            boxShadow: "none",
            "&:hover": {
              boxShadow: "none",
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 16,
          },
        },
      },
    },
  });
};

const theme = getAppTheme("dark", "default");
export default theme;
