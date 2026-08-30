import { router, usePathname } from "expo-router";
import { useEffect, type PropsWithChildren, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CopilotProvider, CopilotStep, useCopilot, walkthroughable, type TooltipProps } from "react-native-copilot";
import { storage } from "./storage";
import { theme } from "./theme";

/**
 * Tutorial guidato alla prima apertura, basato su react-native-copilot
 * (overlay + fumetto gia' pronti e testati, invece di un componente scritto
 * a mano): nessun costo/hosting, e' solo codice nel bundle dell'app.
 *
 * Ogni schermata avvolge l'elemento da evidenziare in un <CopilotStep>
 * (vedi settings.tsx, calendar.tsx, (tabs)/_layout.tsx). Qui vive solo la
 * configurazione visiva e la logica di avanzamento: alcuni step avanzano
 * da soli (navigazione reale o una condizione soddisfatta), altri solo col
 * pulsante "Avanti" nel fumetto.
 */

export const WalkthroughableView = walkthroughable(View);

/** Nomi degli step di CopilotStep che il codice fa avanzare da solo (nessun pulsante "Avanti" da mostrare). */
const AUTO_ADVANCE_STEPS = new Set(["tab-settings", "username-input", "tab-calendar"]);

function AppTooltip({ labels }: TooltipProps) {
  const { currentStep, goToNext, isLastStep, stop } = useCopilot();
  if (!currentStep) return null;
  const showNextButton = !AUTO_ADVANCE_STEPS.has(currentStep.name);

  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipText}>{currentStep.text}</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => stop()}>
          <Text style={styles.skipText}>{labels.skip ?? "Salta"}</Text>
        </TouchableOpacity>
        {showNextButton ? (
          <TouchableOpacity style={styles.nextButton} onPress={() => (isLastStep ? stop() : goToNext())}>
            <Text style={styles.nextButtonText}>{isLastStep ? labels.finish : labels.next}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/** Nessun elemento visivo: solo la logica che parte/avanza/salva il tour. */
function TutorialController() {
  const { start, currentStep, goToNext, copilotEvents } = useCopilot();
  const pathname = usePathname();

  useEffect(() => {
    storage.getTutorialCompleted().then((done) => {
      // Piccolo ritardo: al primo render il target del passo 1 (icona tab
      // Impostazioni) potrebbe non essere ancora misurabile.
      if (!done) setTimeout(() => start(), 400);
    });
  }, [start]);

  useEffect(() => {
    const onStop = () => {
      storage.setTutorialCompleted(true);
    };
    copilotEvents.on("stop", onStop);
    return () => {
      copilotEvents.off("stop", onStop);
    };
  }, [copilotEvents]);

  // Step "tab-settings"/"tab-calendar": avanzano da soli quando la
  // navigazione porta davvero sulla route giusta (non un pulsante finto).
  useEffect(() => {
    if (!currentStep) return;
    if (currentStep.name === "tab-settings" && pathname === "/settings") goToNext();
    if (currentStep.name === "tab-calendar" && pathname === "/calendar") goToNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentStep?.name]);

  return null;
}

/** Da chiamare nella schermata Impostazioni: avanza lo step "username-input" appena il nome non e' piu' vuoto. */
export function useAdvanceWhenUsernameFilled(hasUsername: boolean): void {
  const { currentStep, goToNext } = useCopilot();
  useEffect(() => {
    if (currentStep?.name === "username-input" && hasUsername) goToNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUsername, currentStep?.name]);
}

/**
 * Da chiamare da un pulsante "Rivedi il tutorial" (es. in Impostazioni):
 * dimentica il completamento, torna alla Home (punto di partenza naturale
 * del tour) e lo fa ripartire — senza dover disinstallare l'app o forzarne
 * la chiusura per rivederlo.
 */
export function useRestartTutorial(): () => void {
  const { start } = useCopilot();
  return () => {
    storage.setTutorialCompleted(false).then(() => {
      router.push("/(tabs)");
      setTimeout(() => start(), 500);
    });
  };
}

export function TutorialProvider({ children }: PropsWithChildren): ReactNode {
  return (
    <CopilotProvider
      overlay="svg"
      animated
      stopOnOutsideClick={false}
      backdropColor="rgba(4,8,16,0.82)"
      arrowColor={theme.colors.surface}
      tooltipStyle={styles.tooltipWrapper}
      tooltipComponent={AppTooltip}
      labels={{ skip: "Salta", previous: "Indietro", next: "Avanti", finish: "Ho capito, inizia!" }}
    >
      <TutorialController />
      {children}
    </CopilotProvider>
  );
}

export { CopilotStep };

const styles = StyleSheet.create({
  tooltipWrapper: { backgroundColor: "transparent", padding: 0 },
  tooltip: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    maxWidth: 320,
  },
  tooltipText: { color: theme.colors.text, fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  skipText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: "600" },
  nextButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  nextButtonText: { color: theme.colors.primaryText, fontWeight: "700" },
});
