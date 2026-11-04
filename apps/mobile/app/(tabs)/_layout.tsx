import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { C, IconName } from '../../components/ui';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color, size }: { color: any; size: number }) => <Ionicons name={icon} color={color as string} size={size} />,
});

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: C.brandDark }, headerTintColor: C.white, headerTitleStyle: { fontWeight: '600' },
      tabBarActiveTintColor: C.brand, tabBarInactiveTintColor: '#94a3b8', sceneStyle: { backgroundColor: C.bg },
    }}>
      <Tabs.Screen name="index" options={tab('Início', 'home-outline')} />
      <Tabs.Screen name="guias" options={tab('Guias', 'receipt-outline')} />
      <Tabs.Screen name="notas" options={tab('Notas', 'document-text-outline')} />
      <Tabs.Screen name="documentos" options={tab('Documentos', 'folder-open-outline')} />
      <Tabs.Screen name="mais" options={tab('Mais', 'grid-outline')} />
    </Tabs>
  );
}
