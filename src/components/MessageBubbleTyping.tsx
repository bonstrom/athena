import { Box, Paper, Tooltip, Typography } from "@mui/material";
import TypingIndicator from "./TypingIndicator";
import { ChatModel, isDeepSeekPeakHours } from "./ModelSelector";
import WhatshotIcon from "@mui/icons-material/Whatshot";

interface MessageBubbleTypingProps {
  model: ChatModel;
}

const MessageBubbleTyping: React.FC<MessageBubbleTypingProps> = ({ model }) => {
  return (
    <Paper
      sx={{
        p: 2,
        width: "100%",
        borderRadius: 3,
        bgcolor: (theme) => theme.palette.assistant.main,
        color: (theme) => theme.palette.assistant.contrastText,
      }}>
      <Box sx={{ width: "100%" }}>
        <Box
          display="flex"
          justifyContent="space-between"
          mb={0.5}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {model.label}
            {isDeepSeekPeakHours() && model.providerId === 'builtin-deepseek' && (
              <Tooltip title="DeepSeek peak hours — 2x pricing">
                <WhatshotIcon sx={{ fontSize: 14, color: 'warning.main' }} />
              </Tooltip>
            )}
          </Typography>
        </Box>

        <Box mt={1}>
          <TypingIndicator />
        </Box>
      </Box>
    </Paper>
  );
};

export default MessageBubbleTyping;
