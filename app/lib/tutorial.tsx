import { usePathname } from "expo-router";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
} from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { storage } from "./storage";
import { theme } from "./theme";

/**
 * Tutorial guidato alla prima apertura: overlay scritto a mano, NON dentro
 * un Modal nativo. react-native-copilot (provato prima) disegna il suo
 * overlay dentro un <Modal>, che su Android/iOS e' una finestra nativa
 * separata dal resto dell'app: un tocco su quella finestra non puo' MAI
 * raggiungere un elemento sotto (es. la vera icona "Impostazioni" nella
 * barra dei tab), qualunque fosse la modalita' scelta — limite strutturale
 * della libreria, non risolvibile. Qui l'overlay e' invece una vista
 * normale nello stesso albero dell'app: il "buco" lascia passare i tocchi
 * davvero, perche' semplicemente non c'e' nessuna vista sopra quel punto.
 */

export type TutorialStepId =
  | "tab-settings"
  | "username-input"
  | "manage-shifts"
  | "tab-calendar"
  | "calendar-overview";

interface StepDef {
  id: TutorialStepId;
  text: string;
  /** "route": avanza da solo quando si naviga sulla route indicata. "condition": avanza quando la schermata segnala che la condizione e' soddisfatta. "button": avanza solo col pulsante nel fumetto. */
  advance: "route" | "condition" | "button";
  routeMatch?: string;
  buttonLabel?: string;
  isLast?: boolean;
}

const STEPS: StepDef[] = [
  {
    id: "tab-settings",
    text: "Benvenuto! Inizia da qui: tocca Impostazioni.",
    advance: "route",
    routeMatch: "/settings",
  },
  {
    id: "username-input",
    text: "Inserisci il tuo nome: serve per riconoscere la tua riga nei documenti che carichi.",
    advance: "condition",
  },
  {
    id: "manage-shifts",
    text: "Qui crei i tuoi turni (es. Mattina, Pomeriggio, Notte, Riposo). Su ognuno puoi impostare anche una sveglia dedicata toccando l'icona della sveglia sulla riga del turno.",
    advance: "button",
    buttonLabel: "Avanti",
  },
  {
    id: "tab-calendar",
    text: "Ora vai al calendario.",
    advance: "route",
    routeMatch: "/calendar",
  },
  {
    id: "calendar-overview",
    text: "Qui vedi e modifichi i turni assegnati: tocca un giorno per impostarlo, come riposo, ferie o un turno di lavoro.",
    advance: "button",
    buttonLabel: "Ho capito, inizia!",
    isLast: true,
  },
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TutorialContextValue {
  currentStepId: TutorialStepId | null;
  registerTarget: (id: TutorialStepId, ref: RefObject<View>) => void;
  unregisterTarget: (id: TutorialStepId) => void;
  reportCondition: (id: TutorialStepId, met: boolean) => void;
  restart: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

/** Da agganciare (via ref) all'elemento da evidenziare in un dato step del tutorial. */
export function useTutorialTarget(id: TutorialStepId): RefObject<View> {
  const ref = useRef<View>(null);
  const ctx = useContext(TutorialContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.registerTarget(id, ref);
    return () => ctx.unregisterTarget(id);
  }, [id, ctx]);
  return ref;
}

/** Segnala se la condizione di avanzamento di uno step "condition" e' soddisfatta (es. nome inserito). */
export function useTutorialCondition(id: TutorialStepId, met: boolean): void {
  const ctx = useContext(TutorialContext);
  useEffect(() => {
    ctx?.reportCondition(id, met);
  }, [ctx, id, met]);
}

/** Da chiamare da un pulsante "Rivedi il tutorial": lo fa ripartire dal primo step. */
export function useRestartTutorial(): () => void {
  const ctx = useContext(TutorialContext);
  return () => ctx?.restart();
}

const MEASURE_INTERVAL_MS = 300;
const HOLE_PADDING = 6;
const MOVE_THRESHOLD = 1; // px: sotto questa soglia non si aggiorna, per non "tremolare" per arrotondamenti

export function TutorialProvider({ children }: PropsWithChildren): ReactNode {
  const [stepIndex, setStepIndex] = useState<number | null>(null); // null finche' non sappiamo se va mostrato
  const [rect, setRect] = useState<Rect | null>(null);
  const targetsRef = useRef(new Map<TutorialStepId, RefObject<View>>());
  const pathname = usePathname();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    storage.getTutorialCompleted().then((done) => setStepIndex(done ? -1 : 0));
  }, []);

  const currentStep = stepIndex !== null && stepIndex >= 0 ? STEPS[stepIndex] : null;
  const running = currentStep !== null;

  function finish() {
    setStepIndex(-1);
    storage.setTutorialCompleted(true);
  }

  function goNext() {
    setStepIndex((i) => {
      if (i === null) return i;
      const next = i + 1;
      if (next >= STEPS.length) {
        storage.setTutorialCompleted(true);
        return -1;
      }
      return next;
    });
  }

  function restart() {
    setRect(null);
    setStepIndex(0);
  }

  // Step "route": avanzano da soli quando la navigazione porta sulla route giusta.
  useEffect(() => {
    if (!currentStep || currentStep.advance !== "route") return;
    if (pathname === currentStep.routeMatch) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentStep?.id]);

  // Misura ripetutamente il target dello step attivo: robusto a schermate
  // che finiscono di montare/animarsi dopo il cambio di step, senza dover
  // intercettare ogni evento di layout/scroll possibile. Aggiorna lo stato
  // solo se la posizione e' cambiata davvero, per non causare un ridisegno
  // continuo (e un leggero tremolio) ogni 300ms a riposo.
  useEffect(() => {
    if (!currentStep) {
      setRect(null);
      return;
    }
    let cancelled = false;

    function measure() {
      const ref = targetsRef.current.get(currentStep!.id);
      const node = ref?.current;
      if (!node?.measureInWindow) return;
      node.measureInWindow((x, y, width, height) => {
        if (cancelled || width <= 0 || height <= 0) return;
        setRect((prev) => {
          if (
            prev &&
            Math.abs(prev.x - x) < MOVE_THRESHOLD &&
            Math.abs(prev.y - y) < MOVE_THRESHOLD &&
            Math.abs(prev.width - width) < MOVE_THRESHOLD &&
            Math.abs(prev.height - height) < MOVE_THRESHOLD
          ) {
            return prev;
          }
          return { x, y, width, height };
        });
      });
    }

    measure();
    const interval = setInterval(measure, MEASURE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentStep]);

  const contextValue: TutorialContextValue = {
    currentStepId: currentStep?.id ?? null,
    registerTarget: (id, ref) => {
      targetsRef.current.set(id, ref);
    },
    unregisterTarget: (id) => {
      if (targetsRef.current.get(id)) targetsRef.current.delete(id);
    },
    reportCondition: (id, met) => {
      if (!met) return;
      if (currentStep?.id === id && currentStep.advance === "condition") goNext();
    },
    restart,
  };

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
      {running ? (
        <TutorialOverlay
          key={currentStep!.id}
          step={currentStep!}
          rect={rect}
          windowWidth={windowWidth}
          windowHeight={windowHeight}
          onAdvanceButton={currentStep!.isLast ? finish : goNext}
          onSkip={finish}
        />
      ) : null}
    </TutorialContext.Provider>
  );
}

