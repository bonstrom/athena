import { screen, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../../testUtils';

const mockOpen = jest.fn<Promise<void>, []>();
const mockClose = jest.fn<() => void>();

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    open: (): Promise<void> => mockOpen(),
    close: (): void => {
      mockClose();
    },
  },
}));

import DatabaseGate from '../DatabaseGate';

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders children once the database opens', async () => {
  mockOpen.mockResolvedValue(undefined);

  renderWithTheme(
    <DatabaseGate>
      <div>App content</div>
    </DatabaseGate>,
  );

  expect(await screen.findByText('App content')).toBeInTheDocument();
});

it('shows the recovery screen when the database fails to open', async () => {
  mockOpen.mockRejectedValue(new Error('Migration failed'));

  renderWithTheme(
    <DatabaseGate>
      <div>App content</div>
    </DatabaseGate>,
  );

  expect(await screen.findByText('Could not open your database')).toBeInTheDocument();
  expect(screen.getByText(/Migration failed/)).toBeInTheDocument();
  expect(screen.queryByText('App content')).not.toBeInTheDocument();
});

it('retry closes and reopens the database', async () => {
  mockOpen.mockRejectedValueOnce(new Error('Migration failed'));
  mockOpen.mockResolvedValueOnce(undefined);

  renderWithTheme(
    <DatabaseGate>
      <div>App content</div>
    </DatabaseGate>,
  );

  const retry = await screen.findByRole('button', { name: 'Retry' });
  retry.click();

  await waitFor(() => expect(mockClose).toHaveBeenCalled());
  expect(await screen.findByText('App content')).toBeInTheDocument();
});
