import { Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ensureAndroidChannel } from "../lib/notifications";
import { theme } from "../lib/theme";
import { TutorialProvider } from "../lib/tutorial";

export default function RootLayout() {
  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  return (
    <SafeAreaProvider>
      <TutorialProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.text,
            headerTitleStyle: { fontSize: theme.typography.heading.fontSize, fontWeight: theme.typography.heading.fontWeight },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="import-review"
            options={{ presentation: "modal", title: "Turni rilevati" }}
          />
          <Stack.Screen
            name="shift-type-editor"
            options={{ presentation: "modal", title: "Tipo di turno" }}
          />
          <Stack.Screen
            name="debug-info"
            options={{ presentation: "modal", title: "Debug analisi" }}
          />
        </Stack>
      </TutorialProvider>
    </SafeAreaProvider>
  );
}
