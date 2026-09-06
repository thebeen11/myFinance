import { ServiceUnavailableException } from '@nestjs/common';

import { readReceipt } from './gemini-receipt-reader';

describe('readReceipt', () => {
  const input = { imageBase64: 'aGVsbG8=', mimeType: 'image/jpeg' };

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  /**
   * An unset key means the feature is off, not that the app is broken — so it has
   * to read as "unavailable" and name the variable, rather than surfacing as the
   * anonymous 500 a thrown `Error` would produce.
   */
  it('reports scanning as unconfigured when no key is set', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(readReceipt(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('names the variable that turns it on', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(readReceipt(input)).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
