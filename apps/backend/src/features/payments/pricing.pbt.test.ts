import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { calculateFare } from '../../shared/lib/pricing';

const vehicleTypes = ['car', 'motorcycle'] as const;

const arbitraryPositive = fc.float({ min: Math.fround(0.1), max: Math.fround(1000), noNaN: true });
const arbitraryVehicle = fc.constantFrom(...vehicleTypes);

describe('Fare Calculation — Property-Based', () => {
  test('platformFee + driverEarnings === total for any valid inputs', () => {
    fc.assert(
      fc.property(
        arbitraryPositive,
        arbitraryPositive,
        arbitraryVehicle,
        (distance_km, duration_minutes, vehicle_type) => {
          const fare = calculateFare({ distance_km, duration_minutes, vehicle_type });
          const total = fare.total;
          const platformFee = fare.platform_fee;
          const driverEarnings = fare.driver_earnings;

          expect(total).toBeGreaterThan(0);
          expect(platformFee).toBeGreaterThan(0);
          expect(driverEarnings).toBeGreaterThan(0);
          expect(platformFee + driverEarnings).toBe(total);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('total is monotonic with distance and duration', () => {
    fc.assert(
      fc.property(
        arbitraryPositive,
        arbitraryPositive,
        arbitraryPositive,
        arbitraryPositive,
        arbitraryVehicle,
        (d1, t1, d2, t2, vehicle_type) => {
          const dSmall = Math.min(d1, d2);
          const dLarge = Math.max(d1, d2);
          const tSmall = Math.min(t1, t2);
          const tLarge = Math.max(t1, t2);

          const fareSmall = calculateFare({
            distance_km: dSmall,
            duration_minutes: tSmall,
            vehicle_type,
          });
          const fareLarge = calculateFare({
            distance_km: dLarge,
            duration_minutes: tLarge,
            vehicle_type,
          });

          expect(fareLarge.total).toBeGreaterThanOrEqual(fareSmall.total);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('different vehicle types produce different fares', () => {
    fc.assert(
      fc.property(arbitraryPositive, arbitraryPositive, (distance_km, duration_minutes) => {
        const fares = vehicleTypes.map((vt) =>
          calculateFare({ distance_km, duration_minutes, vehicle_type: vt }),
        );
        const totals = fares.map((f) => f.total);
        const uniqueTotals = new Set(totals);
        if (totals.some((t) => t <= 0)) return;
        expect(uniqueTotals.size).toBe(vehicleTypes.length);
      }),
      { numRuns: 50 },
    );
  });
});
