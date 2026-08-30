import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { theme } from "../../lib/theme";
import { useTutorialTarget } from "../../lib/tutorial";

/** Avvolge l'icona di un tab in un target del tutorial guidato, senza cambiare come la barra dei tab la disegna. */
function TutorialTabIcon({ id, children }: { id: "tab-settings" | "tab-calendar"; children: React.ReactNode }) {
  const ref = useTutorialTarget(id);
  return <View ref={ref}>{children}</View>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: "700" },
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendario",
          tabBarIcon: ({ color, size }) => (
            <TutorialTabIcon id="tab-calendar">
              <Ionicons name="calendar" size={size} color={color} />
            </TutorialTabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Impostazioni",
          tabBarIcon: ({ color, size }) => (
            <TutorialTabIcon id="tab-settings">
              <Ionicons name="settings" size={size} color={color} />
            </TutorialTabIcon>
          ),
        }}
      />
    </Tabs>
  );
}
