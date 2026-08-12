import { getCurrencyFractionDigits } from '@myfinance/shared';

import { MONEY_LOCALE } from './format';

/**
 * Entering money, as opposed to rendering it (`format.ts`).
 *
 * All of it is pure — a keystroke goes in, the field's next text, caret and
 * numeric value come out — so the React component is left holding nothing but
 * DOM wiring, and the fiddly parts can be tested without a browser.
 */

/**
 * The locale's group and decimal separators, read from `Intl` rather than
 * hardcoded — id-ID and en-US swap "." and ",", so guessing gets it backwards.
 */
const separators = (() => {
  const parts = new Intl.NumberFormat(MONEY_LOCALE).formatToParts(12345.6);
  return {
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
  };
})();

/**
 * Which characters may begin the fraction.
 *
 * Never the group separator: in id-ID that is ".", so treating "." as a decimal
 * point would read the app's own "1.234" back as 1 and change 1,234 to 1.
 */
const decimalKeys = new Set(
  [separators.decimal, '.', ','].filter((key) => key !== separators.group),
);

const inputFormatters = new Map<number, Intl.NumberFormat>();

const inputFormatter = (fractionDigits: number): Intl.NumberFormat => {
  const cached = inputFormatters.get(fractionDigits);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  inputFormatters.set(fractionDigits, formatter);
  return formatter;
};

/** Beyond this the integer part leaves the safe range and `Number` starts lying. */
const MAX_INPUT_DIGITS = 15;

const isDigit = (char: string | undefined): boolean =>
  char !== undefined && char >= '0' && char <= '9';

const countDigits = (text: string): number => {
  let digits = 0;
  for (const char of text) if (isDigit(char)) digits += 1;
  return digits;
};

/**
 * Where the caret belongs after reformatting: just past the same digit the user
 * was behind. Anchoring to a raw offset instead would drift every time a group
 * separator appears or disappears — typing "1000" would leave the caret before
 * the "0" the moment "1.000" gained its dot.
 */
const caretAfterDigits = (text: string, digits: number): number => {
  if (digits === 0) return 0;

  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!isDigit(text[index])) continue;
    seen += 1;
    if (seen === digits) return index + 1;
  }

  return text.length;
};

const indexOfDecimalKey = (text: string): number => {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== undefined && decimalKeys.has(char)) return index;
  }
  return -1;
};

interface Edit {
  readonly text: string;
  readonly caret: number;
}

/**
 * Where the caret belongs in the reformatted text.
 *
 * Counting digits alone cannot express "just after the decimal separator the
 * user has this moment typed" — there are no digits past it yet, so a digit
 * count puts the caret in front of it and the next keypress lands on the
 * integer side, turning 1,5 into 15. Hence the two cases.
 */
const caretTarget = (formatted: string, edit: Edit): number => {
  const rawSeparator = indexOfDecimalKey(edit.text);
  const formattedSeparator = formatted.indexOf(separators.decimal);

  // In the fraction, and the formatted text kept a fraction to be in. (A
  // 0-decimal currency drops the separator, so it falls through to the integer
  // branch and the caret simply stays after the digits.)
  if (rawSeparator !== -1 && edit.caret > rawSeparator && formattedSeparator !== -1) {
    const fractionDigits = countDigits(edit.text.slice(rawSeparator + 1, edit.caret));
    return Math.min(formattedSeparator + 1 + fractionDigits, formatted.length);
  }

  return caretAfterDigits(formatted, countDigits(edit.text.slice(0, edit.caret)));
};

/**
 * Backspace and Delete land on a group separator often, and deleting one alone
 * achieves nothing — regrouping puts it straight back, so the key looks dead.
 * Take the adjacent digit instead, which is what the keypress meant.
 */
const dropDigitBefore = (text: string, caret: number): Edit => {
  for (let index = caret - 1; index >= 0; index -= 1) {
    if (isDigit(text[index])) {
      return { text: text.slice(0, index) + text.slice(index + 1), caret: index };
    }
  }
  return { text, caret };
};

const dropDigitAfter = (text: string, caret: number): Edit => {
  for (let index = caret; index < text.length; index += 1) {
    if (isDigit(text[index])) {
      return { text: text.slice(0, index) + text.slice(index + 1), caret };
    }
  }
  return { text, caret };
};

