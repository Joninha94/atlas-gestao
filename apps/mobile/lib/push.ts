import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

// Com o app aberto o banner é o nosso (estilo WhatsApp, lib/avisos.tsx); o sistema só toca o som e guarda na central.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

/**
 * Registra o token Expo Push do aparelho na API (POST /app/push-token).
 * O backend envia as guias e avisos por push para todos os aparelhos do contato.
 */
export async function registerPush() {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Avisos do escritório', importance: Notifications.AndroidImportance.HIGH });
    // Canal usado pelo aviso de tarefa concluída: pop-up na tela, som e vibração (como uma mensagem do WhatsApp)
    await Notifications.setNotificationChannelAsync('avisos', {
      name: 'Tarefas concluídas e documentos', importance: Notifications.AndroidImportance.MAX, sound: 'default',
      vibrationPattern: [0, 250, 200, 250], lightColor: '#25D366', lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE, showBadge: true,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId || undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api('/app/push-token', { body: { token, platform: Platform.OS } }).catch(() => undefined);
  return token;
}
