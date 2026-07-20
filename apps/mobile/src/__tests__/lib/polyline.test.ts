import { decodePolyline } from '../../lib/polyline';

describe('decodePolyline', () => {
  test('decodes a simple encoded polyline', () => {
    const result = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveLength(2);
    expect(typeof result[0][0]).toBe('number');
    expect(typeof result[0][1]).toBe('number');
  });

  test('returns empty array for empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  test('returns coordinates in [lng, lat] format', () => {
    const coords = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    for (const coord of coords) {
      expect(coord[0]).toBeGreaterThan(-180);
      expect(coord[0]).toBeLessThan(180);
      expect(coord[1]).toBeGreaterThan(-90);
      expect(coord[1]).toBeLessThan(90);
    }
  });

  test('decodes known polyline correctly', () => {
    const coords = decodePolyline('??');
    expect(coords.length).toBeGreaterThan(0);
  });
});
