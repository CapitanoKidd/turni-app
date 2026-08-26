import { Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ensureAndroidChannel } from "../lib/notifications";
import { theme } from "../lib/theme";

export default function RootLayout() {
  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
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
      </Stack>
    </SafeAreaProvider>
  );
}
