import { useState, useEffect, useRef } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
} from "@mui/material";
import { CheckCircle as CheckCircleIcon } from "@mui/icons-material";
import { useAuthStore } from "../store/AuthStore";
import { BackupService } from "../services/backupService";
import { useBackupStore } from "../store/BackupStore";
import { getMoonshotBalance, getDeepSeekBalance } from "../services/llmService";
import { USD_TO_SEK } from "../constants";
import ThemeSelector from "../components/ThemeSelector";

const Settings: React.FC = () => {
  const {
    openAiKey,
    deepSeekKey,
    googleApiKey,
    moonshotApiKey,
    userName,
    backupInterval,
    customInstructions,
    chatWidth,
    chatFontSize,
    setOpenAiKey,
    setDeepSeekKey,
    setGoogleApiKey,
    setMoonshotApiKey,
    setUserName,
    setBackupInterval,
    setCustomInstructions,
    setChatWidth,
    setChatFontSize,
  } = useAuthStore();

  const [openAiInput, setOpenAiInput] = useState("");
  const [deepSeekInput, setDeepSeekInput] = useState("");
  const [googleInput, setGoogleInput] = useState("");
  const [moonshotInput, setMoonshotInput] = useState("");
  const [userNameInput, setUserNameInput] = useState(userName);
  const [customInstructionsInput, setCustomInstructionsInput] = useState(customInstructions);

  const [isUpdatingOpenAi, setIsUpdatingOpenAi] = useState(!openAiKey);
  const [isUpdatingDeepSeek, setIsUpdatingDeepSeek] = useState(!deepSeekKey);
  const [isUpdatingGoogle, setIsUpdatingGoogle] = useState(!googleApiKey);
  const [isUpdatingMoonshot, setIsUpdatingMoonshot] = useState(!moonshotApiKey);

  const [saved, setSaved] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [moonshotBalance, setMoonshotBalance] = useState<number | null>(null);
  const [deepSeekBalance, setDeepSeekBalance] = useState<{ balance: number; currency: string } | null>(null);

  const { status: backupStatus, lastBackupTime, setStatus: setBackupStatus, setLastBackupTime } = useBackupStore();

  useEffect(() => {
    setUserNameInput(userName);
    setCustomInstructionsInput(customInstructions);
  }, [userName, customInstructions]);

  useEffect(() => {
    setIsUpdatingOpenAi(!openAiKey);
  }, [openAiKey]);

  useEffect(() => {
    setIsUpdatingDeepSeek(!deepSeekKey);
  }, [deepSeekKey]);

  useEffect(() => {
    setIsUpdatingGoogle(!googleApiKey);
  }, [googleApiKey]);

  useEffect(() => {
    setIsUpdatingMoonshot(!moonshotApiKey);
  }, [moonshotApiKey]);

  useEffect(() => {
    if (moonshotApiKey) {
      void getMoonshotBalance().then((data) => {
        if (data) setMoonshotBalance(data.available_balance);
      });
    } else {
      setMoonshotBalance(null);
    }
  }, [moonshotApiKey]);

  useEffect(() => {
    if (deepSeekKey) {
      void getDeepSeekBalance().then((data) => {
        if (data) setDeepSeekBalance(data);
      });
    } else {
      setDeepSeekBalance(null);
    }
  }, [deepSeekKey]);

  useEffect(() => {
    void BackupService.getAutoBackupHandle().then((handle) => {
      setAutoBackupEnabled(!!handle);
    });
  }, []);

  function handleSave(): void {
    if (isUpdatingOpenAi && openAiInput) {
      setOpenAiKey(openAiInput.trim());
      setOpenAiInput("");
      setIsUpdatingOpenAi(false);
    }
    if (isUpdatingDeepSeek && deepSeekInput) {
      setDeepSeekKey(deepSeekInput.trim());
      setDeepSeekInput("");
      setIsUpdatingDeepSeek(false);
    }
    if (isUpdatingGoogle && googleInput) {
      setGoogleApiKey(googleInput.trim());
      setGoogleInput("");
      setIsUpdatingGoogle(false);
    }
    if (isUpdatingMoonshot && moonshotInput) {
      setMoonshotApiKey(moonshotInput.trim());
      setMoonshotInput("");
      setIsUpdatingMoonshot(false);
    }
    setUserName(userNameInput.trim());
    setCustomInstructions(customInstructionsInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async (): Promise<void> => {
    try {
      await BackupService.downloadBackup();
    } catch (error) {
      console.error(error);
      alert("Failed to export backup.");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (window.confirm("This will replace all your current conversations with the imported backup. Proceed?")) {
      try {
        await BackupService.restoreBackup(file);
        window.location.reload();
      } catch (error) {
        console.error(error);
        alert("Failed to import backup.");
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleToggleAutoBackup = async (checked: boolean): Promise<void> => {
    if (checked) {
      try {
        const success = await BackupService.selectAutoBackupFile();
        if (success) {
          setAutoBackupEnabled(true);
        }
      } catch (error) {
        console.error(error);
        alert("Failed to setup auto backup file.");
      }
    } else {
      if (window.confirm("Disable automatic backups? Your stored file location will be cleared.")) {
        await BackupService.clearAutoBackupHandle();
        setAutoBackupEnabled(false);
        setBackupStatus("no_handle");
        setLastBackupTime(null);
      }
    }
  };

  const handleChangeLocation = async (): Promise<void> => {
    try {
      const success = await BackupService.selectAutoBackupFile();
      if (success) {
        // Updated via store
      }
    } catch (error) {
      console.error(error);
      alert("Failed to change backup location.");
    }
  };

  const validateKey = (key: string, type: "openai" | "deepseek" | "google"): boolean => {
    if (!key) return true;
    const trimmed = key.trim();
    if (type === "openai" || type === "deepseek") {
      return trimmed.startsWith("sk-") && trimmed.length > 20;
    }
    return trimmed.length >= 30; // Gemini keys are typically long
  };

  const KeyConfirmation = ({
    label,
    isStored,
    onUpdate,
    extraInfo,
  }: {
    label: string;
    isStored: boolean;
    onUpdate: () => void;
    extraInfo?: React.ReactNode;
  }): React.ReactElement => (
    <Box
      sx={{
        mb: 2,
        p: 1.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "flex-start", sm: "center" },
        justifyContent: "space-between",
        gap: { xs: 1.5, sm: 2 },
        bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.01)"),
      }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1.5,
        }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: "bold",
            color: "text.secondary",
            minWidth: { xs: "auto", sm: 100 },
          }}>
          {label}
        </Typography>
        {isStored ? (
          <Chip
            icon={<CheckCircleIcon sx={{ color: "success.main !important" }} />}
            label="Key Configured"
            color="success"
            variant="outlined"
            size="small"
          />
        ) : (
          <Chip
            label="Not Configured"
            color="warning"
            variant="outlined"
            size="small"
          />
        )}
        {extraInfo}
      </Box>
      <Button
        size="small"
        variant="contained"
        onClick={onUpdate}
        sx={{
          alignSelf: { xs: "flex-end", sm: "center" },
        }}>
        {isStored ? "Update Key" : "Add Key"}
      </Button>
    </Box>
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        mt: 4,
        px: 2,
        height: "100%",
        overflowY: "auto",
        pb: 8,
      }}>
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
          sx={{ mb: 3 }}
        />

        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 1, mb: 2 }}>
            Appearance
          </Typography>
          <ThemeSelector />
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            gutterBottom
            sx={{ fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.7rem" }}>
            Chat Layout
          </Typography>
          <FormControl
            fullWidth
            size="small">
            <InputLabel>Max Chat Width</InputLabel>
            <Select
              value={chatWidth}
              label="Max Chat Width"
              onChange={(e): void => setChatWidth(e.target.value as "sm" | "md" | "lg")}>
              <MenuItem value="full">Full Width</MenuItem>
              <MenuItem value="lg">Wide (1200px)</MenuItem>
              <MenuItem value="md">Standard (900px)</MenuItem>
              <MenuItem value="sm">Compact (600px)</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            gutterBottom
            sx={{ fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.7rem" }}>
            Typography
          </Typography>
          <FormControl
            fullWidth
            size="small">
            <InputLabel>Chat Font Size</InputLabel>
            <Select
              value={chatFontSize}
              label="Chat Font Size"
              onChange={(e): void => setChatFontSize(e.target.value as number)}>
              <MenuItem value={12}>Small (12px)</MenuItem>
              <MenuItem value={14}>Compact (14px)</MenuItem>
              <MenuItem value={16}>Standard (16px)</MenuItem>
              <MenuItem value={18}>Large (18px)</MenuItem>
              <MenuItem value={20}>Extra Large (20px)</MenuItem>
              <MenuItem value={24}>Huge (24px)</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* OpenAI Section */}
        {isUpdatingOpenAi ? (
          <TextField
            label="OpenAI API Key"
            type="password"
            fullWidth
            value={openAiInput}
            onChange={(e): void => setOpenAiInput(e.target.value)}
            placeholder="Paste new key here"
            sx={{ mb: 2 }}
            error={openAiInput !== "" && !validateKey(openAiInput, "openai")}
            helperText={
              openAiInput !== "" && !validateKey(openAiInput, "openai")
                ? "Invalid OpenAI key format (should start with sk-)"
                : ""
            }
            InputProps={{
              endAdornment: openAiKey && (
                <InputAdornment position="end">
                  <Button
                    size="small"
                    onClick={(): void => setIsUpdatingOpenAi(false)}>
                    Cancel
                  </Button>
                </InputAdornment>
              ),
            }}
          />
        ) : (
          <KeyConfirmation
            label="OpenAI"
            isStored={!!openAiKey}
            onUpdate={(): void => setIsUpdatingOpenAi(true)}
          />
        )}

        {/* DeepSeek Section */}
        {isUpdatingDeepSeek ? (
          <TextField
            label="DeepSeek API Key"
            type="password"
            fullWidth
            value={deepSeekInput}
            onChange={(e): void => setDeepSeekInput(e.target.value)}
            placeholder="Paste new key here"
            sx={{ mb: 2 }}
            error={deepSeekInput !== "" && !validateKey(deepSeekInput, "deepseek")}
            helperText={
              deepSeekInput !== "" && !validateKey(deepSeekInput, "deepseek")
                ? "Invalid DeepSeek key format (should start with sk-)"
                : ""
            }
            InputProps={{
              endAdornment: deepSeekKey && (
                <InputAdornment position="end">
                  <Button
                    size="small"
                    onClick={(): void => setIsUpdatingDeepSeek(false)}>
                    Cancel
                  </Button>
                </InputAdornment>
              ),
            }}
          />
        ) : (
          <KeyConfirmation
            label="DeepSeek"
            isStored={!!deepSeekKey}
            onUpdate={(): void => setIsUpdatingDeepSeek(true)}
            extraInfo={
              deepSeekBalance !== null && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: "bold" }}>
                  Balance:{" "}
                  {(deepSeekBalance.balance * (deepSeekBalance.currency === "CNY" ? 1.5 : USD_TO_SEK)).toFixed(2)}
                  kr
                </Typography>
              )
            }
          />
        )}

        {/* Google Section */}
        {isUpdatingGoogle ? (
          <TextField
            label="Google API Key"
            type="password"
            fullWidth
            value={googleInput}
            onChange={(e): void => setGoogleInput(e.target.value)}
            placeholder="Paste new key here"
            sx={{ mb: 2 }}
            error={googleInput !== "" && !validateKey(googleInput, "google")}
            helperText={
              googleInput !== "" && !validateKey(googleInput, "google") ? "Invalid Google API key format" : ""
            }
            InputProps={{
              endAdornment: googleApiKey && (
                <InputAdornment position="end">
                  <Button
                    size="small"
                    onClick={(): void => setIsUpdatingGoogle(false)}>
                    Cancel
                  </Button>
                </InputAdornment>
              ),
            }}
          />
        ) : (
          <KeyConfirmation
            label="Google (Gemini)"
            isStored={!!googleApiKey}
            onUpdate={(): void => setIsUpdatingGoogle(true)}
          />
        )}

        {/* Moonshot Section */}
        {isUpdatingMoonshot ? (
          <TextField
            label="Moonshot API Key (Kimi)"
            type="password"
            fullWidth
            value={moonshotInput}
            onChange={(e): void => setMoonshotInput(e.target.value)}
            placeholder="Paste new key here"
            sx={{ mb: 2 }}
            error={moonshotInput !== "" && !validateKey(moonshotInput, "openai")}
            helperText={
              moonshotInput !== "" && !validateKey(moonshotInput, "openai") ? "Invalid Moonshot key format" : ""
            }
            InputProps={{
              endAdornment: moonshotApiKey && (
                <InputAdornment position="end">
                  <Button
                    size="small"
                    onClick={(): void => setIsUpdatingMoonshot(false)}>
                    Cancel
                  </Button>
                </InputAdornment>
              ),
            }}
          />
        ) : (
          <KeyConfirmation
            label="Moonshot"
            isStored={!!moonshotApiKey}
            onUpdate={(): void => setIsUpdatingMoonshot(true)}
            extraInfo={
              moonshotBalance !== null && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: "bold" }}>
                  Balance: {(moonshotBalance * USD_TO_SEK).toFixed(2)}kr
                </Typography>
              )
            }
          />
        )}

        <TextField
          label="Custom Instructions (System Prompt)"
          fullWidth
          multiline
          minRows={3}
          maxRows={10}
          value={customInstructionsInput}
          onChange={(e): void => setCustomInstructionsInput(e.target.value)}
          placeholder="E.g., Always respond in the style of a pirate, keep answers concise, etc."
          sx={{ mb: 2 }}
          helperText="These instructions will be prepended to the system prompt for all new messages."
        />

        <Box
          display="flex"
          justifyContent="flex-end">
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={
              (openAiInput !== "" && !validateKey(openAiInput, "openai")) ||
              (deepSeekInput !== "" && !validateKey(deepSeekInput, "deepseek")) ||
              (googleInput !== "" && !validateKey(googleInput, "google")) ||
              (moonshotInput !== "" && !validateKey(moonshotInput, "openai"))
            }>
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

      <Paper
        elevation={3}
        sx={{
          p: 3,
          mt: 4,
          width: "100%",
          maxWidth: 600,
          bgcolor: (theme) => theme.palette.background.paper,
        }}>
        <Typography
          variant="h6"
          gutterBottom>
          Data Management
        </Typography>
        <Typography
          variant="body2"
          sx={{ mb: 2 }}>
          Backup your conversations to a local JSON file, or restore them from a previous backup.
        </Typography>

        <Box
          display="flex"
          flexDirection="column"
          gap={2}>
          <Box
            display="flex"
            gap={2}>
            <Button
              variant="contained"
              color="primary"
              onClick={(): void => {
                handleExport().catch(console.error);
              }}>
              Export Database
            </Button>

            <Button
              variant="contained"
              color="secondary"
              onClick={(): void => fileInputRef.current?.click()}>
              Import Database
            </Button>
            <input
              type="file"
              accept=".json"
              style={{ display: "none" }}
              ref={fileInputRef}
              onChange={(e): void => {
                handleImport(e).catch(console.error);
              }}
            />
          </Box>
          <Box
            display="flex"
            flexDirection="column"
            gap={2}
            mt={1}>
            {"showSaveFilePicker" in window ? (
              <>
                <Box
                  display="flex"
                  flexDirection="column"
                  gap={1}
                  alignItems="flex-start">
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={2}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={autoBackupEnabled}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                            handleToggleAutoBackup(e.target.checked).catch(console.error);
                          }}
                          color="primary"
                        />
                      }
                      label="Automatic Local Backup"
                    />
                    {autoBackupEnabled && (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={(): void => {
                          handleChangeLocation().catch(console.error);
                        }}
                        sx={{ }}>
                        Change Location
                      </Button>
                    )}
                  </Box>

                  {autoBackupEnabled && (
                    <Box sx={{ ml: 1, mt: -0.5 }}>
                      {backupStatus === "permission_required" ? (
                        <Box
                          display="flex"
                          alignItems="center"
                          gap={1}>
                          <Typography
                            variant="body2"
                            color="error">
                            ⚠ Action Required: Permission expired.
                          </Typography>
                          <Button
                            size="small"
                            color="error"
                            onClick={(): void => {
                              void BackupService.performAutoBackup(true);
                            }}
                            sx={{ py: 0 }}>
                            Authorize Now
                          </Button>
                        </Box>
                      ) : backupStatus === "error" ? (
                        <Typography
                          variant="body2"
                          color="error">
                          ✕ Backup failed. Check console.
                        </Typography>
                      ) : (
                        <Typography
                          variant="body2"
                          color="success.main">
                          {backupStatus === "in-progress"
                            ? "… Backing up..."
                            : "✓ Active. Database saves automatically."}
                        </Typography>
                      )}

                      {lastBackupTime && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block">
                          Last backup: {new Date(lastBackupTime).toLocaleString()}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>

                <FormControl
                  variant="outlined"
                  size="small"
                  sx={{ minWidth: 200, mt: 1 }}>
                  <InputLabel>Backup Frequency</InputLabel>
                  <Select
                    value={backupInterval}
                    label="Backup Frequency"
                    onChange={(e): void => setBackupInterval(e.target.value as number)}>
                    <MenuItem value={1}>Every 1 Minute</MenuItem>
                    <MenuItem value={5}>Every 5 Minutes</MenuItem>
                    <MenuItem value={30}>Every 30 Minutes</MenuItem>
                    <MenuItem value={60}>Every 1 Hour</MenuItem>
                    <MenuItem value={720}>Every 12 Hours</MenuItem>
                  </Select>
                </FormControl>
              </>
            ) : (
              <Box>
                <Typography
                  variant="body2"
                  color="text.secondary">
                  (Automatic background backup is not supported in this browser.)
                </Typography>
                <Typography
                  variant="caption"
                  color="warning.main"
                  display="block"
                  sx={{ mt: 0.5 }}>
                  Brave users: You may need to enable <b>brave://flags/#file-system-access-api</b> and restart your
                  browser.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
