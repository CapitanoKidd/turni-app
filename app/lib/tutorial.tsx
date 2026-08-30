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

export function TutorialProvider({ children }: PropsWithChildren): ReactNode {
  const [stepIndex, setStepIndex] = useState<number | null>(null); // null finche' non sappiamo se va mostrato
  const [rect, setRect] = useState<Rect | null>(null);
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
    // avanti da solo, perche' la route e' gia' quella giusta, e l'utente
    // non lo vedrebbe mai.
    //
    // Il ritardo prima di attivare lo step 0 non e' decorativo: la
    // navigazione (router.push) e lo stato del tutorial (setStepIndex) sono
    // due fonti separate che si aggiornano in momenti diversi. Attivando lo
    // step subito, per un istante "pathname" potrebbe riportare ancora
    // "/settings" (la schermata da cui si e' partiti): lo step 0 lo
    // leggerebbe come "sei gia' li'", avanzerebbe subito da solo, e
    // l'utente non vedrebbe mai comparire nulla — esattamente il sintomo
    // "torna alla home e non succede niente". Aspettare che la transizione
    // sia conclusa evita la corsa.
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
  // continuo (e un leggero tremolio) ogni 300ms a riposo.
  useEffect(() => {
    // Azzera subito, non solo quando il tour finisce: senza questo, appena
    // uno step cambia schermata (es. da Impostazioni all'editor del turno),
    // per un attimo restava visibile il vecchio riquadro evidenziato — nel
    // posto sbagliato, sopra una schermata che non c'entra — finche' la
    // prima misurazione del nuovo target non arrivava.
    setRect(null);
    if (!currentStep) return;
    let cancelled = false;

    function measure() {
      const ref = targetsRef.current.get(currentStep!.id);
      const node = ref?.current;
      if (!node?.measureInWindow) return;
      node.measureInWindow((x, y, width, height) => {
        // measureInWindow puo' restituire NaN (non zero: proprio NaN) su
        // Android quando la vista non e' ancora "attaccata" alla finestra
        // (es. subito dopo un remount/Fast Refresh) — un controllo tipo
        // "width <= 0" NON lo scarta: qualsiasi confronto numerico con NaN
        // e' sempre false, quindi "NaN <= 0" vale false e il valore
        // passerebbe indisturbato, finendo in uno stile nativo e mandando
        // in crash il render ("<<NaN>>" non e' un argomento valido).
        // Number.isFinite e' l'unico controllo che lo rileva davvero.
        if (cancelled || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
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

  // Stabili tra i render (dipendono solo dal ref, mai da stato che cambia
  // spesso): senza questo, ogni singolo re-render di TutorialProvider (che
  // succede a ogni cambio di pathname in QUALSIASI punto dell'app, dato che
  // usePathname() vive qui) avrebbe ricreato l'intero contextValue, e ogni
  // componente che usa useTutorialTarget/useTutorialCondition in tutta
  // l'app (anche su schermate non visibili) avrebbe rieseguito il proprio
  // effetto di registrazione — inutile, e un potenziale terreno per corse
  // fra cancellazione e nuova registrazione dello stesso target.
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
      {/*
        Etichetta diagnostica TEMPORANEA (da togliere una volta capito
        perche' l'overlay non compariva mai): mostra lo stato interno vero,
        sempre, indipendentemente dal resto — cosi' la prossima prova dice
        con certezza SE il problema e' "lo step non parte mai" o "lo step
        parte ma l'overlay non si vede", invece di doverlo indovinare da
        "non succede nulla".
      */}
      <View pointerEvents="none" style={styles.debugBadge}>
        <Text style={styles.debugBadgeText}>
          tutorial: step={stepIndex === null ? "caricamento" : stepIndex} ({currentStep?.id ?? "nessuno"}) rect=
          {rect ? "trovato" : "no"} path={pathname}
          {"\n"}bersagli registrati: {targetsRef.current.size === 0 ? "(nessuno)" : [...targetsRef.current.keys()].join(", ")}
          {"\n"}nodo attivo: {currentStep ? (targetsRef.current.get(currentStep.id)?.current ? "presente" : "MANCANTE") : "-"}
        </Text>
      </View>
      {/*
        Si mostra solo quando il target dello step attivo e' stato davvero
        misurato ("rect" non nullo). Con step che vivono su schermate
        diverse (es. "add-shift-button" su Impostazioni ma il passo
        successivo, "shift-alarm", ha il suo target di nuovo su
        Impostazioni dopo essere passati dall'editor del turno) il target
        a volte non esiste affatto sulla schermata corrente: niente da
        evidenziare, quindi niente overlay — l'utente resta libero di
        usare la schermata (es. compilare il modulo del nuovo turno) senza
        che nulla lo blocchi. Riappare da solo appena si torna su una
        schermata dove il target dello step attivo esiste.
      */}
      {running && rect ? (
        <TutorialOverlay
          key={currentStep!.id}
          step={currentStep!}
          rect={rect}
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

const styles = StyleSheet.create({
  // TEMPORANEO: vedi commento sopra. zIndex/elevation alti apposta, per
  // escludere anche l'ipotesi "qualcos'altro lo copre".
  debugBadge: {
    position: "absolute",
    top: 40,
    left: 8,
    right: 8,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "#ff00ff",
    padding: 6,
    borderRadius: 6,
  },
  debugBadgeText: { color: "#000", fontSize: 11, fontWeight: "700" },
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
  tooltipText: { color: theme.colors.text, fontSize: 15, lineHeight: 21 },
  tooltipActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  skipText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: "600" },
  nextButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  nextButtonText: { color: theme.colors.primaryText, fontWeight: "700" },
});
