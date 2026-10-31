import { validateJsonFile } from '../validateJsonFile';

describe('validateJsonFile', () => {
  it.each([
    '{}',
    '[]',
    'null',
    'true',
    'false',
    '123.45e-6',
    '"hello"',
    ' \n {"rows":[{"text":"escaped \\" quote, \\u1234"},null,42]} \t ',
  ])('accepts a complete JSON document: %s', async (json) => {
    await expect(validateJsonFile(new Blob([json]))).resolves.toBeUndefined();
  });

  it.each([
    '',
    ' \n ',
    '{',
    '{"rows":[{"id":1}',
    '{"rows":[{"id":1},',
    '{"rows":[{"text":"unfinished',
    '{"rows":[]',
    '{"rows":[1,]}',
    '{"rows":[],}',
    '{"rows":true false}',
    '{} {}',
    '{} garbage',
    '{"number":01}',
    '{"number":1e}',
    '{"text":"bad\\xescape"}',
  ])('rejects invalid or incomplete JSON: %s', async (json) => {
    await expect(validateJsonFile(new Blob([json]))).rejects.toThrow();
  });

  it('validates across chunk boundaries, including split UTF-8 characters', async () => {
    // The first byte of the emoji lands at the end of the first 1 MiB chunk.
    const json = JSON.stringify({ text: 'x'.repeat(1024 * 1024 - 10) + '🌍', rows: [1, 2] });
    const file = new File([json], 'backup.json');
    const slice = jest.spyOn(file, 'slice');

    await expect(validateJsonFile(file)).resolves.toBeUndefined();
    expect(slice).toHaveBeenCalledTimes(2);
    expect(slice).toHaveBeenNthCalledWith(1, 0, 1024 * 1024);
    expect(slice).toHaveBeenNthCalledWith(2, 1024 * 1024, 2 * 1024 * 1024);
  });

  it('rejects truncation beyond the first chunk', async () => {
    const json = JSON.stringify({ text: 'x'.repeat(1024 * 1024), rows: [1, 2] });
    await expect(validateJsonFile(new Blob([json.slice(0, -1)]))).rejects.toThrow();
  });

  it('propagates file read failures', async () => {
    jest.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementationOnce((): never => {
      throw new Error('Read failed');
    });
    await expect(validateJsonFile(new Blob(['{}']))).rejects.toThrow('Read failed');
    jest.restoreAllMocks();
  });
});
