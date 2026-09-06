import { BadGatewayException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI, createPartFromBase64 } from '@google/genai';

import type {
  ExtractedCharge,
  ExtractedDiscount,
  ExtractedLine,
  ExtractedReceipt,
} from './extracted-receipt';

/** The photo to read, already validated and size-capped by `ScanReceiptDto`. */
export interface ReadReceiptInput {
  imageBase64: string;
  mimeType: string;
}

const logger = new Logger('GeminiReceiptReader');

/**
 * The best generally available reader, overridable without a deploy.
 *
 * `gemini-3.8-flash` is several times cheaper and, on receipt-sized text, close
 * enough that it is worth trying if a scan ever runs near Vercel's 30s function
 * cap — which is why the model is an env var rather than a constant in the call.
 */
const DEFAULT_MODEL = 'gemini-3.1-pro-preview';

/**
 * Written as rules rather than prose because the failure modes are specific and
 * each line here is one of them, ordered by how often it is what goes wrong.
 *
 * The separator rule is first for a reason: Indonesian receipts print `12.500`
 * for twelve thousand five hundred, and a model that reads it as `12.5` is not
 * slightly wrong, it is wrong by a factor of a thousand.
 */
const PROMPT = [
  'You are reading a photograph of a shop or restaurant receipt. Extract what it says.',
  '',
  'Rules, in order of importance:',
  '1. NUMBERS. Amounts are commonly printed in Indonesian format, where "." separates',
  '   thousands and "," separates decimals. "12.500" is twelve thousand five hundred, so',
  '   return 12500. "12.500,50" is 12500.5. Return plain numbers only: no currency symbol,',
  '   no thousands separators, no "Rp".',
  '2. unitPrice is the price of ONE unit. If the receipt prints only a line total, divide it',
  '   by the quantity. If it prints both, take the per-unit figure.',
  '3. quantity MAY BE FRACTIONAL. Anything sold by weight or volume prints the measure and a',
  '   price per kilo or per litre: "SEMANGKA 1,5 KG x 40.000 = 60.000" is quantity 1.5 and',
  '   unitPrice 40000 — never quantity 1 at 60000, and never quantity 2. Read "1,5" as one',
  '   and a half (rule 1: the comma is the decimal separator). Keep up to three decimals,',
  '   so "0,825 KG" is 0.825. When the receipt prints no quantity at all, return 1.',
  '4. Tax, service charge, delivery, packaging, rounding and any other amount that was paid',
  '   but not bought belongs in "charges", never in "lines". Things the shop sells go in',
  '   "lines".',
  '5. "discounts" lists every promotion printed under a single line, in the order printed —',
  '   a product promo and a member discount on the same line are two entries. Give each one',
  '   either "percent" (10% is 10) or "amount" (the figure as printed), whichever the',
  '   receipt shows, and null for the other. Use "name" for the label beside it. An empty',
  '   array when the line has none. A discount printed as a lump sum off the whole bill is',
  '   not a line discount — leave it out and it will be reconciled against the total.',
  '6. "grandTotal" is the final total the receipt itself prints, after everything.',
  '7. If a field is creased, cut off or unreadable, return null. Do not guess, do not',
  '   invent lines, and do not include a line you cannot read a price for.',
  '8. "purchasedOn" is the transaction date as YYYY-MM-DD.',
].join('\n');

/**
 * JSON Schema handed to the model as a response format.
 *
 * A strong constraint, not a guarantee — `parseExtractedReceipt` re-checks
 * everything, because a schema the model mostly honours is still a promise made
 * by the thing being validated.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    merchantName: { type: ['string', 'null'] },
    purchasedOn: { type: ['string', 'null'] },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: ['string', 'null'] },
          name: { type: 'string' },
          // Spelled out here as well as in the prompt: an integer is what a model
          // reaches for by default, and a weighed line is exactly where that is wrong.
          quantity: {
            type: 'number',
            description: 'May be fractional for weighed or measured goods — 1.5 kg is 1.5.',
          },
          unitPrice: { type: 'number' },
          discounts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: ['string', 'null'] },
                percent: { type: ['number', 'null'] },
                amount: { type: ['number', 'null'] },
              },
              required: ['name', 'percent', 'amount'],
            },
          },
        },
        required: ['code', 'name', 'quantity', 'unitPrice', 'discounts'],
      },
    },
    charges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          percent: { type: ['number', 'null'] },
          amount: { type: 'number' },
        },
        required: ['name', 'percent', 'amount'],
      },
    },
    grandTotal: { type: ['number', 'null'] },
  },
  required: ['merchantName', 'purchasedOn', 'lines', 'charges', 'grandTotal'],
};

/**
 * Reads one receipt photo with Gemini.
 *
 * The only function in the codebase that knows a model is involved, so callers
 * mock this rather than the network, and swapping providers touches one file.
 *
 * @throws ServiceUnavailableException when scanning is unconfigured or unreachable.
 * @throws BadGatewayException when it answers with something that is not a receipt.
 */
