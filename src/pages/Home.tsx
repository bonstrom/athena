import { useMediaQuery, Box, Typography, Button } from "@mui/material";
import { useLogout, useAuthStore } from "../store/AuthStore";

const drawerWidth = 300;

const Home: React.FC = () => {
  const isDesktop = useMediaQuery("(min-width:600px)");

  const logout = useLogout();
  const { userName } = useAuthStore();

  return (
    <Box
      sx={{
        flexGrow: 1,
        p: 3,
        ...(isDesktop && {
          ml: `${drawerWidth}px`,
        }),
      }}>
      <Typography variant="h5">Welcome to Athena</Typography>

      {
        <Box
          mt={2}
          display="flex"
          alignItems="center"
          gap={2}>
          <Box>
            <Typography variant="body1">{userName}</Typography>
          </Box>
        </Box>
      }
      <Button
        onClick={(): void => {
          logout();
        }}
        sx={{ mt: 3 }}
        variant="outlined">
        Logout
      </Button>
    </Box>
  );
};

export default Home;
