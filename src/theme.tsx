import { createTheme } from "@mui/material/styles";

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

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#121212",
      paper: "#1e1e1e",
    },
    text: {
      primary: "#ffffff",
    },
    assistant: {
      main: "#2c3e50",
      contrastText: "#ffffff",
    },
    aiNote: {
      main: "#39346e",
      contrastText: "#ffffff",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        a: {
          color: "#64b5f6",
          textDecoration: "underline",
          "&:hover": {
            textDecoration: "none",
          },
          "&:visited": {
            color: "#9575cd",
          },
        },
      },
    },
  },
});

export default theme;
