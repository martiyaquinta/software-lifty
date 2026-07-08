import { z } from 'zod';

export const apiMetaSchema = z.object({
  timestamp: z.string(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    status: z.number(),
  }),
  meta: apiMetaSchema,
});

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: apiMetaSchema,
  });

export type ApiMeta = z.infer<typeof apiMetaSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(body: ApiErrorBody) {
    super(body.error.message);
    this.code = body.error.code;
    this.status = body.error.status;
  }
}

export const driverSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  vehicle_plate: z.string().nullable(),
  vehicle_brand: z.string().nullable(),
  vehicle_model: z.string().nullable(),
  vehicle_year: z.number().nullable(),
  vehicle_color: z.string().nullable(),
  photo_url: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']),
  is_online: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const driverStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'under_review', 'rejected', 'suspended']),
  step: z
    .enum([
      'profile',
      'kyc',
      'vehicle',
      'documents',
      'review',
      'approved',
      // legacy values kept so older backend responses still parse
      'step1',
      'step2',
      'step3',
    ])
    .optional(),
  kyc_status: z.string().optional(),
  documents_pending_review: z.boolean().optional(),
});

export const tripSchema = z.object({
  id: z.string(),
  driver_id: z.string(),
  passenger_id: z.string().nullable(),
  status: z.enum([
    'requested',
    'accepted',
    'driver_arrived',
    'in_progress',
    'completed',
    'cancelled',
  ]),
  pickup_address: z.string(),
  pickup_lat: z.number(),
  pickup_lng: z.number(),
  destination_address: z.string(),
  destination_lat: z.number(),
  destination_lng: z.number(),
  amount: z.number(),
  commission: z.number(),
  driver_earnings: z.number(),
  payment_method: z.enum(['cash', 'mercadopago']).nullable(),
  is_collected: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const earningsDailySchema = z.object({
  total: z.number(),
  cash: z.number(),
  transfer: z.number(),
  trip_count: z.number(),
  trips: z.array(tripSchema).optional(),
  yesterday: z.number().optional(),
  week: z.number().optional(),
});

export const paymentMethodSchema = z.object({
  id: z.string(),
  method_type: z.string(),
  account_number: z.string(),
  titular_name: z.string().nullable(),
  wallet: z.string().nullable(),
  created_at: z.string(),
});

export const documentSchema = z.object({
  id: z.string(),
  driver_id: z.string(),
  doc_type: z.enum(['drivers_license', 'vehicle_registration', 'vehicle_insurance']),
  file_url: z.string(),
  file_name: z.string(),
  created_at: z.string(),
});

export type Driver = z.infer<typeof driverSchema>;
export type DriverStatus = z.infer<typeof driverStatusSchema>;
export type EarningsDaily = z.infer<typeof earningsDailySchema>;
export type Trip = z.infer<typeof tripSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type DriverDocument = z.infer<typeof documentSchema>;
