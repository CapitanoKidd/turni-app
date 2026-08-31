import {
  Baloo2_400Regular,
  Baloo2_500Medium,
  Baloo2_600SemiBold,
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/baloo-2";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ensureAndroidChannel } from "../lib/notifications";
import { theme } from "../lib/theme";
import { TutorialProvider } from "../lib/tutorial";

// Resta visibile finche' i pesi del font non sono pronti (sotto), invece di
// mostrare un frame col font di sistema che poi scatta a Baloo 2.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Baloo2_400Regular,
    Baloo2_500Medium,
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
  });

  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <TutorialProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.text,
            headerTitleStyle: { fontSize: theme.typography.heading.fontSize, fontFamily: theme.typography.heading.fontFamily },
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
