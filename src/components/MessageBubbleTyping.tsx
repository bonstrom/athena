import { Box, Paper, Typography } from "@mui/material";
import TypingIndicator from "./TypingIndicator";
import { ChatModel } from "./ModelSelector";

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
            color="text.secondary">
            {model.label}
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
