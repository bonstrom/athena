import { alpha, createTheme, Theme } from '@mui/material/styles';
import { FontId, getFontFamily } from './constants/fonts';

declare module '@mui/material/styles' {
  interface Palette {
    assistant: Palette['primary'];
    aiNote: Palette['primary'];
  }
  interface PaletteOptions {
    assistant?: PaletteOptions['primary'];
    aiNote?: PaletteOptions['primary'];
  }
}

declare module '@mui/material/Paper' {
  interface PaperPropsColorOverrides {
    assistant: true;
    aiNote: true;
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsColorOverrides {
    assistant: true;
    aiNote: true;
  }
}

export type ThemeMode = 'light' | 'dark';

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
    id: 'default',
    label: 'Default Blue',
    light: {
      primary: '#1a73e8',
      secondary: '#d81b60',
      assistant: '#f8f9fa',
      aiNote: '#edf2f7',
    },
    dark: {
      primary: '#1a73e8',
      secondary: '#ff4081',
      assistant: '#1e2433',
      aiNote: '#242a3d',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight Purple',
    light: {
      primary: '#7e57c2',
      secondary: '#f06292',
      assistant: '#faf5ff',
      aiNote: '#f3e8ff',
    },
    dark: {
      primary: '#7e57c2',
      secondary: '#ff4081',
      assistant: '#281e3d',
      aiNote: '#2d2445',
    },
  },
  {
    id: 'forest',
    label: 'Forest Green',
    light: {
      primary: '#2e7d32',
      secondary: '#f9a825',
      assistant: '#f0fdf4',
      aiNote: '#ecfdf5',
    },
    dark: {
      primary: '#2e7d32',
      secondary: '#ffa000',
      assistant: '#1b281b',
      aiNote: '#1e301e',
    },
  },
  {
    id: 'rose',
    label: 'Rose Pink',
    light: {
      primary: '#d81b60',
      secondary: '#00acc1',
      assistant: '#fff1f2',
      aiNote: '#fff5f7',
    },
    dark: {
      primary: '#ec407a',
      secondary: '#00bcd4',
      assistant: '#331821',
      aiNote: '#401d2a',
    },
  },
  {
    id: 'gold',
    label: 'Golden Amber',
    light: {
      primary: '#ef6c00',
      secondary: '#6200ea',
      assistant: '#fffaf0',
      aiNote: '#fff7ed',
    },
    dark: {
      primary: '#ff8f00',
      secondary: '#7c4dff',
      assistant: '#332314',
      aiNote: '#4d351d',
    },
  },
];

export const getAppTheme = (mode: ThemeMode, presetId: string, fontId: FontId = 'system'): Theme => {
  const preset = colorPresets.find((p) => p.id === presetId) ?? colorPresets[0];
  const palette = mode === 'light' ? preset.light : preset.dark;
  const fontFamily = getFontFamily(fontId);
  // Opaque, low-strength blends keep surfaces predictable at every elevation.
  const tintSurface = (base: string, strength: number): string => {
    const channels = [1, 3, 5].map((offset) => {
      const neutral = parseInt(base.slice(offset, offset + 2), 16);
      const accent = parseInt(palette.primary.slice(offset, offset + 2), 16);
      return Math.round(neutral * (1 - strength) + accent * strength);
    });
    return `rgb(${channels.join(', ')})`;
  };
  const pageSurface = tintSurface(mode === 'dark' ? '#13151a' : '#e9ebee', mode === 'dark' ? 0.025 : 0.018);
  // Keep panels neutral so the accent does not become a wash over the whole UI.
  const panelSurface = mode === 'dark' ? '#1d2027' : '#f3f4f6';

  return createTheme({
    typography: {
      fontFamily,
      button: { fontWeight: 600, letterSpacing: 0 },
      body1: { lineHeight: 1.65, letterSpacing: 0 },
      body2: { lineHeight: 1.6, letterSpacing: 0 },
      h6: { fontWeight: 600, letterSpacing: 0 },
    },
    palette: {
      mode,
      primary: {
        main: palette.primary,
        contrastText: '#ffffff',
      },
      secondary: {
        main: palette.secondary,
        contrastText: '#ffffff',
      },
      background: {
        default: pageSurface,
        paper: panelSurface,
      },
      text: {
        primary: mode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
        secondary: mode === 'dark' ? '#c4c8d0' : '#4b505a',
      },
      divider: mode === 'dark' ? '#3b404a' : '#cbd0d9',
      assistant: {
        main: palette.assistant,
        contrastText: mode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
      },
      aiNote: {
        main: palette.aiNote,
        contrastText: mode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            '--font-family': fontFamily,
            '--athena-accent-soft': alpha(palette.primary, 0.16),
            '--scrollbar-track': pageSurface,
            '--scrollbar-thumb': mode === 'dark' ? '#606060' : '#b0b0b0',
          },
          a: {
            color: palette.primary,
            textDecoration: 'underline',
            '&:hover': {
              textDecoration: 'none',
            },
            '&:visited': {
              color: palette.secondary,
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
            fontWeight: 600,
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundImage: 'none',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&.athena-composer-input': {
              backgroundColor: panelSurface,
              '&:not(.Mui-disabled):hover .MuiOutlinedInput-notchedOutline': {
                borderColor: alpha(palette.primary, 0.7),
              },
              '&.Mui-focused': {
                backgroundColor: alpha(palette.primary, mode === 'dark' ? 0.05 : 0.025),
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: palette.primary,
                  borderWidth: 2,
                },
              },
            },
          },
        },
      },
    },
  });
};

const theme = getAppTheme('dark', 'default');
export default theme;
