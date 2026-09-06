import { matchProduct } from './match-product';

const indomie = { id: 'p-1', code: 'A-01', name: 'Indomie Goreng', categoryId: 'c-1' };
const indomieSoto = { id: 'p-2', code: 'A-02', name: 'Indomie Soto', categoryId: 'c-1' };
const teh = { id: 'p-3', code: null, name: 'Teh Botol', categoryId: 'c-2' };

describe('matchProduct', () => {
  const products = [indomie, indomieSoto, teh];

  it('matches on the code even when the printed name disagrees', () => {
    expect(matchProduct({ code: 'A-02', name: 'INDOMIE GRG' }, products)).toBe(indomieSoto);
  });

  it('matches on the code regardless of case and padding', () => {
    expect(matchProduct({ code: ' a-01 ', name: 'anything' }, products)).toBe(indomie);
  });

  it('falls back to the name when the receipt prints no code', () => {
    expect(matchProduct({ code: null, name: 'teh botol' }, products)).toBe(teh);
  });

  it('ignores the punctuation a printer adds around a name', () => {
    expect(matchProduct({ code: null, name: 'Indomie Goreng (Jumbo)' }, products)).toBe(indomie);
  });

  it('leaves a line unmatched rather than filing it under a near miss', () => {
    expect(matchProduct({ code: null, name: 'Sabun Lifebuoy' }, products)).toBeUndefined();
  });

  it('does not match a code that belongs to no product here', () => {
    // Callers pass only the matched merchant's catalogue, so an unknown code is
    // simply a new line — never a lookup that widens to another shop.
    expect(matchProduct({ code: 'Z-99', name: 'Sabun' }, products)).toBeUndefined();
  });

  it('keeps the caller’s own row type, so a joined category survives the match', () => {
    const withCategory = [{ ...indomie, category: { name: 'Groceries' } }];
    const found = matchProduct({ code: 'A-01', name: 'x' }, withCategory);

    expect(found?.category.name).toBe('Groceries');
  });
});
