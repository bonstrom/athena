export const fontOptions = [
  {
    id: 'system',
    label: 'System default',
    description: 'Familiar',
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  { id: 'inter', label: 'Inter', description: 'Professional', family: '"Inter Variable", Arial, sans-serif' },
  { id: 'lora', label: 'Lora', description: 'Editorial', family: '"Lora Variable", Georgia, serif' },
  { id: 'nunito', label: 'Nunito', description: 'Friendly', family: '"Nunito Variable", Arial, sans-serif' },
  { id: 'comic-neue', label: 'Comic Neue', description: 'Playful', family: '"Comic Neue", cursive' },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', description: 'Technical', family: '"IBM Plex Mono", monospace' },
] as const;

export type FontId = (typeof fontOptions)[number]['id'];

export const isFontId = (value: unknown): value is FontId => fontOptions.some((font) => font.id === value);

export const getFontFamily = (fontId: string): string =>
  (fontOptions.find((font) => font.id === fontId) ?? fontOptions[0]).family;
