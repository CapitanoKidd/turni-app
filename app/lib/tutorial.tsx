import { router } from "expo-router";
import { useEffect, type PropsWithChildren, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CopilotProvider, CopilotStep, useCopilot, walkthroughable, type TooltipProps } from "react-native-copilot";
import { storage } from "./storage";
import { theme } from "./theme";

/**
 * Tutorial guidato alla prima apertura, con react-native-copilot.
 *
 * Si avanza SEMPRE col pulsante "Avanti" nel fumetto, mai aspettando che
 * l'utente tocchi davvero l'elemento evidenziato sotto: e' cosi' che
 * funzionano tutti i tour guidati (anche quando sembra che ti stiano
 * facendo toccare il bottone vero, in realta' e' il tour a farsi da parte
 * dopo il tuo "Avanti", e sei tu a toccarlo per conto tuo, senza che il
 * tour se ne accorga). Il vantaggio, oltre a essere lo standard: non serve
 * piu' che un tocco raggiunga davvero l'elemento sotto l'overlay — quindi
 * il fatto che react-native-copilot disegni l'overlay dentro un Modal
 * nativo (che blocca i tocchi verso il resto dell'app) smette di essere un
 * problema, ed era l'unico motivo per cui l'avevamo scartata la prima
 * volta. La posizione del riquadro evidenziato la calcola la libreria
 * stessa, che sul dispositivo di prova ha sempre funzionato (a differenza
 * del codice scritto a mano in questo file in precedenza).
 *
 * overlay="view" invece di "svg": stesso effetto visivo, ma senza toccare
 * react-native-svg (codice nativo, causava un crash — vedi commit
 * precedenti). react-native-svg resta installato solo come dipendenza
 * transitiva della libreria, mai davvero usato.
 */

export const WalkthroughableView = walkthroughable(View);

/**
 * Per gli step il cui pulsante "Avanti" deve anche portare su un'altra
 * schermata (icone dei tab, o il tasto "+ Nuovo" che apre l'editor del
 * turno): la navigazione avviene qui, PRIMA di passare allo step
 * successivo, cosi' il suo target fa in tempo a montarsi.
 */
const NAVIGATE_ON_ADVANCE: Partial<Record<string, string>> = {
  "tab-settings": "/settings",
  "tab-calendar": "/calendar",
  "tab-home": "/(tabs)",
};

function AppTooltip({ labels }: TooltipProps) {
  const { currentStep, goToNext, isLastStep, stop } = useCopilot();
  if (!currentStep) return null;

  function handleAdvance() {
    if (isLastStep) {
      stop();
      return;
    }
    const target = NAVIGATE_ON_ADVANCE[currentStep!.name];
    if (target) router.push(target);
    goToNext();
  }

  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipText}>{currentStep.text}</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => stop()} hitSlop={8}>
          <Text style={styles.skipText}>{labels.skip ?? "Salta tutorial"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nextButton} onPress={handleAdvance}>
          <Text style={styles.nextButtonText}>{isLastStep ? labels.finish : labels.next}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Nessun elemento visivo: solo la logica che avvia il tour e salva il completamento. */
function TutorialController() {
  const { start, copilotEvents } = useCopilot();

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

  return null;
}

/**
 * Da chiamare da un pulsante "Rivedi il tutorial": torna alla Home (punto
 * di partenza naturale del tour) e lo fa ripartire dal primo step.
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
      overlay="view"
      animated
      stopOnOutsideClick={false}
      backdropColor="rgba(4,8,16,0.82)"
      tooltipStyle={styles.tooltipWrapper}
      tooltipComponent={AppTooltip}
      labels={{ skip: "Salta tutorial", previous: "Indietro", next: "Avanti", finish: "Ho capito, inizia!" }}
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
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
