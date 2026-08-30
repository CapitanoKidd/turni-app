import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { theme } from "../../lib/theme";
import { CopilotStep, WalkthroughableView } from "../../lib/tutorial";

/** Avvolge l'icona di un tab in uno step del tutorial guidato, senza cambiare come la barra dei tab la disegna. */
function TutorialTabIcon({
  id,
  order,
  text,
  children,
}: {
  id: string;
  order: number;
  text: string;
  children: React.ReactElement;
}) {
  return (
    <CopilotStep name={id} order={order} text={text}>
      <WalkthroughableView>{children}</WalkthroughableView>
    </CopilotStep>
  );
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
          tabBarIcon: ({ color, size }) => (
            <TutorialTabIcon id="tab-home" order={7} text="Torniamo alla Home.">
              <Ionicons name="home" size={size} color={color} />
            </TutorialTabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendario",
          tabBarIcon: ({ color, size }) => (
            <TutorialTabIcon id="tab-calendar" order={5} text="Ora vai al calendario.">
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
            <TutorialTabIcon id="tab-settings" order={1} text="Benvenuto! Inizia da qui: tocca Impostazioni.">
              <Ionicons name="settings" size={size} color={color} />
            </TutorialTabIcon>
          ),
        }}
      />
    </Tabs>
  );
}
