import { generateMinimaxImage, generateMinimaxMusic } from '../llmService';
import { generateImage, generateMusic } from '../mediaService';

jest.mock('../llmService', () => ({
  generateMinimaxImage: jest.fn(),
  generateMinimaxMusic: jest.fn(),
}));

const mockGenerateMinimaxImage = generateMinimaxImage as jest.MockedFunction<typeof generateMinimaxImage>;
const mockGenerateMinimaxMusic = generateMinimaxMusic as jest.MockedFunction<typeof generateMinimaxMusic>;

describe('mediaService', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: jest.fn((): string => 'test-uuid') },
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generateImage strips ratio suffix and forwards parsed aspect ratio', async () => {
    mockGenerateMinimaxImage.mockResolvedValue({ base64: 'abc123' });

    const result = await generateImage('Create a sunset scene Ratio: 16:9');

    expect(mockGenerateMinimaxImage).toHaveBeenCalledWith('Create a sunset scene', '16:9', undefined);
    expect(result.model).toBe('image-01');
    expect(result.attachment.type).toBe('image/png');
    expect(result.attachment.data).toBe('data:image/png;base64,abc123');
    expect(result.attachment.previewUrl).toBe('data:image/png;base64,abc123');
  });

  it('generateMusic splits prompt and lyrics using separator line', async () => {
    mockGenerateMinimaxMusic.mockResolvedValue({ audioHex: 'ff00' });

    const result = await generateMusic('Calm piano music\n---\n[Verse]\nHello world');

    expect(mockGenerateMinimaxMusic).toHaveBeenCalledWith('Calm piano music', '[Verse]\nHello world', undefined);
    expect(result.model).toBe('music-2.6');
    expect(result.attachment.type).toBe('audio/mpeg');
    expect(result.attachment.size).toBe(2);
    expect(result.attachment.data.startsWith('data:audio/mpeg;base64,')).toBe(true);
  });

  it('generateMusic detects bracketed lyrics when no separator exists', async () => {
    mockGenerateMinimaxMusic.mockResolvedValue({ audioHex: 'ff00' });

    await generateMusic('Dreamy synthwave [Chorus]\nStay tonight');

    expect(mockGenerateMinimaxMusic).toHaveBeenCalledWith('Dreamy synthwave', '[Chorus]\nStay tonight', undefined);
  });

  it('generateMusic throws when generated audio exceeds 10MB', async () => {
    mockGenerateMinimaxMusic.mockResolvedValue({ audioHex: '00' });

    const originalBlob = globalThis.Blob;
    class OversizedBlob {
      public readonly size: number;

      public constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        void parts;
        void options;
        this.size = 10 * 1024 * 1024 + 1;
      }
    }

    (globalThis as unknown as { Blob: typeof Blob }).Blob = OversizedBlob as unknown as typeof Blob;

    await expect(generateMusic('Large track')).rejects.toThrow('Maximum allowed is 10 MB.');

    (globalThis as unknown as { Blob: typeof Blob }).Blob = originalBlob;
  });

  it('generateMusic rejects when FileReader fails to read audio blob', async () => {
    mockGenerateMinimaxMusic.mockResolvedValue({ audioHex: 'ff00' });

    const originalFileReader = globalThis.FileReader;

    class FailingFileReader {
      public result: string | ArrayBuffer | null = null;
      public onloadend: (() => void) | null = null;
      public onerror: (() => void) | null = null;

      public readAsDataURL(_blob: Blob): void {
        if (this.onerror) {
          this.onerror();
        }
      }
    }

    (globalThis as unknown as { FileReader: typeof FileReader }).FileReader = FailingFileReader as unknown as typeof FileReader;

    await expect(generateMusic('Calm piano music')).rejects.toThrow('Failed to read generated audio blob.');

    (globalThis as unknown as { FileReader: typeof FileReader }).FileReader = originalFileReader;
  });
});
