import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { theme } from "../../lib/theme";
import { TutorialTarget } from "../../lib/tutorial";

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
          tabBarIcon: ({ color, size }) => (
            <TutorialTarget name="tab-home">
              <Ionicons name="home" size={size} color={color} />
            </TutorialTarget>
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendario",
          tabBarIcon: ({ color, size }) => (
            <TutorialTarget name="tab-calendar">
              <Ionicons name="calendar" size={size} color={color} />
            </TutorialTarget>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Impostazioni",
          tabBarIcon: ({ color, size }) => (
            <TutorialTarget name="tab-settings">
              <Ionicons name="settings" size={size} color={color} />
            </TutorialTarget>
          ),
        }}
      />
    </Tabs>
  );
}
