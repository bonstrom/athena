import React from "react";
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  alpha,
} from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useAuthStore } from "../store/AuthStore";
import { colorPresets } from "../theme";

const ThemeSelector: React.FC = () => {
  const { themeMode, colorTheme, setThemeMode, setColorTheme } = useAuthStore();

  const handleModeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newMode: "light" | "dark" | null,
  ): void => {
    if (newMode !== null) {
      setThemeMode(newMode);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="subtitle2"
          color="text.secondary"
          gutterBottom
          sx={{ fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.7rem" }}>
          Mode
        </Typography>
        <ToggleButtonGroup
          value={themeMode}
          exclusive
          onChange={handleModeChange}
          size="small"
          fullWidth
          sx={{ mb: 1 }}>
          <ToggleButton value="light">
            <LightModeIcon sx={{ mr: 1, fontSize: "1.2rem" }} />
            Light
          </ToggleButton>
          <ToggleButton value="dark">
            <DarkModeIcon sx={{ mr: 1, fontSize: "1.2rem" }} />
            Dark
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Typography
          variant="subtitle2"
          color="text.secondary"
          gutterBottom
          sx={{ fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.7rem" }}>
          Color Theme
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
            gap: 1.5,
          }}>
          {colorPresets.map((preset) => (
            <Paper
              key={preset.id}
              onClick={(): void => setColorTheme(preset.id)}
              elevation={0}
              sx={{
                p: 1.5,
                cursor: "pointer",
                border: "2px solid",
                borderColor:
                  colorTheme === preset.id
                    ? preset[themeMode].primary
                    : "divider",
                bgcolor: (theme) =>
                  colorTheme === preset.id
                    ? alpha(
                        preset[themeMode].primary,
                        theme.palette.mode === "dark" ? 0.2 : 0.1,
                      )
                    : "background.paper",
                transition: "all 0.2s",
                "&:hover": {
                  borderColor: (theme) =>
                    colorTheme === preset.id
                      ? preset[themeMode].primary
                      : theme.palette.text.disabled,
                  transform: "translateY(-2px)",
                },
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
              }}>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  bgcolor: preset[themeMode].primary,
                  mb: 1,
                  boxShadow: () =>
                    colorTheme === preset.id
                      ? `0 0 8px ${preset[themeMode].primary}`
                      : "none",
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: colorTheme === preset.id ? "bold" : "normal",
                  color: colorTheme === preset.id ? "text.primary" : "text.secondary",
                }}>
                {preset.label}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default ThemeSelector;
