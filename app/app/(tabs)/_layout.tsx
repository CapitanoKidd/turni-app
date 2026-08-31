import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { theme } from "../../lib/theme";
import { TutorialTarget } from "../../lib/tutorial";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background, shadowOpacity: 0, elevation: 0 },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontSize: theme.typography.heading.fontSize, fontWeight: theme.typography.heading.fontWeight },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 0,
          height: Platform.OS === "ios" ? 86 : 66,
          paddingTop: 10,
          paddingBottom: Platform.OS === "ios" ? 28 : 10,
          // Ombra verso l'alto (altezza negativa): la barra "galleggia" sopra
          // il contenuto scorrevole, invece del solito bordo netto.
          shadowColor: "#000814",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 12,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 2 },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <TutorialTarget name="tab-home">
              <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
            </TutorialTarget>
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendario",
          tabBarIcon: ({ color, size, focused }) => (
            <TutorialTarget name="tab-calendar">
              <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} />
            </TutorialTarget>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Impostazioni",
          tabBarIcon: ({ color, size, focused }) => (
            <TutorialTarget name="tab-settings">
              <Ionicons name={focused ? "settings" : "settings-outline"} size={size} color={color} />
            </TutorialTarget>
          ),
        }}
      />
    </Tabs>
  );
}
