import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../lib/theme";
import { TutorialTarget } from "../../lib/tutorial";

type IconName = keyof typeof Ionicons.glyphMap;

/** Icona (piena/outline a seconda che sia attivo) e nome dello step del tutorial per ogni tab, indicizzati per nome di route. */
const TAB_META: Record<string, { icon: IconName; iconActive: IconName; tutorialName: string }> = {
  index: { icon: "home-outline", iconActive: "home", tutorialName: "tab-home" },
  calendar: { icon: "calendar-outline", iconActive: "calendar", tutorialName: "tab-calendar" },
  settings: { icon: "settings-outline", iconActive: "settings", tutorialName: "tab-settings" },
};

/**
 * Tab bar disegnata su misura: la libreria di navigazione renderebbe icona
 * ed etichetta come due elementi indipendenti impilati, ma qui la pillola
 * verde deve avvolgere ENTRAMBI insieme, stretta intorno al contenuto (non
 * a tutta la colonna del tab) — per questo serve un "tabBar" custom invece
 * delle sole opzioni tabBarIcon/tabBarStyle.
 */
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.title === "string" ? options.title : route.name;
        const isFocused = state.index === index;
        const meta = TAB_META[route.name];

        function onPress() {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }

        return (
          <TutorialTarget key={route.key} name={meta?.tutorialName ?? route.name}>
            <TouchableOpacity
              onPress={onPress}
              activeOpacity={0.8}
              style={[styles.item, isFocused && styles.itemActive]}
            >
              <Ionicons
                name={meta ? (isFocused ? meta.iconActive : meta.icon) : "ellipse-outline"}
                size={20}
                color={isFocused ? theme.colors.primary : theme.colors.textFaint}
              />
              <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
            </TouchableOpacity>
          </TutorialTarget>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        // Ogni schermata disegna il proprio titolo dentro il contenuto
        // (vedi "Ciao, {nome}" in Home, "Impostazioni"/"Calendario" in testa
        // alle altre) invece di usare la barra di navigazione di sistema.
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Oggi" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendario" }} />
      <Tabs.Screen name="settings" options={{ title: "Impostazioni" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    minWidth: 84,
  },
  itemActive: { backgroundColor: theme.colors.primaryMuted },
  label: { fontSize: 11, fontFamily: theme.font.bold, color: theme.colors.textFaint },
  labelActive: { color: theme.colors.primary },
});
