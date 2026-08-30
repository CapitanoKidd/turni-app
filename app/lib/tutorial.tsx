import { router, usePathname } from "expo-router";
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
  type RefObject,
} from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { storage } from "./storage";
import { theme } from "./theme";

/**
 * Tutorial guidato alla prima apertura: overlay scritto a mano, NON dentro
 * un Modal nativo (un Modal e' una finestra separata dal resto dell'app:
 * un tocco su quella finestra non puo' mai raggiungere un elemento sotto —
 * provato con react-native-copilot, scartato per questo motivo). Qui
 * l'overlay e' una vista normale nello stesso albero dell'app: il "buco"
 * lascia passare i tocchi davvero, perche' semplicemente non c'e' nessuna
 * vista sopra quel punto.
 *
 * Il posizionamento del "buco" intorno all'elemento da evidenziare dipende
 * da measureInWindow(), un'API nativa che su alcuni dispositivi/versioni di
 * React Native puo' non restituire mai una misura valida (verificato: tre
 * API di misura indipendenti — measureInWindow, measure, UIManager diretto
 * — davano tutte argomenti "undefined", un fallimento sistemico, non un
 * bug isolato). Percio' il design non dipende da quella misura per
 * FUNZIONARE, solo per essere piu' bello da vedere: se dopo un tempo
 * ragionevole non arriva nessuna misura valida, si passa a un fumetto
 * fisso che non blocca nulla (l'utente puo' comunque toccare il vero
 * elemento) invece di sparire — vedi FALLBACK_TIMEOUT_MS piu' sotto.
 */

