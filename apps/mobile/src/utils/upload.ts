import { apiClient } from '../api/client';

const DOC_TYPE_MAP: Record<string, string> = {
  drivers_license: 'license',
  vehicle_registration: 'registration',
  vehicle_insurance: 'insurance',
};

export async function uploadDocumentToBackend(
  uri: string,
  fileName: string,
  mimeType: string,
  docType: string,
): Promise<{ file_url: string; id?: string }> {
  const formData = new FormData();

  formData.append('file', { uri, type: mimeType, name: fileName } as any);
  formData.append('doc_type', DOC_TYPE_MAP[docType] ?? docType);

  const { data } = await apiClient.post('/onboarding/step3/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return data;
}

export async function uploadPhotoToBackend(
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<{ file_url: string }> {
  const formData = new FormData();

  formData.append('file', { uri, type: mimeType, name: fileName } as any);

  const { data } = await apiClient.post('/drivers/me/photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return data;
}