export const readReceipt = async (input: ReadReceiptInput): Promise<ExtractedReceipt> => {
  // Read at call time, not at module load: a missing key must fail this one route
  // rather than stop the API booting, the same posture as PrismaService's soft
  // failure when the database is down.
  //
  // Deliberately not `requireEnv`: that helper is for a secret the app cannot run
  // without, and its message is written for whoever is setting the app up. Receipt
  // scanning is one optional capability, so an unset key is "this feature is off"
  // — a 503 that says which variable turns it on — rather than a bare 500.
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new ServiceUnavailableException(
      'Receipt scanning is not configured on this server (GEMINI_API_KEY is unset).',
    );
  }

  const client = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  let text: string | undefined;

  try {
    const response = await client.models.generateContent({
      model,
      contents: [{ text: PROMPT }, createPartFromBase64(input.imageBase64, input.mimeType)],
      config: { responseMimeType: 'application/json', responseJsonSchema: RESPONSE_SCHEMA },
    });

    text = response.text;
  } catch (error: unknown) {
    logger.error(`Gemini call failed on model ${model}`, error);

    throw new ServiceUnavailableException('Could not reach the receipt reader. Try again.');
  }

  if (!text) {
    throw new BadGatewayException('The receipt reader returned nothing to read.');
  }

  return parseExtractedReceipt(text, model);
};

const parseExtractedReceipt = (text: string, model: string): ExtractedReceipt => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    logger.error(`Model ${model} returned text that is not JSON`);

    throw new BadGatewayException('Could not read that receipt. Try a clearer photo.');
  }

  if (!isRecord(parsed)) {
    throw new BadGatewayException('Could not read that receipt. Try a clearer photo.');
  }

  return {
    merchantName: asText(parsed.merchantName),
    purchasedOn: asText(parsed.purchasedOn),
    lines: asArray(parsed.lines).map(toLine).filter(isPresent),
    charges: asArray(parsed.charges).map(toCharge).filter(isPresent),
    grandTotal: asFiniteNumber(parsed.grandTotal),
  };
};

/**
 * A line the model could not describe completely is dropped rather than repaired.
 *
 * A missing name or an unreadable price has no safe default: zero would post a
 * free item, and a guess would be a number nobody typed. Dropping it makes the
 * receipt fail its own total check, which is exactly the signal the reviewer needs.
 */
const toLine = (value: unknown): ExtractedLine | undefined => {
  if (!isRecord(value)) return undefined;

  const name = asText(value.name);
  const unitPrice = asFiniteNumber(value.unitPrice);

  if (!name || unitPrice === null || unitPrice < 0) return undefined;

  const quantity = asFiniteNumber(value.quantity);

  return {
    code: asText(value.code),
    name,
    // A fractional quantity is a weighed item ("0.825 kg") and is kept as read —
    // a line stores thousandths of a unit, so the weight no longer has to fold
    // into the price. Anything below half a gram would scale to zero and post a
    // free line, so that reads as "no quantity printed" and falls back to one.
    quantity: quantity !== null && quantity >= 0.001 ? quantity : 1,
    unitPrice,
    discounts: asArray(value.discounts).map(toDiscount).filter(isPresent),
  };
};

/**
 * A discount survives only if it carries exactly one usable figure.
 *
 * Both would be a claim the cascade cannot honour — a rate is re-derived when the
 * line moves and an amount is not — and neither is nothing to subtract. Dropping
 * the row leaves the receipt failing its own total check, which is the signal the
 * reviewer needs, rather than a plausible figure nobody typed.
 */
const toDiscount = (value: unknown): ExtractedDiscount | undefined => {
  if (!isRecord(value)) return undefined;

  const percent = asFiniteNumber(value.percent);
  const amount = asFiniteNumber(value.amount);
  const hasPercent = percent !== null && percent > 0 && percent <= 100;
  const hasAmount = amount !== null && amount > 0;

  if (hasPercent === hasAmount) return undefined;

  return {
    name: asText(value.name),
    percent: hasPercent ? percent : null,
    amount: hasAmount ? amount : null,
  };
};

const toCharge = (value: unknown): ExtractedCharge | undefined => {
  if (!isRecord(value)) return undefined;

  const name = asText(value.name);
  const amount = asFiniteNumber(value.amount);

  if (!name || amount === null || amount < 0) return undefined;

  const percent = asFiniteNumber(value.percent);

  return { name, percent: percent !== null && percent >= 0 ? percent : null, amount };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const isPresent = <T>(value: T | undefined): value is T => value !== undefined;
