import {
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  alpha,
} from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { useLogout, useAuthStore } from "../store/AuthStore";
import { useTopicStore } from "../store/TopicStore";
import ForumIcon from "@mui/icons-material/Forum";
import AddIcon from "@mui/icons-material/Add";

const Home: React.FC = () => {
  const navigate = useNavigate();
  const logout = useLogout();
  const { userName } = useAuthStore();
  const { topics, createTopic } = useTopicStore();

  const handleCreateTopic = async (): Promise<void> => {
    const topic = await createTopic();
    if (topic?.id) {
      void navigate(`/chat/${topic.id}`);
    }
  };

  return (
    <Box
      sx={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        p: 4,
        textAlign: "center",
        background: (theme) =>
          theme.palette.mode === "dark"
            ? `radial-gradient(circle at 50% 50%, ${alpha(theme.palette.primary.main, 0.05)} 0%, transparent 70%)`
            : `radial-gradient(circle at 50% 50%, ${alpha(theme.palette.primary.main, 0.03)} 0%, transparent 70%)`,
      }}>
      <Box
        component="img"
        src={`${process.env.PUBLIC_URL || ""}/icons/android-chrome-192x192.png`}
        alt="Athena Logo"
        sx={{
          width: 120,
          height: 120,
          mb: 3,
          filter: (theme) => (theme.palette.mode === "dark" ? "drop-shadow(0 0 12px rgba(255,255,255,0.1))" : "none"),
        }}
      />

      <Typography
        variant="h4"
        gutterBottom
        sx={{ fontWeight: "bold" }}>
        Welcome to Athena
      </Typography>
      <Typography
        variant="h6"
        color="text.secondary"
        gutterBottom>
        Hello, {userName}
      </Typography>

      <Box
        sx={{
          width: "100%",
          maxWidth: 600,
          mt: 4,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={(): void => {
            void handleCreateTopic();
          }}
          sx={{
            py: 1.5,
            borderRadius: 3,
            textTransform: "none",
            fontSize: "1.1rem",
            boxShadow: (theme) => (theme.palette.mode === "dark" ? "0 4px 20px rgba(0,0,0,0.4)" : theme.shadows[4]),
          }}>
          Start a New Conversation
        </Button>

        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: (theme) => `1px solid ${theme.palette.divider}`,
            overflow: "hidden",
            bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)"),
          }}>
          <Box
            sx={{
              p: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
            }}>
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: "bold", display: "flex", alignItems: "center", gap: 1 }}>
              <ForumIcon
                fontSize="small"
                color="primary"
              />
              Recent Topics
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary">
              {topics.length} total
            </Typography>
          </Box>
          <Divider />
          <List sx={{ py: 0, maxHeight: 300, overflowY: "auto" }}>
            {topics.slice(0, 10).map((topic) => {
              return (
                <ListItem
                  key={topic.id}
                  disablePadding
                  divider>
                  <ListItemButton
                    component={Link}
                    to={`/chat/${topic.id}`}>
                    <ListItemText
                      primary={topic.name || "Untitled Conversation"}
                      secondary={new Date(topic.updatedOn).toLocaleString()}
                      primaryTypographyProps={{
                        variant: "body2",
                        sx: {
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        },
                      }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
            {topics.length === 0 && (
              <Box sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
                <Typography variant="body2">No conversations yet.</Typography>
              </Box>
            )}
          </List>
          {topics.length > 10 && (
            <Button
              fullWidth
              sx={{ py: 1, borderRadius: 0, textTransform: "none", fontSize: "0.8rem", color: "text.secondary" }}
              onClick={(): void => {
                // Topic list is usually in sidebar
              }}>
              View more in the sidebar
            </Button>
          )}
        </Paper>

        <Box sx={{ mt: 2 }}>
          <Button
            onClick={(): void => {
              logout();
            }}
            color="inherit"
            sx={{ opacity: 0.6, "&:hover": { opacity: 1 } }}
            size="small">
            Logout
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default Home;
