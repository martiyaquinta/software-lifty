import * as ImagePicker from 'expo-image-picker';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { TabBar } from '../components/TabBar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import { uploadPhotoToBackend } from '../utils/upload';

interface ProfileData {
  id: string;
  phone: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
  kyc_status: string | null;
  rating_avg: number;
  total_trips: number;
  completion_rate: number;
  is_online: boolean;
  vehicle: {
    brand: string;
    model: string;
    year: number;
    color: string;
    plate: string;
    vehicle_type: string;
  } | null;
  created_at: string;
}

interface DocumentItem {
  id: string;
  doc_type: string;
  file_url: string;
  verified_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const DOC_LABELS: Record<string, string> = {
  drivers_license: 'Licencia de conducir',
  vehicle_registration: 'Cedula del vehiculo',
  vehicle_insurance: 'Seguro del vehiculo',
  license: 'Licencia de conducir',
  registration: 'Cedula del vehiculo',
  insurance: 'Seguro del vehiculo',
  background_check: 'Antecedentes',
};

function isRealUrl(url: string | null): url is string {
  return !!url && (url.startsWith('http://') || url.startsWith('https://'));
}

export const ProfileScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const signOut = useSignOut();
  const [activeTab, setActiveTab] = useState<'home' | 'earnings' | 'profile'>('profile');

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editVisible, setEditVisible] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhotoUri, setEditPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [profileRes, docsRes] = await Promise.all([
        apiClient.get('/drivers/me'),
        apiClient.get('/drivers/me/documents'),
      ]);
      setProfile(profileRes.data);
      setDocuments(docsRes.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTabPress = (tab: 'home' | 'earnings' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate('Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
  };

  const handleSignOut = () => {
    signOut.mutate();
  };

  const openEdit = () => {
    if (!profile) return;
    const parts = (profile.full_name ?? '').split(' ');
    setEditFirstName(parts[0] ?? '');
    setEditLastName(parts.slice(1).join(' ') ?? '');
    setEditPhotoUri(null);
    setEditVisible(true);
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la galeria.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setEditPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      let photoUrl = profile.avatar_url;

      if (editPhotoUri) {
        const compressed = await compressImage(editPhotoUri);
        const uploadResult = await uploadPhotoToBackend(compressed.uri, 'avatar.jpg', 'image/jpeg');
        photoUrl = uploadResult.file_url;
        if (isRealUrl(photoUrl)) {
          setProfile({ ...profile, avatar_url: photoUrl });
        } else {
          setProfile({ ...profile, avatar_url: editPhotoUri });
        }
      }

      const newFullName = `${editFirstName.trim()} ${editLastName.trim()}`.trim();

      await apiClient.put('/drivers/me', {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        photo_url: photoUrl,
      });

      setProfile({ ...profile, full_name: newFullName });

      setEditVisible(false);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Perfil</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
        </View>
        <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
      </View>
    );
  }

  const vehicleText = profile?.vehicle
    ? `${profile.vehicle.brand} ${profile.vehicle.model} ${profile.vehicle.year} · ${profile.vehicle.plate}`
    : 'Sin vehiculo registrado';

  const sinceYear = profile?.created_at ? new Date(profile.created_at).getFullYear() : null;
  const yearsActive = sinceYear ? new Date().getFullYear() - sinceYear : 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.profileCard} padding={theme.spacing.lg}>
          <View style={styles.avatar}>
            {isRealUrl(profile?.avatar_url ?? null) ? (
              <Image source={{ uri: profile!.avatar_url! }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarIcon}>👤</Text>
            )}
          </View>
          <Text style={styles.name}>{profile?.full_name || 'Sin nombre'}</Text>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{profile?.total_trips ?? 0}</Text>
              <Text style={styles.statLabel}>Viajes</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {profile?.rating_avg ? profile.rating_avg.toFixed(1) : '-'}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{yearsActive}</Text>
              <Text style={styles.statLabel}>Anos</Text>
            </View>
          </View>
          <Button title="EDITAR PERFIL" variant="secondary" onPress={openEdit} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Contacto</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Telefono</Text>
            <Text style={styles.infoValue}>{profile?.phone || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{profile?.email || '-'}</Text>
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Mi vehiculo</Text>
          <Text style={styles.vehicleInfo}>{vehicleText}</Text>
          {profile?.vehicle && <Text style={styles.vehicleColor}>{profile.vehicle.color}</Text>}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Documentos</Text>
          {documents.length === 0 ? (
            <Text style={styles.emptyText}>No hay documentos cargados</Text>
          ) : (
            documents.map((doc) => (
              <View key={doc.id} style={styles.docRow}>
                <Text style={styles.docIcon}>{doc.verified_at ? '✅' : '⏳'}</Text>
                <View style={styles.docInfo}>
                  <Text style={styles.docName}>{DOC_LABELS[doc.doc_type] ?? doc.doc_type}</Text>
                  <Text style={styles.docStatus}>
                    {doc.verified_at ? 'Verificado' : 'Pendiente'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        <Button
          title="Cerrar sesion"
          variant="danger"
          onPress={handleSignOut}
          style={styles.button}
          textStyle={{ color: theme.colors.dangerRed, fontWeight: theme.fontWeight.medium }}
        />
      </ScrollView>

      <Modal visible={editVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar perfil</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.editAvatar} onPress={handlePickPhoto}>
              {editPhotoUri ? (
                <Image source={{ uri: editPhotoUri }} style={styles.editAvatarImage} />
              ) : isRealUrl(profile?.avatar_url ?? null) ? (
                <Image source={{ uri: profile!.avatar_url! }} style={styles.editAvatarImage} />
              ) : (
                <Text style={styles.editAvatarIcon}>📷</Text>
              )}
              <Text style={styles.editAvatarLabel}>Cambiar foto</Text>
            </TouchableOpacity>

            <Input
              placeholder="Nombre"
              value={editFirstName}
              onChangeText={setEditFirstName}
              containerStyle={styles.editInput}
            />
            <Input
              placeholder="Apellido"
              value={editLastName}
              onChangeText={setEditLastName}
              containerStyle={styles.editInput}
            />

            <Button
              title="GUARDAR"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
              style={styles.editButton}
            />
          </View>
        </View>
      </Modal>

      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  header: {
    height: 56,
    backgroundColor: theme.colors.deepBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  profileCard: {
    width: 343,
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.mediumGray,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarIcon: {
    fontSize: 32,
    color: theme.colors.mediumGray,
  },
  name: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: theme.spacing.sm,
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  infoValue: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.medium,
  },
  vehicleInfo: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
  vehicleColor: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    marginTop: 4,
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    paddingVertical: theme.spacing.sm,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  docIcon: {
    fontSize: 18,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  docStatus: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  button: {
    width: 327,
    borderColor: theme.colors.dangerRed,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  modalClose: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.mediumGray,
    padding: 8,
  },
  editAvatar: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  editAvatarImage: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
  },
  editAvatarIcon: {
    fontSize: 40,
  },
  editAvatarLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  editInput: {
    width: '100%',
  },
  editButton: {
    width: '100%',
    marginTop: theme.spacing.sm,
  },
});
