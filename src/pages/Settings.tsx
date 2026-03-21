import React, { useState, useEffect } from "react";
import { Box, TextField, Button, Typography, Paper, IconButton, InputAdornment } from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useAuthStore } from "../store/AuthStore";

const Settings: React.FC = () => {
  const { openAiKey, deepSeekKey, userName, setOpenAiKey, setDeepSeekKey, setUserName } = useAuthStore();

  const [openAiInput, setOpenAiInput] = useState(openAiKey);
  const [deepSeekInput, setDeepSeekInput] = useState(deepSeekKey);
  const [userNameInput, setUserNameInput] = useState(userName);
  const [saved, setSaved] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showDeepSeekKey, setShowDeepSeekKey] = useState(false);

  useEffect(() => {
    setOpenAiInput(openAiKey);
    setDeepSeekInput(deepSeekKey);
    setUserNameInput(userName);
  }, [openAiKey, deepSeekKey, userName]);

  function handleSave(): void {
    setOpenAiKey(openAiInput.trim());
    setDeepSeekKey(deepSeekInput.trim());
    setUserName(userNameInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      mt={4}
      px={2}>
      <Paper
        elevation={3}
        sx={{
          p: 3,
          width: "100%",
          maxWidth: 600,
          bgcolor: (theme) => theme.palette.background.paper,
        }}>
        <Typography
          variant="h6"
          gutterBottom>
          Settings
        </Typography>

        <TextField
          label="User Name"
          fullWidth
          value={userNameInput}
          onChange={(e): void => setUserNameInput(e.target.value)}
          sx={{ mb: 2 }}
        />

        <TextField
          label="OpenAI API Key"
          type={showOpenAiKey ? "text" : "password"}
          fullWidth
          value={openAiInput}
          onChange={(e): void => setOpenAiInput(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={(): void => setShowOpenAiKey((prev) => !prev)}>
                  {showOpenAiKey ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <TextField
          label="DeepSeek API Key"
          type={showDeepSeekKey ? "text" : "password"}
          fullWidth
          value={deepSeekInput}
          onChange={(e): void => setDeepSeekInput(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={(): void => setShowDeepSeekKey((prev) => !prev)}>
                  {showDeepSeekKey ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <Box
          display="flex"
          justifyContent="flex-end">
          <Button
            variant="contained"
            color="assistant"
            onClick={handleSave}>
            Save
          </Button>
        </Box>

        {saved && (
          <Typography
            variant="body2"
            color="success.main"
            mt={2}>
            Settings saved successfully.
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default Settings;
