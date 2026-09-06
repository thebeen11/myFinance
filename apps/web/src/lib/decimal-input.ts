import { MONEY_LOCALE } from './format';

/**
 * Entering a decimal number in this app's locale — money, a weight, anything
 * with a fixed number of places.
 *
 * All of it is pure — a keystroke goes in, the field's next text, caret and
 * numeric value come out — so the React component is left holding nothing but
 * DOM wiring, and the fiddly parts can be tested without a browser.
 *
 * Precision arrives as a plain `fractionDigits`, so nothing here knows about
 * currencies: `CurrencyInput` resolves it from one, and a quantity field passes
 * `QUANTITY_FRACTION_DIGITS`.
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

const inputFormatters = new Map<string, Intl.NumberFormat>();

const inputFormatter = (fractionDigits: number, minFractionDigits: number): Intl.NumberFormat => {
  const key = `${minFractionDigits}-${fractionDigits}`;
  const cached = inputFormatters.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  inputFormatters.set(key, formatter);
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
  // 0-decimal field drops the separator, so it falls through to the integer
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

export interface DecimalInputText {
  /** What the field should display. */
  readonly text: string;
  /** The number it comes to, or `undefined` while the field is empty. */
  readonly value: number | undefined;
}

/**
 * Reformat a half-typed decimal field, keeping the grouping in step with the digits.
 *
 * Everything that is not a digit is dropped, so paste, stray symbols and the
 * app's own group separators all survive a round-trip. The fraction is truncated
 * to `fractionDigits` — IDR has none, so a decimal key is ignored on a rupiah
 * field rather than accepting a value that cannot exist.
 *
 * Nothing is prefixed or suffixed: the field renders its currency code or unit
 * beside the input instead.
 *
 * @param raw The field's text as the browser left it.
 * @param fractionDigits How many decimals this field accepts.
 */
export const formatDecimalInput = (raw: string, fractionDigits: number): DecimalInputText => {
  let intDigits = '';
  let fracDigits = '';
  let hasDecimal = false;

  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      if (hasDecimal) {
        // Anything past the field's precision is dropped, never carried into the
        // integer part: pasting "1.250.000,50" into an IDR field means one and a
        // quarter million rupiah, not a hundred times that.
        if (fracDigits.length < fractionDigits) fracDigits += char;
      } else if (intDigits.length < MAX_INPUT_DIGITS) {
        intDigits += char;
      }
      continue;
    }

    // Tracked even on a field that takes no decimals, so the digits behind it
    // are discarded rather than silently multiplying the value.
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
  const intText = inputFormatter(0, 0).format(Number(intDigits === '' ? '0' : intDigits));

  return {
    text: showsDecimal ? `${intText}${separators.decimal}${fracDigits}` : intText,
    value: Number(`${intDigits === '' ? '0' : intDigits}.${fracDigits === '' ? '0' : fracDigits}`),
  };
};

/**
 * A number -> the field's canonical text.
 *
 * Seeds the field and settles it on blur. Money pads to its full precision, so a
 * half-typed "1,5" lands as "1,50" once the user leaves it; a quantity passes
 * `minFractionDigits: 0` and stays "1,5", because a padded "1,500" reads as one
 * thousand five hundred in this locale.
 *
 * @param value The number to render, or `undefined` for an empty field.
 * @param fractionDigits The most decimals to show.
 * @param minFractionDigits The fewest, defaulting to `fractionDigits` (padded).
 */
export const formatDecimalInputValue = (
  value: number | undefined,
  fractionDigits: number,
  minFractionDigits: number = fractionDigits,
): string => {
  if (value === undefined || !Number.isFinite(value)) return '';
  return inputFormatter(fractionDigits, minFractionDigits).format(value);
};

export interface DecimalKeystroke {
  /** What the field showed before this keystroke. */
  readonly previousText: string;
  /** What the browser left in the field after it. */
  readonly rawText: string;
  /** Where the browser left the caret. */
  readonly caret: number;
  /** The key that caused the change, when known. */
  readonly key: string | null;
  /** How many decimals this field accepts. */
  readonly fractionDigits: number;
}

export interface DecimalInputState extends DecimalInputText {
  /** Where the caret belongs once `text` is on screen. */
  readonly caret: number;
}

/**
 * One keystroke against a decimal field.
 *
 * The deletion keys need the `key` that caused the change because a `change`
 * event cannot tell a backspace from a forward delete, and the two want the
 * digit on opposite sides of the caret.
 */
export const applyDecimalKeystroke = ({
  previousText,
  rawText,
  caret,
  key,
  fractionDigits,
}: DecimalKeystroke): DecimalInputState => {
  // A one-character deletion that took a separator rather than a digit. `caret`
  // already sits where the removed character was, for both delete directions.
  const removedSeparator =
    rawText.length === previousText.length - 1 && !isDigit(previousText[caret]);

  let edit: Edit = { text: rawText, caret };
  if (removedSeparator && key === 'Backspace') edit = dropDigitBefore(rawText, caret);
  if (removedSeparator && key === 'Delete') edit = dropDigitAfter(rawText, caret);

  const formatted = formatDecimalInput(edit.text, fractionDigits);

  return {
    text: formatted.text,
    value: formatted.value,
    caret: caretTarget(formatted.text, edit),
  };
};