export interface MoneyInputText {
  /** What the field should display. */
  readonly text: string;
  /** Major units, or `undefined` while the field is empty. */
  readonly value: number | undefined;
}

/**
 * Reformat a half-typed money field, keeping the grouping in step with the digits.
 *
 * Everything that is not a digit is dropped, so paste, stray symbols and the
 * app's own group separators all survive a round-trip. The fraction is truncated
 * to the currency's own precision — IDR has none, so a decimal key is ignored
 * there rather than accepting a rupiah value that cannot exist.
 *
 * No currency symbol: the field renders the code beside the input instead.
 */
export const formatMoneyInput = (raw: string, currency: string): MoneyInputText => {
  const fractionDigits = getCurrencyFractionDigits(currency);

  let intDigits = '';
  let fracDigits = '';
  let hasDecimal = false;

  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      if (hasDecimal) {
        // Anything past the currency's precision is dropped, never carried into
        // the integer part: pasting "1.250.000,50" into an IDR field means one
        // and a quarter million rupiah, not a hundred times that.
        if (fracDigits.length < fractionDigits) fracDigits += char;
      } else if (intDigits.length < MAX_INPUT_DIGITS) {
        intDigits += char;
      }
      continue;
    }

    // Tracked even for a currency with no minor unit, so the digits behind it
    // are discarded rather than silently multiplying the amount.
    if (!hasDecimal && decimalKeys.has(char)) {
      hasDecimal = true;
    }
  }

  const showsDecimal = hasDecimal && fractionDigits > 0;

  if (intDigits === '' && fracDigits === '' && !showsDecimal) {
    return { text: '', value: undefined };
  }

  // Grouped through Intl rather than a hand-rolled every-third-digit loop, so a
  // locale that does not group in threes stays correct.
  const intText = inputFormatter(0).format(Number(intDigits === '' ? '0' : intDigits));

  return {
    text: showsDecimal ? `${intText}${separators.decimal}${fracDigits}` : intText,
    value: Number(`${intDigits === '' ? '0' : intDigits}.${fracDigits === '' ? '0' : fracDigits}`),
  };
};

/**
 * Major units -> the field's canonical text, padded to the currency's precision.
 *
 * Used to seed the field and to settle it on blur, so a half-typed "1,5" lands
 * as "1,50" once the user leaves it.
 */
export const formatMoneyInputValue = (value: number | undefined, currency: string): string => {
  if (value === undefined || !Number.isFinite(value)) return '';
  return inputFormatter(getCurrencyFractionDigits(currency)).format(value);
};

export interface MoneyKeystroke {
  /** What the field showed before this keystroke. */
  readonly previousText: string;
  /** What the browser left in the field after it. */
  readonly rawText: string;
  /** Where the browser left the caret. */
  readonly caret: number;
  /** The key that caused the change, when known. */
  readonly key: string | null;
  readonly currency: string;
}

export interface MoneyInputState extends MoneyInputText {
  /** Where the caret belongs once `text` is on screen. */
  readonly caret: number;
}

/**
 * One keystroke against a money field.
 *
 * The deletion keys need the `key` that caused the change because a `change`
 * event cannot tell a backspace from a forward delete, and the two want the
 * digit on opposite sides of the caret.
 */
export const applyMoneyKeystroke = ({
  previousText,
  rawText,
  caret,
  key,
  currency,
}: MoneyKeystroke): MoneyInputState => {
  // A one-character deletion that took a separator rather than a digit. `caret`
  // already sits where the removed character was, for both delete directions.
  const removedSeparator = rawText.length === previousText.length - 1 && !isDigit(previousText[caret]);

  let edit: Edit = { text: rawText, caret };
  if (removedSeparator && key === 'Backspace') edit = dropDigitBefore(rawText, caret);
  if (removedSeparator && key === 'Delete') edit = dropDigitAfter(rawText, caret);

  const formatted = formatMoneyInput(edit.text, currency);

  return {
    text: formatted.text,
    value: formatted.value,
    caret: caretTarget(formatted.text, edit),
  };
};
