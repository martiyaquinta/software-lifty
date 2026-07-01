import { t } from 'elysia';

const validDocTypes = ['license', 'registration', 'insurance', 'background_check'] as const;

export const step1Body = t.Object({
  full_name: t.String({ minLength: 2, maxLength: 255 }),
});

export const step2Body = t.Object({
  brand: t.String({ minLength: 1, maxLength: 100 }),
  model: t.String({ minLength: 1, maxLength: 100 }),
  year: t.Number({ minimum: 1900, maximum: 2100 }),
  color: t.String({ minLength: 1, maxLength: 50 }),
  plate: t.String({ minLength: 1, maxLength: 20 }),
  vehicle_type: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
});

export const step3Body = t.Object({
  documents: t.Array(
    t.Object({
      doc_type: t.String({ enum: validDocTypes }),
      file_url: t.String({ minLength: 1, maxLength: 512 }),
    }),
    { minItems: 1 },
  ),
});

export const uploadDocBody = t.Object({
  file: t.File({ maxSize: 5 * 1024 * 1024 }),
  doc_type: t.String({ enum: validDocTypes }),
});
