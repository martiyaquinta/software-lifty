import { AppError } from './errors';

const PRICING = {
  car: { base: 250, perKm: 80, perMinute: 18 },
  motorcycle: { base: 180, perKm: 55, perMinute: 13 },
} as const;

type VehicleType = keyof typeof PRICING;

export interface FareInput {
  vehicle_type: string;
  distance_km: number;
  duration_minutes: number;
}

export interface FareResult {
  base_fare: number;
  distance_fare: number;
  time_fare: number;
  total: number;
  platform_fee: number;
  driver_earnings: number;
}

export function calculatePlatformFee(total: number): number {
  return Math.round(total * 0.2 * 100) / 100;
}

export function calculateFare(input: FareInput): FareResult {
  if (input.vehicle_type !== 'car' && input.vehicle_type !== 'motorcycle') {
    throw new AppError('Invalid vehicle type', 400, 'BAD_REQUEST');
  }
  if (input.distance_km <= 0) {
    throw new AppError('Distance must be positive', 400, 'BAD_REQUEST');
  }
  if (input.duration_minutes <= 0) {
    throw new AppError('Duration must be positive', 400, 'BAD_REQUEST');
  }

  const rates = PRICING[input.vehicle_type as VehicleType];

  const base_fare = rates.base;
  const distance_fare = Math.round(input.distance_km * rates.perKm * 100) / 100;
  const time_fare = Math.round(input.duration_minutes * rates.perMinute * 100) / 100;
  const total = Math.round(base_fare + distance_fare + time_fare);
  const platform_fee = calculatePlatformFee(total);
  const driver_earnings = total - platform_fee;

  return { base_fare, distance_fare, time_fare, total, platform_fee, driver_earnings };
}
