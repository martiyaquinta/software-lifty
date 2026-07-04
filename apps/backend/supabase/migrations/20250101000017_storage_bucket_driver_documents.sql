INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('driver-documents', 'driver-documents', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;
