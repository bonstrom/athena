import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme';

export function renderWithTheme(ui: React.ReactElement): RenderResult {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}
