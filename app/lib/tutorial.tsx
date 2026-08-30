import { router } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { storage } from "./storage";
import { theme } from "./theme";

/**
 * Tutorial guidato alla prima apertura — implementazione fatta in casa,
 * DELIBERATAMENTE senza alcuna misurazione nativa della posizione degli
 * elementi (measure/measureInWindow e affini).
 *
 * Perche': il tentativo precedente (react-native-copilot) calcola dove
 * disegnare l'evidenziazione misurando la posizione reale dell'elemento
 * con measure(). Su dispositivo reale quella misura si e' rivelata
 * sbagliata in modo SISTEMATICO per elementi dentro una ScrollView
 * (Impostazioni, Calendario) — non un problema di tempistica: provati sia
 * un ritardo dopo la navigazione sia il montaggio anticipato di tutte le
 * schermate, nessuno dei due ha cambiato il risultato di un solo pixel.
 * Ed e' lo stesso problema di fondo gia' incontrato con l'implementazione
 * custom originale di questo file (measureInWindow inattendibile sullo
 * stesso device) — la libreria usa la stessa famiglia di API sotto il
 * cofano, quindi eredita lo stesso limite.
 *
 * Soluzione: l'evidenziazione non e' piu' un overlay disegnato "sopra"
 * l'elemento con coordinate calcolate da fuori. Ogni elemento si evidenzia
 * DA SOLO — la schermata che lo contiene confronta il proprio nome con lo
 * step attuale (questo stesso contesto) e si applica un bordo colorato con
 * il normale stile React Native. Zero coordinate, zero chiamate native:
 * la posizione la decide lo stesso motore di layout che disegna
 * l'elemento, non un calcolo separato che puo' disallinearsi da esso.
 *
 * Il fumetto con testo e pulsanti resta fisso in basso, come prima. Si
 * avanza SEMPRE col pulsante "Avanti", mai legato a un tocco reale
 * sull'elemento sottostante — un livello trasparente sopra tutto il resto
 * dell'app blocca i tocchi altrove, cosi' il tour non puo' disallinearsi
 * da dove l'utente si trova davvero.
 */

interface TutorialStep {
  name: string;
  text: string;
  /** Route su cui navigare, PRIMA di passare allo step successivo, quando si avanza da questo step. */
  navigateTo?: string;
}

const STEPS: TutorialStep[] = [
  { name: "tab-settings", text: "Benvenuto! Inizia da qui: tocca Impostazioni.", navigateTo: "/settings" },
  {
    name: "username-input",
    text: "Inserisci il tuo nome: ci servirà per riconoscere la tua riga nei documenti che carichi.",
  },
  {
    name: "add-shift-button",
    text: "Qui crei i tuoi turni (es. Mattina, Pomeriggio, Notte, Riposo). Su ognuno puoi impostare anche una sveglia dedicata toccando l'icona della sveglia sulla riga del turno.",
  },
  { name: "tab-calendar", text: "Ora vai al calendario.", navigateTo: "/calendar" },
  {
    name: "calendar-overview",
    text: "Qui vedi i turni importati: tocca un giorno per modificarlo. Puoi anche cambiare l'orario di un singolo giorno — ad esempio se quel giorno entri o esci a un orario diverso dal solito — senza toccare il tipo di turno.",
  },
  { name: "tab-home", text: "Torniamo alla Home.", navigateTo: "/(tabs)" },
  { name: "upload-button", text: "Da qui carichi il tuo primo documento o la foto della griglia turni." },
];

interface TutorialContextValue {
  active: boolean;
  currentStepName: string | null;
  restart: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

function useTutorialContext(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorialContext va usato dentro TutorialProvider");
  return ctx;
}

/** true se lo step indicato e' quello attivo in questo momento: usalo per evidenziare l'elemento corrispondente. */
export function useTutorialHighlight(name: string): boolean {
  const { active, currentStepName } = useTutorialContext();
  return active && currentStepName === name;
}

/** Da chiamare da un pulsante "Rivedi il tutorial". */
export function useRestartTutorial(): () => void {
  const { restart } = useTutorialContext();
  return restart;
}

/**
 * Avvolge l'elemento da evidenziare durante lo step "name". Il bordo e'
 * sempre presente (trasparente quando non e' il turno di questo step) cosi'
 * comparire non sposta di qualche pixel il resto del layout intorno.
 */
export function TutorialTarget({
  name,
  style,
  children,
}: PropsWithChildren<{ name: string; style?: StyleProp<ViewStyle> }>) {
  const highlighted = useTutorialHighlight(name);
  return <View style={[style, highlighted ? styles.highlightOn : styles.highlightOff]}>{children}</View>;
}

export function TutorialProvider({ children }: PropsWithChildren): ReactNode {
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(false);
  const hasAutoStarted = useRef(false);

  useEffect(() => {
    if (hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    storage.getTutorialCompleted().then((done) => {
      if (!done) setTimeout(() => setActive(true), 400);
    });
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    storage.setTutorialCompleted(true);
  }, []);

  const restart = useCallback(() => {
    storage.setTutorialCompleted(false).then(() => {
      router.push("/(tabs)");
      setStepIndex(0);
      setTimeout(() => setActive(true), 300);
    });
  }, []);

  const currentStep = active ? STEPS[stepIndex] : null;
  const isLast = stepIndex === STEPS.length - 1;

  function handleAdvance() {
    if (!currentStep) return;
    if (isLast) {
      finish();
      return;
    }
    if (currentStep.navigateTo) router.push(currentStep.navigateTo);
    setStepIndex((i) => i + 1);
  }

  const contextValue = useMemo<TutorialContextValue>(
    () => ({ active, currentStepName: currentStep?.name ?? null, restart }),
    [active, currentStep, restart],
  );

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
      {currentStep ? (
        // Trasparente di proposito (niente sfondo scuro): un overlay scuro
        // sopra tutto oscurerebbe anche l'elemento appena evidenziato,
        // vanificando il bordo colorato. Serve solo a bloccare i tocchi
        // altrove, non a "spegnere" visivamente il resto dello schermo.
        <TouchableWithoutFeedback onPress={() => {}}>
          <View style={styles.blocker}>
            <View style={styles.tooltip}>
              <Text style={styles.tooltipText}>{currentStep.text}</Text>
              <View style={styles.actions}>
                <TouchableOpacity onPress={finish} hitSlop={8}>
                  <Text style={styles.skipText}>Salta tutorial</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nextButton} onPress={handleAdvance}>
                  <Text style={styles.nextButtonText}>{isLast ? "Ho capito, inizia!" : "Avanti"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      ) : null}
    </TutorialContext.Provider>
  );
}

const HIGHLIGHT_BORDER_WIDTH = 3;

const styles = StyleSheet.create({
  highlightOn: {
    borderWidth: HIGHLIGHT_BORDER_WIDTH,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.md,
  },
  highlightOff: {
    borderWidth: HIGHLIGHT_BORDER_WIDTH,
    borderColor: "transparent",
    borderRadius: theme.radius.md,
  },
  blocker: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  tooltip: {
    margin: 16,
    marginBottom: 96,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
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
