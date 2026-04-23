import { fireEvent, render, screen } from '@testing-library/react';
import { GlobalErrorSnackbar } from './GlobalErrorSnackbar';
import { useNotificationStore } from '../store/NotificationStore';

jest.mock('../store/NotificationStore', () => ({
  useNotificationStore: jest.fn(),
}));

const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock<{
  notifications: { id: string; title?: string; message: string }[];
  removeNotification: (id: string) => void;
}>;

describe('GlobalErrorSnackbar', () => {
  it('shows latest notification and removes it on close', () => {
    const removeNotification: jest.MockedFunction<(id: string) => void> = jest.fn();

    mockUseNotificationStore.mockReturnValue({
      notifications: [{ id: 'n1', title: 'Error', message: 'Something failed' }],
      removeNotification,
    });

    render(<GlobalErrorSnackbar />);

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Something failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(removeNotification).toHaveBeenCalledWith('n1');
  });
});