function TutorialOverlay({
  step,
  rect,
  windowWidth,
  windowHeight,
  onAdvanceButton,
  onSkip,
}: {
  step: StepDef;
  rect: Rect | null;
  windowWidth: number;
  windowHeight: number;
  onAdvanceButton: () => void;
  onSkip: () => void;
}) {
  // Dissolvenza in ingresso a ogni step (anche il primo): un overlay che
  // compare di scatto e' cio' che dava la sensazione di poco curato.
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade, step.id]);

  const hole = rect
    ? {
        x: Math.max(0, rect.x - HOLE_PADDING),
        y: Math.max(0, rect.y - HOLE_PADDING),
        width: rect.width + HOLE_PADDING * 2,
        height: rect.height + HOLE_PADDING * 2,
      }
    : null;

  const spaceBelow = hole ? windowHeight - (hole.y + hole.height) : 0;
  const tooltipBelow = !hole || spaceBelow > 180;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="box-none">
      {hole ? (
        <>
          <View style={[styles.mask, { top: 0, left: 0, right: 0, height: hole.y }]} />
          <View style={[styles.mask, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.mask, { top: hole.y, left: 0, width: hole.x, height: hole.height }]} />
          <View
            style={[
              styles.mask,
              { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height },
            ]}
          />
          <View
            pointerEvents="none"
            style={[styles.holeBorder, { top: hole.y, left: hole.x, width: hole.width, height: hole.height }]}
          />
        </>
      ) : (
        <View style={[styles.mask, StyleSheet.absoluteFillObject]} />
      )}

      <View
        style={[
          styles.tooltip,
          tooltipBelow
            ? { top: (hole ? hole.y + hole.height : windowHeight / 2 - 60) + 12 }
            : { bottom: windowHeight - (hole?.y ?? windowHeight / 2) + 12 },
        ]}
      >
        <Text style={styles.tooltipText}>{step.text}</Text>
        <View style={styles.tooltipActions}>
          <TouchableOpacity onPress={onSkip} hitSlop={8}>
            <Text style={styles.skipText}>Salta</Text>
          </TouchableOpacity>
          {step.advance === "button" ? (
            <TouchableOpacity style={styles.nextButton} onPress={onAdvanceButton}>
              <Text style={styles.nextButtonText}>{step.buttonLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mask: { position: "absolute", backgroundColor: "rgba(4,8,16,0.82)" },
  holeBorder: {
    position: "absolute",
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  tooltip: {
    position: "absolute",
    left: theme.spacing.lg,
    right: theme.spacing.lg,
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
  tooltipActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  skipText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: "600" },
  nextButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  nextButtonText: { color: theme.colors.primaryText, fontWeight: "700" },
});
