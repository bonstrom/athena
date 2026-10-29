import { screen, fireEvent, render } from '@testing-library/react';
import { getContrastRatio, ThemeProvider } from '@mui/material/styles';
import { renderWithTheme } from '../testUtils';
import { getAppTheme, ThemeMode } from '../theme';
import type { TopicMode } from '../database/AthenaDb';
import ModeBadge from './ModeBadge';
import ModeEmptyState from './ModeEmptyState';

const modes: { mode: TopicMode; label: string }[] = [
  { mode: 'topic', label: 'Chat' },
  { mode: 'debate', label: 'Debate' },
  { mode: 'curator', label: 'Curator' },
  { mode: 'checklist', label: 'Checklist' },
];

it.each(modes)('labels the $label icon even in compact navigation', ({ mode, label }) => {
  renderWithTheme(
    <ModeBadge
      mode={mode}
      compact
    />,
  );
  expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
});

describe.each<ThemeMode>(['light', 'dark'])('%s mode badges', (themeMode) => {
  it.each(modes)('pairs the $label accent with a readable label', ({ mode, label }) => {
    const theme = getAppTheme(themeMode, 'default');
    render(<ThemeProvider theme={theme}><ModeBadge mode={mode} /></ThemeProvider>);
    const badge = screen.getByText(label).parentElement;
    expect(badge?.querySelector('svg')).toBeInTheDocument();
    if (badge) {
      expect(getContrastRatio(getComputedStyle(badge).color, theme.palette.background.default)).toBeGreaterThan(4.5);
      expect(getComputedStyle(badge).backgroundColor).toMatch(/^(rgba\(0, 0, 0, 0\)|transparent|)$/);
      expect(getComputedStyle(badge).borderRadius).toMatch(/^(0(px)?|)$/);
    }
  });
});

it('offers one explicit action without sending a message', () => {
  const onAction = jest.fn();
  renderWithTheme(
    <ModeEmptyState
      mode="debate"
      title="Compare two perspectives"
      description="Choose two models."
      actionLabel="Write a question"
      onAction={onAction}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Write a question' }));
  expect(onAction).toHaveBeenCalledTimes(1);
});
