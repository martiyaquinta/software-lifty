import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type React from 'react';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import { uploadDocumentToBackend } from '../utils/upload';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

type DocType = 'drivers_license' | 'vehicle_registration' | 'vehicle_insurance';
type PickMethod = 'camera' | 'gallery' | 'file';

const DOCS: { type: DocType; label: string }[] = [
  { type: 'drivers_license', label: 'Licencia de conducir' },
  { type: 'vehicle_registration', label: 'Cedula del vehiculo' },
  { type: 'vehicle_insurance', label: 'Seguro del vehiculo' },
];

interface DocState {
  fileUri: string | null;
  fileName: string | null;
  fileUrl: string | null;
  uploading: boolean;
  uploaded: boolean;
  error: string | null;
}

const initialDocState: DocState = {
  fileUri: null,
  fileName: null,
  fileUrl: null,
  uploading: false,
  uploaded: false,
  error: null,
};

export const OnboardingStep2Screen: React.FC = () => {
  const navigation = useAppNavigation();
  const driverId = useAuthStore((s) => s.driverId);
  const [docs, setDocs] = useState<Record<DocType, DocState>>({
    drivers_license: { ...initialDocState },
    vehicle_registration: { ...initialDocState },
    vehicle_insurance: { ...initialDocState },
  });

  const allUploaded = Object.values(docs).every((d) => d.uploaded);

  const handlePick = useCallback(
    async (docType: DocType, method: PickMethod) => {
      if (!driverId) {
        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            error: 'Sesion no valida. Reincia la app.',
          },
        }));
        return;
      }

      if (method === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setDocs((prev) => ({
            ...prev,
            [docType]: {
              ...prev[docType],
              error: 'Permiso de camara denegado',
            },
          }));
          return;
        }
      }

      let uri: string | null = null;
      let name: string | null = null;
      let mimeType: string | null = null;
      let fileSize: number | null = null;

      try {
        if (method === 'camera') {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: 'images',
            quality: 0.7,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          uri = asset.uri;
          name = asset.fileName ?? `photo_${Date.now()}.jpg`;
          mimeType = asset.mimeType ?? 'image/jpeg';
          fileSize = asset.fileSize ?? null;
        } else if (method === 'gallery') {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            quality: 0.7,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          uri = asset.uri;
          name = asset.fileName ?? `image_${Date.now()}.jpg`;
          mimeType = asset.mimeType ?? 'image/jpeg';
          fileSize = asset.fileSize ?? null;
        } else {
          const result = await DocumentPicker.getDocumentAsync({
            type: '*/*',
            copyToCacheDirectory: true,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          uri = asset.uri;
          name = asset.name;
          mimeType = asset.mimeType ?? 'application/octet-stream';
          fileSize = asset.size ?? null;
        }

        if (fileSize && fileSize > MAX_FILE_SIZE) {
          setDocs((prev) => ({
            ...prev,
            [docType]: {
              ...prev[docType],
              error: 'El archivo debe ser menor a 10MB',
            },
          }));
          return;
        }

        if (method === 'camera' || method === 'gallery') {
          try {
            const compressed = await compressImage(uri!);
            uri = compressed.uri;
            name = name?.replace(/\.[^.]+$/, '.jpg') ?? `photo_${Date.now()}.jpg`;
            mimeType = 'image/jpeg';
          } catch {}
        } else if (mimeType?.startsWith('image/') && uri) {
          try {
            const compressed = await compressImage(uri);
            uri = compressed.uri;
            name = name?.replace(/\.[^.]+$/, '.jpg') ?? `doc_${Date.now()}.jpg`;
            mimeType = 'image/jpeg';
          } catch {}
        }

        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            fileUri: uri,
            fileName: name,
            uploading: true,
            error: null,
          },
        }));

        const result = await uploadDocumentToBackend(uri!, name!, mimeType!, docType);

        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            fileUrl: result.file_url,
            uploading: false,
            uploaded: true,
            error: null,
          },
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al subir el documento';
        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            uploading: false,
            uploaded: false,
            error: message,
          },
        }));
      }
    },
    [driverId],
  );

  const handleRetry = useCallback((docType: DocType) => {
    setDocs((prev) => ({
      ...prev,
      [docType]: { ...initialDocState },
    }));
  }, []);

  const handleVerify = useCallback(() => {
    navigation.navigate('KYCVerify');
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Paso 2/2" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Subi tus documentos</Text>
        <Text style={styles.subtitle}>Los necesitamos para verificar tu identidad</Text>

        {DOCS.map((doc) => {
          const state = docs[doc.type];
          return (
            <View key={doc.type} style={styles.uploadBlock}>
              <View style={styles.uploadIcon}>
                <Text style={styles.uploadEmoji}>📄</Text>
              </View>
              <Text style={styles.uploadTitle}>{doc.label}</Text>

              {state.uploaded ? (
                <View style={styles.uploadedRow}>
                  <Text style={styles.checkmark}>✅</Text>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {state.fileName}
                  </Text>
                </View>
              ) : state.uploading ? (
                <ActivityIndicator size="small" color={theme.colors.turquoise} />
              ) : (
                <View style={styles.uploadOptions}>
                  <TouchableOpacity
                    style={styles.uploadOption}
                    onPress={() => handlePick(doc.type, 'camera')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>Sacar foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.uploadOption}
                    onPress={() => handlePick(doc.type, 'gallery')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>Subir de galeria</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.uploadOption}
                    onPress={() => handlePick(doc.type, 'file')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>Subir archivo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {state.error && (
                <View style={styles.errorRow}>
                  <Text style={styles.errorText}>{state.error}</Text>
                  <TouchableOpacity onPress={() => handleRetry(doc.type)}>
                    <Text style={styles.retryText}>Reintentar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        <Button
          title="VERIFICAR IDENTIDAD"
          onPress={handleVerify}
          style={styles.button}
          disabled={!allUploaded}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  content: {
    alignItems: 'center',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.md,
  },
  uploadBlock: {
    width: 343,
    gap: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  uploadIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadEmoji: {
    fontSize: 24,
  },
  uploadTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  uploadOptions: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  uploadOption: {
    height: 40,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  uploadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  checkmark: {
    fontSize: 18,
  },
  fileName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    flexShrink: 1,
  },
  errorRow: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  retryText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  button: {
    width: 343,
    marginTop: theme.spacing.md,
  },
});
