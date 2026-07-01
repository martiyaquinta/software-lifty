import * as ImagePicker from 'expo-image-picker';
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
import { Input } from '../components/Input';
import { Navbar } from '../components/Navbar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

type VehicleType = 'Auto' | 'Moto' | 'Camioneta';

interface ValidationErrors {
  firstName?: string;
  lastName?: string;
  vehiclePlate?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleYear?: string;
}

const PLATE_REGEX = /^[A-Z]{2,3}[0-9]{3}[A-Z]{0,2}$/;
const VEHICLE_TYPES: VehicleType[] = ['Auto', 'Moto', 'Camioneta'];
const CURRENT_YEAR = new Date().getFullYear();

const validateFirstName = (value: string) => {
  if (!value.trim()) return undefined;
  if (value.length > 100) return 'Maximo 100 caracteres';
  if (/\d/.test(value)) return 'No puede contener numeros';
  return undefined;
};

const validateLastName = (value: string) => {
  if (!value.trim()) return undefined;
  if (value.length > 100) return 'Maximo 100 caracteres';
  if (/\d/.test(value)) return 'No puede contener numeros';
  return undefined;
};

const validatePlate = (value: string) => {
  if (!value.trim()) return undefined;
  if (!PLATE_REGEX.test(value.toUpperCase())) return 'Formato invalido (ej: ABC123)';
  return undefined;
};

const validateRequired = (value: string) => {
  if (!value.trim()) return 'Requerido';
  return undefined;
};

const validateYear = (value: string) => {
  if (!value.trim()) return undefined;
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num) || num < 2000 || num > CURRENT_YEAR + 1)
    return `Ano entre 2000 y ${CURRENT_YEAR + 1}`;
  return undefined;
};

const isFormValid = (
  firstName: string,
  lastName: string,
  vehiclePlate: string,
  vehicleBrand: string,
  vehicleModel: string,
  vehicleColor: string,
  vehicleYear: string,
  termsAccepted: boolean,
) => {
  return (
    firstName.trim() !== '' &&
    !validateFirstName(firstName) &&
    lastName.trim() !== '' &&
    !validateLastName(lastName) &&
    vehiclePlate.trim() !== '' &&
    !validatePlate(vehiclePlate) &&
    vehicleBrand.trim() !== '' &&
    vehicleModel.trim() !== '' &&
    vehicleColor.trim() !== '' &&
    vehicleYear.trim() !== '' &&
    !validateYear(vehicleYear) &&
    termsAccepted
  );
};

