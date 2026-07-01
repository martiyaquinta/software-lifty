import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

interface PermStatus {
  status: string;
  granted: boolean;
}

export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPush(): Promise<string | null> {
  try {
    const perm = (await Notifications.requestPermissionsAsync()) as unknown as PermStatus;
    if (perm.status !== 'granted') {
      console.warn('Push notification permissions denied');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('trip-requests', {
        name: 'Trip Requests',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.slug,
    });
    return token.data;
  } catch (error) {
    console.error('registerForPush failed:', error);
    return null;
  }
}

export function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  navigate: (screen: string) => void,
): void {
  const type = response.notification.request.content.data?.type as string | undefined;

  switch (type) {
    case 'trip:request':
      navigate('IncomingRequest');
      break;
    case 'kyc:approved':
      navigate('Online');
      break;
    case 'kyc:rejected':
      navigate('UnderReview');
      break;
    case 'payment:deposited':
      navigate('Earnings');
      break;
    default:
      break;
  }
}
