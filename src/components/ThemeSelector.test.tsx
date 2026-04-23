import { fireEvent, render, screen } from '@testing-library/react';
import ThemeSelector from './ThemeSelector';
import { useAuthStore } from '../store/AuthStore';

const mockSetThemeMode: jest.MockedFunction<(mode: 'light' | 'dark') => void> = jest.fn();
const mockSetColorTheme: jest.MockedFunction<(id: string) => void> = jest.fn();

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

interface ThemeSelectorStoreSlice {
  themeMode: 'light' | 'dark';
  colorTheme: string;
  setThemeMode: (mode: 'light' | 'dark') => void;
  setColorTheme: (id: string) => void;
}

const mockUseAuthStore = useAuthStore as unknown as jest.Mock<ThemeSelectorStoreSlice>;

describe('ThemeSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthStore.mockReturnValue({
      themeMode: 'dark',
      colorTheme: 'default',
      setThemeMode: mockSetThemeMode,
      setColorTheme: mockSetColorTheme,
    });
  });

  it('calls setThemeMode when light mode is selected', () => {
    render(<ThemeSelector />);

    fireEvent.click(screen.getByRole('button', { name: /light/i }));

    expect(mockSetThemeMode).toHaveBeenCalledWith('light');
  });

  it('calls setColorTheme when a color preset is clicked', () => {
    render(<ThemeSelector />);

    fireEvent.click(screen.getByText('Forest Green'));

    expect(mockSetColorTheme).toHaveBeenCalledWith('forest');
  });
});
