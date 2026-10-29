import { getContrastRatio, getLuminance } from '@mui/material/styles';
import { colorPresets, getAppTheme, ThemeMode } from './theme';
import { fontOptions } from './constants/fonts';

describe.each<ThemeMode>(['light', 'dark'])('%s palette surfaces', (mode) => {
  it('tints page surfaces but keeps panels neutral across presets', () => {
    const themes = colorPresets.map((preset) => getAppTheme(mode, preset.id));
    expect(new Set(themes.map((theme) => theme.palette.background.default)).size).toBe(colorPresets.length);
    expect(new Set(themes.map((theme) => theme.palette.background.paper)).size).toBe(1);
    expect(themes[0].palette.background.paper).toBe(mode === 'dark' ? '#1d2027' : '#f3f4f6');
  });

  it.each(colorPresets)('keeps $label surfaces readable and message colors unchanged', (preset) => {
    const theme = getAppTheme(mode, preset.id);
    for (const surface of [theme.palette.background.default, theme.palette.background.paper]) {
      const text = mode === 'dark' ? '#ffffff' : '#000000';
      expect(getContrastRatio(surface, text)).toBeGreaterThan(7);
      expect(getContrastRatio(surface, theme.palette.text.secondary)).toBeGreaterThan(4.5);
    }
    expect(theme.palette.assistant.main).toBe(preset[mode].assistant);
    expect(theme.palette.aiNote.main).toBe(preset[mode].aiNote);
  });

  it('falls back to the default preset for an unknown ID', () => {
    expect(getAppTheme(mode, 'unknown').palette.background).toEqual(getAppTheme(mode, 'default').palette.background);
  });

  it.each(fontOptions)('applies $label to typography without changing the palette', (font) => {
    const theme = getAppTheme(mode, 'default', font.id);
    expect(theme.typography.fontFamily).toBe(font.family);
    expect(theme.palette.background).toEqual(getAppTheme(mode, 'default').palette.background);
  });
});

it.each(colorPresets)('softens $label light surfaces without flattening the panel hierarchy', (preset) => {
  const { background } = getAppTheme('light', preset.id).palette;
  expect(getLuminance(background.paper)).toBeLessThan(0.92);
  expect(getLuminance(background.default)).toBeLessThan(getLuminance(background.paper));
});
