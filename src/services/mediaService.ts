import { Attachment } from '../database/AthenaDb';
import { generateMinimaxImage, generateMinimaxMusic } from './llmService';

export interface MediaResult {
  content: string;
  attachment: Attachment;
  model: string;
}

/**
 * Parse the user's prompt for an optional "Ratio: W:H" suffix, call the
 * Minimax image API, and return a ready-to-persist MediaResult.
 */
export async function generateImage(prompt: string, signal?: AbortSignal): Promise<MediaResult> {
  let imagePrompt = prompt.trim();
  let aspectRatio = '1:1';

  const ratioMatch = prompt.match(/Ratio:\s*(\d+:\d+)/i);
  if (ratioMatch) {
    aspectRatio = ratioMatch[1];
    imagePrompt = prompt.replace(ratioMatch[0], '').trim();
  }

  const { base64 } = await generateMinimaxImage(imagePrompt, aspectRatio, signal);

  const attachment: Attachment = {
    id: crypto.randomUUID(),
    name: 'generated-image.png',
    type: 'image/png',
    size: 0,
    data: `data:image/png;base64,${base64}`,
    previewUrl: `data:image/png;base64,${base64}`,
  };

  return { content: 'Here is your generated image:', attachment, model: 'image-01' };
}

/**
 * Split the user's prompt into a style description and optional lyrics
 * (separated by "---" or detected by "[section]" brackets), call the
 * Minimax music API, convert the hex response to base64, and return a
 * ready-to-persist MediaResult.
 */
export async function generateMusic(prompt: string, signal?: AbortSignal): Promise<MediaResult> {
  let musicPrompt = prompt.trim();
  let lyrics = '';

  const lines = prompt.split('\n');
  if (lines.length > 1) {
    const separatorIndex = lines.findIndex((l) => l.trim() === '---');
    if (separatorIndex !== -1) {
      musicPrompt = lines.slice(0, separatorIndex).join('\n').trim();
      lyrics = lines
        .slice(separatorIndex + 1)
        .join('\n')
        .trim();
    } else if (prompt.includes('[') && prompt.includes(']')) {
      const firstBracketIndex = prompt.indexOf('[');
      musicPrompt = prompt.slice(0, firstBracketIndex).trim();
      lyrics = prompt.slice(firstBracketIndex).trim();
    }
  }

  const { audioHex } = await generateMinimaxMusic(musicPrompt, lyrics, signal);

  const bytes = new Uint8Array(audioHex.length / 2);
  for (let i = 0; i < audioHex.length / 2; i++) {
    bytes[i] = parseInt(audioHex.substring(i * 2, i * 2 + 2), 16);
  }

  const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });

  // 10 MB guard — base64 encoding inflates size by ~33%, so 10 MB blob → ~13 MB data URL.
  // IndexedDB entries above ~15 MB can cause storage quota errors in some browsers.
  const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
  if (audioBlob.size > MAX_AUDIO_BYTES) {
    throw new Error(`Generated audio file is too large (${(audioBlob.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed is 10 MB.`);
  }

  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = (): void => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to convert generated audio to base64 data URL.'));
    };
    reader.onerror = (): void => {
      reject(new Error('Failed to read generated audio blob.'));
    };
    reader.readAsDataURL(audioBlob);
  });

  const attachment: Attachment = {
    id: crypto.randomUUID(),
    name: 'generated-music.mp3',
    type: 'audio/mpeg',
    size: audioBlob.size,
    data: base64Data,
  };

  return { content: 'Here is your generated music:', attachment, model: 'music-2.6' };
}
