import React from "react";
import { Box } from "@mui/material";

const TypingIndicator: React.FC = () => {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Box
          key={i}
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "currentColor",
            animation: "bounce 1.2s infinite",
            animationDelay: `${i * 0.2}s`,
            "@keyframes bounce": {
              "0%, 80%, 100%": {
                transform: "scale(0)",
              },
              "40%": {
                transform: "scale(1)",
              },
            },
          }}
        />
      ))}
    </Box>
  );
};

export default TypingIndicator;
