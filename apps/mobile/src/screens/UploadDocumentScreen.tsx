import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type React from 'react';
import { useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

type DocType = 'drivers_license' | 'vehicle_registration' | 'vehicle_insurance';

type SelectedFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

export const UploadDocumentScreen: React.FC = () => {
  const { docType, docLabel } = useLocalSearchParams<{
    docType: DocType;
    docLabel: string;
  }>();
  const router = useRouter();
  const driverId = useAuthStore((s) => s.driverId);

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [uploading, setUploading] = useState(false);

  const title = docLabel || 'Subir documento';

  const handleCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la camara para sacar una foto.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        Alert.alert('Archivo muy grande', 'El archivo no puede superar los 10 MB.');
        return;
      }
      setSelectedFile({
        uri: asset.uri,
        name: `photo-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        size: asset.fileSize,
      });
    }
  };

  const handleGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permiso denegado',
        'Necesitamos acceso a la galeria para seleccionar una imagen.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        Alert.alert('Archivo muy grande', 'El archivo no puede superar los 10 MB.');
        return;
      }
      const extension = asset.uri.split('.').pop() || 'jpg';
      setSelectedFile({
        uri: asset.uri,
        name: `image-${Date.now()}.${extension}`,
        mimeType: asset.mimeType || 'image/jpeg',
        size: asset.fileSize,
      });
    }
  };

  const handleDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      if (asset.size && asset.size > MAX_FILE_SIZE) {
        Alert.alert('Archivo muy grande', 'El archivo no puede superar los 10 MB.');
        return;
      }
      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !driverId || !docType) return;

    setUploading(true);
    try {
      const fileExtension = selectedFile.name.split('.').pop() || 'file';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExtension}`;
      const storagePath = `${driverId}/${docType}/${fileName}`;

      const response = await fetch(selectedFile.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('driver-documents')
        .upload(storagePath, blob, {
          contentType: selectedFile.mimeType || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        Alert.alert('Error', 'No se pudo subir el archivo. Intenta de nuevo.');
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('driver-documents')
        .getPublicUrl(storagePath);

      await apiClient.post('/drivers/me/documents', {
        doc_type: docType,
        file_name: selectedFile.name,
        file_url: publicUrlData.publicUrl,
      });

      router.back();
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Error', 'Ocurrio un error al subir el documento.');
    } finally {
      setUploading(false);
    }
  };

  const isImage = selectedFile?.mimeType?.startsWith('image/');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title={title} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Subi el documento requerido</Text>

        <View style={styles.preview}>
          {selectedFile ? (
            isImage ? (
              <Image source={{ uri: selectedFile.uri }} style={styles.previewImage} />
            ) : (
              <View style={styles.previewFile}>
                <Text style={styles.previewIcon}>📄</Text>
                <Text style={styles.previewFileName} numberOfLines={2}>
                  {selectedFile.name}
                </Text>
              </View>
            )
          ) : (
            <>
              <Text style={styles.previewIcon}>📄</Text>
              <Text style={styles.previewText}>Todavia no subiste nada</Text>
            </>
          )}
        </View>

        {!selectedFile && (
          <View style={styles.options}>
            <TouchableOpacity style={styles.option} onPress={handleCamera} activeOpacity={0.7}>
              <Text style={styles.optionText}>📷 Sacar foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.option} onPress={handleGallery} activeOpacity={0.7}>
              <Text style={styles.optionText}>🖼 Subir de galeria</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.option} onPress={handleDocument} activeOpacity={0.7}>
              <Text style={styles.optionText}>📁 Subir archivo</Text>
            </TouchableOpacity>
          </View>
        )}

        {selectedFile && (
          <View style={styles.uploadSection}>
            <Button
              title="CAMBIAR ARCHIVO"
              variant="secondary"
              onPress={() => setSelectedFile(null)}
              style={styles.button}
            />
            <Button
              title="SUBIR"
              variant="primary"
              onPress={handleUpload}
              loading={uploading}
              disabled={uploading}
              style={styles.button}
            />
          </View>
        )}
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
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  preview: {
    width: 343,
    height: 200,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewFile: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  previewIcon: {
    fontSize: 40,
  },
  previewText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  previewFileName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  options: {
    width: 343,
    gap: theme.spacing.sm,
  },
  option: {
    height: 64,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
  },
  uploadSection: {
    width: 343,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  button: {
    width: 343,
  },
});
