import { fireEvent, render, screen } from '@testing-library/react';
import SuggestedReplies from './SuggestedReplies';

describe('SuggestedReplies', () => {
  it('renders nothing when suggestions are empty', () => {
    const { container } = render(<SuggestedReplies suggestions={[]} onSelect={jest.fn()} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders suggestions and calls onSelect when a chip is clicked', () => {
    const onSelect: jest.MockedFunction<(text: string) => void> = jest.fn();

    render(<SuggestedReplies suggestions={['Yes, continue', 'Tell me more']} onSelect={onSelect} />);

    expect(screen.getByText('Suggested replies')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Tell me more'));

    expect(onSelect).toHaveBeenCalledWith('Tell me more');
  });
});
