import { matchMerchant } from './match-merchant';

const indomaret = { id: 'm-1', name: 'Indomaret' };
const superindo = { id: 'm-2', name: 'Super Indo' };
const cafe = { id: 'm-3', name: 'Café Kopi' };

describe('matchMerchant', () => {
  const merchants = [indomaret, superindo, cafe];

  it('matches a name that differs only in case and spacing', () => {
    expect(matchMerchant('  SUPER   INDO ', merchants)).toBe(superindo);
  });

  it('matches through the accents a receipt printer drops', () => {
    expect(matchMerchant('CAFE KOPI', merchants)).toBe(cafe);
  });

  it('finds the catalogue name inside a printed header', () => {
    expect(matchMerchant('PT INDOMARCO — INDOMARET CABANG DEPOK', merchants)).toBe(indomaret);
  });

  it('prefers the longest catalogue name inside the header, not the first', () => {
    const indo = { id: 'm-4', name: 'Indo' };

    // "Indo" is inside "Super Indo Cinere" too; the longer name is the specific read.
    expect(matchMerchant('SUPER INDO CINERE', [indo, superindo])).toBe(superindo);
  });

  it('returns nothing rather than guessing when the shop is unknown', () => {
    expect(matchMerchant('Warung Bu Tini', merchants)).toBeUndefined();
  });

  it('returns nothing when the receipt header was unreadable', () => {
    expect(matchMerchant(null, merchants)).toBeUndefined();
  });

  it('does not let a very short catalogue name match everything', () => {
    expect(matchMerchant('Alfamart Margonda', [{ id: 'm-5', name: 'A' }])).toBeUndefined();
  });
});
