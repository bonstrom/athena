import { render } from '@testing-library/react';
import TypingIndicator from './TypingIndicator';

describe('TypingIndicator', () => {
  it('renders three bouncing dots', () => {
    const { container } = render(<TypingIndicator />);

    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.childElementCount).toBe(3);
  });
});
