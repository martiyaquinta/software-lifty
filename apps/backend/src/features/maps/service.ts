import {
  type DirectionsResult,
  type DistanceMatrixResult,
  type GeocodeResult,
  type PlaceResult,
  autocomplete as geoAutocomplete,
  directions as geoDirections,
  distanceMatrix as geoDistanceMatrix,
  geocode as geoGeocode,
} from '../../shared/lib/geo';
import { type FareResult, calculateFare } from '../../shared/lib/pricing';

export interface FareEstimateResult extends FareResult {
  distance_km: number;
  duration_minutes: number;
}

export const mapsService = {
  async autocomplete(input: string): Promise<PlaceResult[]> {
    return geoAutocomplete(input);
  },

  async geocode(params: { lat?: number; lng?: number; address?: string }): Promise<GeocodeResult> {
    return geoGeocode(params);
  },

  async directions(
    origin_lat: number,
    origin_lng: number,
    dest_lat: number,
    dest_lng: number,
  ): Promise<DirectionsResult> {
    return geoDirections(origin_lat, origin_lng, dest_lat, dest_lng);
  },

  async fareEstimate(
    origin_lat: number,
    origin_lng: number,
    dest_lat: number,
    dest_lng: number,
    vehicle_type: string,
  ): Promise<FareEstimateResult> {
    const matrix: DistanceMatrixResult = await geoDistanceMatrix(
      origin_lat,
      origin_lng,
      dest_lat,
      dest_lng,
    );

    const fare = calculateFare({
      vehicle_type,
      distance_km: matrix.distance_km,
      duration_minutes: matrix.duration_minutes,
    });

    return {
      distance_km: matrix.distance_km,
      duration_minutes: matrix.duration_minutes,
      ...fare,
    };
  },
};
