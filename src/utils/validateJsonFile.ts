import { JSONParser, TokenType } from '@streamparser/json';

const CHUNK_SIZE = 1024 * 1024;

/** Validate the entire JSON document without retaining its parsed values. */
export async function validateJsonFile(file: Blob): Promise<void> {
  const parser = new JSONParser({ paths: [], keepStack: false });
  let previousToken: TokenType | undefined;
  parser.onToken = ({ token }): void => {
    // Discarding object properties can otherwise make a trailing comma look
    // like an empty object to the parser.
    if (
      previousToken === TokenType.COMMA &&
      (token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET)
    ) {
      throw new Error('Trailing comma in JSON.');
    }
    previousToken = token;
  };

  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const chunk = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (): void => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error('Could not read JSON file.'));
      };
      reader.onerror = (): void => reject(reader.error ?? new Error('Could not read JSON file.'));
      reader.onabort = (): void => reject(new Error('JSON file read aborted.'));
      reader.readAsArrayBuffer(file.slice(offset, offset + CHUNK_SIZE));
    });
    parser.write(new Uint8Array(chunk));
  }

  // Unlike the Dexie importer, end() rejects incomplete objects and strings.
  if (!parser.isEnded) parser.end();
  if (previousToken === undefined) throw new Error('Empty JSON document.');
}
