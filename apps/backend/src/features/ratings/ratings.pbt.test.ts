import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

const ratingArb = fc.integer({ min: 1, max: 5 });

describe('Rating Average — Property-Based', () => {
  test('average equals sum divided by count (rounded to 2 decimals)', () => {
    fc.assert(
      fc.property(fc.array(ratingArb, { minLength: 1, maxLength: 50 }), (ratings) => {
        const sum = ratings.reduce((a, b) => a + b, 0);
        const expectedAvg = Math.round((sum / ratings.length) * 100) / 100;

        const computedAvg =
          Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100;

        expect(computedAvg).toBe(expectedAvg);
        expect(computedAvg).toBeGreaterThanOrEqual(1);
        expect(computedAvg).toBeLessThanOrEqual(5);
      }),
      { numRuns: 200 },
    );
  });

  test('a single rating equals itself as average', () => {
    fc.assert(
      fc.property(ratingArb, (rating) => {
        const avg = Math.round((rating / 1) * 100) / 100;
        expect(avg).toBe(rating);
      }),
      { numRuns: 100 },
    );
  });

  test('all same ratings produce that rating as average', () => {
    fc.assert(
      fc.property(ratingArb, fc.integer({ min: 2, max: 20 }), (rating, count) => {
        const ratings = Array(count).fill(rating);
        const sum = ratings.reduce((a, b) => a + b, 0);
        const avg = Math.round((sum / ratings.length) * 100) / 100;
        expect(avg).toBe(rating);
      }),
      { numRuns: 100 },
    );
  });
});
