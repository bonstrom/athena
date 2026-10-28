import { render, screen } from '@testing-library/react';
import ActivityIndicator, { AssistantActivity } from './ActivityIndicator';

describe('ActivityIndicator', () => {
  it.each<[AssistantActivity, string]>([
    ['thinking', 'Thinking'],
    ['writing', 'Writing'],
    ['searching', 'Searching the web'],
    ['reading', 'Reading'],
    ['working', 'Using tools'],
  ])('announces %s activity with a text label', (activity, label) => {
    render(<ActivityIndicator activity={activity} />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('updates the status rather than adding duplicate announcements', () => {
    const { rerender } = render(<ActivityIndicator activity="thinking" />);
    rerender(<ActivityIndicator activity="writing" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByText('Thinking')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Writing');
  });
});