export type TutorialStepId =
  | "tab-settings"
  | "username-input"
  | "add-shift-button"
  | "shift-alarm"
  | "tab-calendar"
  | "calendar-overview"
  | "tab-home"
  | "upload-button";

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
    text: "Qui puoi inserire il nome presente nel turno.",
    advance: "condition",
  },
  {
    id: "add-shift-button",
    text: "Qui puoi aggiungere un turno e indicarne la fascia oraria. Ad esempio: Mattina 7:00-14:00.",
    advance: "route",
    routeMatch: "/shift-type-editor",
  },
  {
    // Il target di questo step vive di nuovo su Impostazioni (l'icona
    // sveglia del turno appena creato): finche' l'utente e' sull'editor a
    // compilare il modulo, il suo target non esiste ancora da nessuna
    // parte, quindi l'overlay resta nascosto e non intralcia — riappare da
    // solo appena si torna indietro con un turno creato.
    id: "shift-alarm",
    text: "Qui puoi decidere se impostare la sveglia automatica per questo tipo di turno, oppure lasciarlo disattivato: non e' obbligatorio.",
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
    text: "Qui vedi i turni importati: tocca un giorno per modificarlo. Puoi anche cambiare l'orario di un singolo giorno — ad esempio se quel giorno entri o esci a un orario diverso dal solito — senza toccare il tipo di turno.",
    advance: "button",
    buttonLabel: "Avanti",
  },
  {
    id: "tab-home",
    text: "Torniamo alla Home.",
    advance: "route",
    routeMatch: "/",
  },
  {
    id: "upload-button",
    text: "Da qui carichi il tuo primo documento o la foto della griglia turni.",
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
/**
 * Quanto aspettare una misura valida prima di passare al fumetto fisso di
 * riserva. Abbastanza per un mount/animazione normali (il resto dell'app
 * non ha mai impiegato piu' di una manciata di millisecondi), poco
 * abbastanza da non far sembrare il tutorial rotto se la misura non arriva
 * mai (es. dispositivo dove measureInWindow non funziona).
 */
const FALLBACK_TIMEOUT_MS = 1200;

export function TutorialProvider({ children }: PropsWithChildren): ReactNode {
  const [stepIndex, setStepIndex] = useState<number | null>(null); // null finche' non sappiamo se va mostrato
  const [rect, setRect] = useState<Rect | null>(null);
  const [measureTimedOut, setMeasureTimedOut] = useState(false);
  const targetsRef = useRef(new Map<TutorialStepId, RefObject<View>>());
  const pathname = usePathname();
  const { height: windowHeight } = useWindowDimensions();

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

  const restart = useCallback(() => {
    // Il primo step si aspetta di partire dalla Home (mostra "tocca
    // Impostazioni"): se si restasse sulla schermata da cui si preme
    // "Rivedi il tutorial" (Impostazioni), lo step scatterebbe subito
    // avanti da solo, perche' la route e' gia' quella giusta.
    //
    // Il ritardo prima di attivare lo step 0 evita una corsa fra due fonti
    // di stato separate (la navigazione e lo stepIndex locale): senza,
    // "pathname" poteva per un istante riportare ancora la schermata di
    // partenza, facendo scattare lo step avanti da solo prima ancora di
    // comparire.
    router.push("/(tabs)");
    setRect(null);
    setTimeout(() => setStepIndex(0), 350);
  }, []);

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
  // continuo ogni 300ms a riposo. Se non arriva mai una misura valida
  // entro FALLBACK_TIMEOUT_MS, measureTimedOut fa passare al fumetto fisso
  // di riserva (vedi il commento in cima al file).
  useEffect(() => {
    // Azzera subito, non solo quando il tour finisce: senza questo, appena
    // uno step cambia schermata (es. da Impostazioni all'editor del turno),
    // per un attimo restava visibile il vecchio riquadro evidenziato — nel
    // posto sbagliato, sopra una schermata che non c'entra — finche' la
    // prima misurazione del nuovo target non arrivava.
    setRect(null);
    setMeasureTimedOut(false);
    if (!currentStep) return;
    let cancelled = false;

    function measure() {
      const ref = targetsRef.current.get(currentStep!.id);
      const node = ref?.current;
      if (!node?.measureInWindow) return;
      node.measureInWindow((x, y, width, height) => {
        if (cancelled) return;
        // measureInWindow puo' restituire NaN (non zero: proprio NaN) o,
        // su alcuni dispositivi, argomenti del tutto assenti — un
        // controllo tipo "width <= 0" NON basta: qualsiasi confronto
        // numerico con NaN e' sempre false, quindi il valore passerebbe
        // indisturbato. Number.isFinite e' l'unico controllo che lo
        // rileva davvero (e scarta anche "undefined").
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
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
    const timeout = setTimeout(() => {
      if (!cancelled) setMeasureTimedOut(true);
    }, FALLBACK_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [currentStep]);

  // Stabili tra i render (dipendono solo dal ref, mai da stato che cambia
  // spesso): senza questo, ogni singolo re-render di TutorialProvider (che
  // succede a ogni cambio di pathname in QUALSIASI punto dell'app, dato che
  // usePathname() vive qui) avrebbe ricreato l'intero contextValue, e ogni
  // componente che usa useTutorialTarget/useTutorialCondition in tutta
  // l'app (anche su schermate non visibili) avrebbe rieseguito il proprio
  // effetto di registrazione.
  const registerTarget = useCallback((id: TutorialStepId, ref: RefObject<View>) => {
    targetsRef.current.set(id, ref);
  }, []);
  const unregisterTarget = useCallback((id: TutorialStepId) => {
    targetsRef.current.delete(id);
  }, []);
  const reportCondition = useCallback(
    (id: TutorialStepId, met: boolean) => {
      if (!met) return;
      if (currentStep?.id === id && currentStep.advance === "condition") goNext();
    },
    [currentStep],
  );

  const contextValue: TutorialContextValue = useMemo(
    () => ({
      currentStepId: currentStep?.id ?? null,
      registerTarget,
      unregisterTarget,
      reportCondition,
      restart,
    }),
    [currentStep, registerTarget, unregisterTarget, reportCondition, restart],
  );

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
      {running && rect ? (
        // Caso normale: la misura e' arrivata, si vede la versione bella
        // con il riquadro ritagliato intorno all'elemento vero.
        <TutorialOverlay
          key={currentStep!.id}
          step={currentStep!}
          rect={rect}
          windowHeight={windowHeight}
          onAdvanceButton={currentStep!.isLast ? finish : goNext}
          onSkip={finish}
        />
      ) : running && measureTimedOut ? (
        // Riserva: la misura non e' mai arrivata entro il tempo limite.
        // Nessun riquadro scuro (non sapremmo dove lasciare il buco), solo
        // il fumetto fisso — l'utente resta libero di toccare qualunque
        // cosa, compreso il vero elemento a cui lo step si riferisce.
        <FallbackTooltip
          step={currentStep!}
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
  windowHeight,
  onAdvanceButton,
  onSkip,
}: {
  step: StepDef;
  rect: Rect;
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

  const hole = {
    x: Math.max(0, rect.x - HOLE_PADDING),
    y: Math.max(0, rect.y - HOLE_PADDING),
    width: rect.width + HOLE_PADDING * 2,
    height: rect.height + HOLE_PADDING * 2,
  };

  const spaceBelow = windowHeight - (hole.y + hole.height);
  const tooltipBelow = spaceBelow > 180;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlayRoot, { opacity: fade }]} pointerEvents="box-none">
      <View style={[styles.mask, { top: 0, left: 0, right: 0, height: hole.y }]} />
      <View style={[styles.mask, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} />
      <View style={[styles.mask, { top: hole.y, left: 0, width: hole.x, height: hole.height }]} />
      <View
        style={[styles.mask, { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height }]}
      />
      <View
        pointerEvents="none"
        style={[styles.holeBorder, { top: hole.y, left: hole.x, width: hole.width, height: hole.height }]}
      />

      <View
        style={[
          styles.tooltip,
          tooltipBelow
            ? { top: hole.y + hole.height + 12 }
            : { bottom: windowHeight - hole.y + 12 },
        ]}
      >
        <Text style={styles.tooltipText}>{step.text}</Text>
        <View style={styles.tooltipActions}>
          <TouchableOpacity onPress={onSkip} hitSlop={8}>
            <Text style={styles.skipText}>Salta tutorial</Text>
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

/**
 * Versione di riserva: nessun riquadro scuro ne' buco ritagliato (non
 * sappiamo dove metterlo), solo il testo dello step in un fumetto fisso in
 * basso. pointerEvents="box-none" sul contenitore: tutto il resto dello
 * schermo resta toccabile normalmente, compreso il vero elemento a cui lo
 * step si riferisce — l'utente puo' comunque completare il passo.
 */
function FallbackTooltip({
  step,
  onAdvanceButton,
  onSkip,
}: {
  step: StepDef;
  onAdvanceButton: () => void;
  onSkip: () => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade, step.id]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.overlayRoot, { opacity: fade }]}
      pointerEvents="box-none"
    >
      <View style={[styles.tooltip, styles.fallbackTooltip]}>
        <Text style={styles.tooltipText}>{step.text}</Text>
        <View style={styles.tooltipActions}>
          <TouchableOpacity onPress={onSkip} hitSlop={8}>
            <Text style={styles.skipText}>Salta tutorial</Text>
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
  overlayRoot: { zIndex: 9998, elevation: 9998 },
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
  fallbackTooltip: { bottom: 90 },
  tooltipText: { color: theme.colors.text, fontSize: 15, lineHeight: 21 },
  tooltipActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  skipText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: "600" },
  nextButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  nextButtonText: { color: theme.colors.primaryText, fontWeight: "700" },
});
