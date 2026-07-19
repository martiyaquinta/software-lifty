import { Ionicons } from '@expo/vector-icons';
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
import { type DocBase, type DocSide, uploadDocumentToBackend } from '../utils/upload';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

type DocType = DocBase;
type PickMethod = 'camera' | 'gallery' | 'file';

const DOCS: { type: DocType; label: string }[] = [
  { type: 'drivers_license', label: 'Licencia de conducir' },
  { type: 'vehicle_registration', label: 'Cedula del vehiculo' },
  { type: 'vehicle_insurance', label: 'Seguro del vehiculo' },
  { type: 'background_check', label: 'Certificado de antecedentes penales' },
];

const SIDES: { side: DocSide; label: string }[] = [
  { side: 'front', label: 'Frente' },
  { side: 'back', label: 'Dorso' },
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

type SideState = Record<DocSide, DocState>;

const initialSideState = (): SideState => ({
  front: { ...initialDocState },
  back: { ...initialDocState },
});

export const OnboardingStep2Screen: React.FC = () => {
  const navigation = useAppNavigation();
  const driverId = useAuthStore((s) => s.driverId);
  const [docs, setDocs] = useState<Record<DocType, SideState>>({
    drivers_license: initialSideState(),
    vehicle_registration: initialSideState(),
    vehicle_insurance: initialSideState(),
    background_check: initialSideState(),
  });

  const allUploaded = Object.values(docs).every((d) => d.front.uploaded && d.back.uploaded);

  const handlePick = useCallback(
    async (docType: DocType, side: DocSide, method: PickMethod) => {
      if (!driverId) {
        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            [side]: { ...prev[docType][side], error: 'Sesion no valida. Reincia la app.' },
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
              [side]: { ...prev[docType][side], error: 'Permiso de camara denegado' },
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
              [side]: { ...prev[docType][side], error: 'El archivo debe ser menor a 10MB' },
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
          } catch (err) {
            console.warn('Image compression failed, using original:', err);
          }
        } else if (mimeType?.startsWith('image/') && uri) {
          try {
            const compressed = await compressImage(uri);
            uri = compressed.uri;
            name = name?.replace(/\.[^.]+$/, '.jpg') ?? `doc_${Date.now()}.jpg`;
            mimeType = 'image/jpeg';
          } catch (err) {
            console.warn('Image compression failed, using original:', err);
          }
        }

        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            [side]: {
              ...prev[docType][side],
              fileUri: uri,
              fileName: name,
              uploading: true,
              error: null,
            },
          },
        }));

        const result = await uploadDocumentToBackend(uri!, name!, mimeType!, docType, side);

        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            [side]: {
              ...prev[docType][side],
              fileUrl: result.file_url,
              uploading: false,
              uploaded: true,
              error: null,
            },
          },
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al subir el documento';
        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            [side]: {
              ...prev[docType][side],
              uploading: false,
              uploaded: false,
              error: message,
            },
          },
        }));
      }
    },
    [driverId],
  );

  const handleRetry = useCallback((docType: DocType, side: DocSide) => {
    setDocs((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], [side]: { ...initialDocState } },
    }));
  }, []);

  const handleVerify = useCallback(() => {
    navigation.navigate('UnderReview');
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Paso 3/3" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Subi tus documentos</Text>
        <Text style={styles.subtitle}>Los necesitamos para habilitar tu cuenta</Text>

        {DOCS.map((doc) => (
          <View key={doc.type} style={styles.uploadBlock}>
            <View style={styles.uploadIcon}>
              <Ionicons
                name="document-text-outline"
                size={24}
                color={theme.colors.mediumGray}
                accessibilityLabel="Subir documento"
              />
            </View>
            <Text style={styles.uploadTitle}>{doc.label}</Text>

            {SIDES.map(({ side, label }) => {
              const state = docs[doc.type][side];
              return (
                <View key={side} style={styles.sideBlock}>
                  <Text style={styles.sideLabel}>{label}</Text>

                  {state.uploaded ? (
                    <View style={styles.uploadedRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={theme.colors.turquoise}
                        accessibilityLabel="Documento subido"
                      />
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
                        onPress={() => handlePick(doc.type, side, 'camera')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.optionText}>Sacar foto</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.uploadOption}
                        onPress={() => handlePick(doc.type, side, 'gallery')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.optionText}>Subir de galeria</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.uploadOption}
                        onPress={() => handlePick(doc.type, side, 'file')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.optionText}>Subir archivo</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {state.error && (
                    <View style={styles.errorRow}>
                      <Text style={styles.errorText}>{state.error}</Text>
                      <TouchableOpacity onPress={() => handleRetry(doc.type, side)}>
                        <Text style={styles.retryText}>Reintentar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        <Button
          title="ENVIAR DOCUMENTOS"
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
  uploadTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  sideBlock: {
    width: '100%',
    gap: theme.spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingTop: theme.spacing.sm,
  },
  sideLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
    alignSelf: 'flex-start',
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