export const OnboardingStep1Screen: React.FC = () => {
  const navigation = useAppNavigation();
  const phone = useAuthStore((s) => s.phone) ?? '';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('Auto');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState('');

  const setError = (field: keyof ValidationErrors, error: string | undefined) => {
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galeria para agregar una foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleContinue = async () => {
    if (
      !isFormValid(
        firstName,
        lastName,
        vehiclePlate,
        vehicleBrand,
        vehicleModel,
        vehicleColor,
        vehicleYear,
        termsAccepted,
      )
    )
      return;
    setLoading(true);
    setSubmitError('');

    try {
      let uploadedPhotoUrl: string | null = null;

      if (photoUri) {
        const response = await fetch(photoUri);
        const blob = await response.blob();
        const fileName = `avatars/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('driver-documents')
          .upload(fileName, blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('driver-documents').getPublicUrl(fileName);
        uploadedPhotoUrl = urlData.publicUrl;
      }

      await apiClient.put('/drivers/me', {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
        vehicle_brand: vehicleBrand.trim(),
        vehicle_model: vehicleModel.trim(),
        vehicle_color: vehicleColor.trim(),
        vehicle_year: Number.parseInt(vehicleYear, 10),
        vehicle_type: vehicleType,
        photo_url: uploadedPhotoUrl ?? null,
      });

      navigation.navigate('OnboardingStep2');
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Error al guardar los datos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Paso 1/2" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.avatarSection} onPress={pickImage} activeOpacity={0.7}>
          <View style={styles.avatarCircle}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarIcon}>📷</Text>
            )}
          </View>
          <Text style={styles.avatarLabel}>Agregar foto</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>PERFIL</Text>
        <Input
          placeholder="Nombre"
          value={firstName}
          onChangeText={(t) => {
            setFirstName(t);
            setError('firstName', undefined);
          }}
          onBlur={() => setError('firstName', validateFirstName(firstName))}
          error={errors.firstName}
          containerStyle={styles.input}
          maxLength={100}
        />
        <Input
          placeholder="Apellido"
          value={lastName}
          onChangeText={(t) => {
            setLastName(t);
            setError('lastName', undefined);
          }}
          onBlur={() => setError('lastName', validateLastName(lastName))}
          error={errors.lastName}
          containerStyle={styles.input}
          maxLength={100}
        />
        <Input
          placeholder={phone || '+54 9 XX XXXX-XXXX'}
          value={phone}
          editable={false}
          containerStyle={[styles.input, styles.lockedInput]}
        />

        <View style={{ height: theme.spacing.md }} />

        <Text style={styles.sectionTitle}>VEHICULO</Text>
        <View style={styles.vehicleTypes}>
          {VEHICLE_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.vehicleType, vehicleType === type && styles.vehicleTypeSelected]}
              onPress={() => setVehicleType(type)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.vehicleTypeText,
                  vehicleType === type && styles.vehicleTypeTextSelected,
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Input
          placeholder="Patente"
          value={vehiclePlate}
          onChangeText={(t) => {
            setVehiclePlate(t.toUpperCase());
            setError('vehiclePlate', undefined);
          }}
          onBlur={() => setError('vehiclePlate', validatePlate(vehiclePlate))}
          error={errors.vehiclePlate}
          containerStyle={styles.input}
          autoCapitalize="characters"
          maxLength={8}
        />
        <View style={styles.row}>
          <Input
            placeholder="Marca"
            value={vehicleBrand}
            onChangeText={(t) => {
              setVehicleBrand(t);
              setError('vehicleBrand', undefined);
            }}
            onBlur={() => setError('vehicleBrand', validateRequired(vehicleBrand))}
            error={errors.vehicleBrand}
            containerStyle={styles.halfInput}
          />
          <Input
            placeholder="Modelo"
            value={vehicleModel}
            onChangeText={(t) => {
              setVehicleModel(t);
              setError('vehicleModel', undefined);
            }}
            onBlur={() => setError('vehicleModel', validateRequired(vehicleModel))}
            error={errors.vehicleModel}
            containerStyle={styles.halfInput}
          />
        </View>
        <View style={styles.row}>
          <Input
            placeholder="Color"
            value={vehicleColor}
            onChangeText={(t) => {
              setVehicleColor(t);
              setError('vehicleColor', undefined);
            }}
            onBlur={() => setError('vehicleColor', validateRequired(vehicleColor))}
            error={errors.vehicleColor}
            containerStyle={styles.halfInput}
          />
          <Input
            placeholder="Año"
            value={vehicleYear}
            onChangeText={(t) => {
              setVehicleYear(t);
              setError('vehicleYear', undefined);
            }}
            onBlur={() => setError('vehicleYear', validateYear(vehicleYear))}
            error={errors.vehicleYear}
            containerStyle={styles.halfInput}
            keyboardType="numeric"
            maxLength={4}
          />
        </View>

        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setTermsAccepted(!termsAccepted)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]} />
          <Text style={styles.checkboxLabel}>Acepto los terminos y condiciones</Text>
        </TouchableOpacity>

        {submitError !== '' && <Text style={styles.submitError}>{submitError}</Text>}

        <Button
          title="CONTINUAR"
          onPress={handleContinue}
          disabled={
            !isFormValid(
              firstName,
              lastName,
              vehiclePlate,
              vehicleBrand,
              vehicleModel,
              vehicleColor,
              vehicleYear,
              termsAccepted,
            )
          }
          loading={loading}
          variant="cta"
          style={styles.button}
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
    gap: theme.spacing.sm,
  },
  avatarSection: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.mediumGray,
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
  avatarLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  input: {
    width: 343,
  },
  lockedInput: {
    opacity: 0.6,
  },
  halfInput: {
    flex: 1,
  },
  vehicleTypes: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    width: 343,
  },
  vehicleType: {
    flex: 1,
    height: 44,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
  vehicleTypeSelected: {
    backgroundColor: theme.colors.turquoise,
    borderColor: theme.colors.turquoise,
  },
  vehicleTypeText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  vehicleTypeTextSelected: {
    color: theme.colors.white,
    fontWeight: theme.fontWeight.bold,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    width: 343,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: 343,
    marginTop: theme.spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.turquoise,
    borderColor: theme.colors.turquoise,
  },
  checkboxLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  submitError: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: 343,
  },
  button: {
    width: 343,
    marginTop: theme.spacing.md,
  },
});
