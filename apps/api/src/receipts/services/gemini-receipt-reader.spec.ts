import { ServiceUnavailableException } from '@nestjs/common';

import { readReceipt } from './gemini-receipt-reader';

const mockGenerateContent = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ models: { generateContent: mockGenerateContent } })),
  createPartFromBase64: jest.fn(() => ({ inlineData: {} })),
}));

describe('readReceipt', () => {
  const input = { imageBase64: 'aGVsbG8=', mimeType: 'image/jpeg' };

  /** What the model answers with, as the one string the parser is handed. */
  const answering = (receipt: unknown): void => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(receipt) });
  };

  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

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

  describe('quantities', () => {
    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key';
    });

    const line = (quantity: unknown) => ({
      merchantName: 'Superindo',
      purchasedOn: '2026-09-01',
      lines: [{ code: null, name: 'Semangka', quantity, unitPrice: 40000, discounts: [] }],
      charges: [],
      grandTotal: 60000,
    });

    it('keeps a weighed quantity rather than rounding it to a whole unit', async () => {
      answering(line(1.5));

      const receipt = await readReceipt(input);

      expect(receipt.lines[0].quantity).toBe(1.5);
    });

    it('keeps a three-decimal weight, which is what a shop scale prints', async () => {
      answering(line(0.825));

      const receipt = await readReceipt(input);

      expect(receipt.lines[0].quantity).toBe(0.825);
    });

    /**
     * Below half a gram there is nothing to buy, and the scaled quantity would be
     * zero — a free line. An unreadable quantity means one of the thing, which is
     * what a receipt that prints no quantity column is saying anyway.
     */
    it('falls back to one when the quantity is missing or too small to be real', async () => {
      answering(line(null));
      expect((await readReceipt(input)).lines[0].quantity).toBe(1);

      answering(line(0));
      expect((await readReceipt(input)).lines[0].quantity).toBe(1);

      answering(line(0.0001));
      expect((await readReceipt(input)).lines[0].quantity).toBe(1);
    });
  });
});
