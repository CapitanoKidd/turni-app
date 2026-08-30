import { router } from "expo-router";
import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { LayoutRectangle, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CopilotProvider, CopilotStep, useCopilot, walkthroughable, type TooltipProps } from "react-native-copilot";
import { storage } from "./storage";
import { theme } from "./theme";

/** Spazio in piu' tra il bordo evidenziato e l'elemento vero e proprio. */
const HIGHLIGHT_PADDING = 8;

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
 * schermata (le icone dei tab): la navigazione avviene qui, PRIMA di passare
 * allo step successivo.
 *
 * Il passaggio allo step successivo pero' NON e' immediato (vedi
 * "ADVANCE_DELAY_MS" sotto): la schermata di destinazione si monta solo alla
 * prima visita (comportamento di default di react-navigation — di proposito
 * NON forzato con "lazy: false" su tutte le schermate insieme, perche' cosi'
 * facendo le schermate ancora non visitate restano montate ma nascoste, e
 * misurarne un elemento nascosto restituisce misure inattendibili: e'
 * esattamente il problema che si e' presentato provando quella strada), e il
 * suo CopilotStep si "registra" solo a montaggio avvenuto. Passare allo step
 * successivo troppo presto (nello stesso istante della navigazione) lo
 * troverebbe non ancora registrato, e il tour salterebbe dritto allo step
 * dopo ancora, senza spiegare nulla di quella schermata.
 */
const NAVIGATE_ON_ADVANCE: Partial<Record<string, string>> = {
  "tab-settings": "/settings",
  "tab-calendar": "/calendar",
  "tab-home": "/(tabs)",
};

/** Tempo dato a una schermata appena navigata di montarsi e registrare il suo step, prima di avanzare. */
const ADVANCE_DELAY_MS = 250;

/**
 * Il fumetto NON segue piu' la posizione dell'elemento evidenziato: e' fisso
 * appena sopra la barra dei tab, sempre nello stesso punto dello schermo (vedi
 * "tooltipStyle" su CopilotProvider, che rende l'intero riquadro a schermo
 * intero cosi' le coordinate qui sotto sono gia' relative allo schermo).
 *
 * Motivo: la libreria calcola dove metterlo (sopra/sotto il target) misurando
 * la posizione dell'elemento UNA volta, quando lo step si attiva — se dopo
 * quel momento lo schermo scorre (una ScrollView lunga, es. tanti turni in
 * "Gestisci turni") o cambia altezza (la tastiera che si apre sul campo
 * nome), quella misura non e' piu' valida e il fumetto puo' apparire fuori
 * schermo, tagliato. Un punto fisso, sempre sopra la barra dei tab, elimina
 * il problema alla radice invece di rincorrere ogni singolo caso — e per lo
 * stesso motivo l'animazione di spostamento del riquadro evidenziato e'
 * disattivata (era comunque lenta e a scatti): il riquadro compare subito
 * dove serve, senza intermezzi da inseguire.
 *
 * Il ritaglio scuro intorno all'elemento (il "buco" nell'overlay) lo disegna
 * la libreria stessa, sempre un rettangolo netto: per farlo leggere di piu' e
 * con angoli arrotondati, sopra ci disegniamo una cornice colorata e
 * arrotondata, misurando lo stesso elemento con "currentStep.measure()" (la
 * stessa funzione, gia' affidabile su questo dispositivo, che la libreria usa
 * per il buco).
 */
function AppTooltip({ labels }: TooltipProps) {
  const { currentStep, goToNext, isLastStep, stop } = useCopilot();
  const [highlightRect, setHighlightRect] = useState<LayoutRectangle | null>(null);

  // "goToNext" cambia identita' ogni volta che uno step si registra (vedi lo
  // stesso motivo spiegato su "startRef" in TutorialController): quando lo
  // richiamiamo con un ritardo (sotto), leggerlo da un ref invece che dalla
  // variabile catturata alla pressione del bottone assicura che si usi la
  // versione più recente, con lo step appena registrato già nella lista.
  const goToNextRef = useRef(goToNext);
  goToNextRef.current = goToNext;

  useEffect(() => {
    let cancelled = false;
    setHighlightRect(null);
    if (currentStep) {
      currentStep.measure().then((rect) => {
        if (!cancelled) setHighlightRect(rect);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [currentStep]);

  if (!currentStep) return null;

  function handleAdvance() {
    if (isLastStep) {
      stop();
      return;
    }
    const target = NAVIGATE_ON_ADVANCE[currentStep!.name];
    if (target) {
      router.push(target);
      // Da' tempo alla schermata di destinazione di montarsi e registrare il
      // suo step (vedi il commento su NAVIGATE_ON_ADVANCE) prima di avanzare.
      setTimeout(() => goToNextRef.current(), ADVANCE_DELAY_MS);
    } else {
      goToNext();
    }
  }

  return (
    <View style={styles.fullscreenLayer} pointerEvents="box-none">
      {highlightRect ? (
        <View
          pointerEvents="none"
          style={[
            styles.highlightRing,
            {
              left: highlightRect.x - HIGHLIGHT_PADDING,
              top: highlightRect.y - HIGHLIGHT_PADDING,
              width: highlightRect.width + HIGHLIGHT_PADDING * 2,
              height: highlightRect.height + HIGHLIGHT_PADDING * 2,
            },
          ]}
        />
      ) : null}
      <View style={[styles.tooltip, styles.tooltipBubble]}>
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
    </View>
  );
}

/** Nessun elemento visivo: solo la logica che avvia il tour e salva il completamento. */
function TutorialController() {
  const { start, copilotEvents } = useCopilot();
  // "start" cambia identita' ogni volta che uno step si registra/deregistra
  // (cioe' a ogni navigazione, dato che i CopilotStep delle schermate che si
  // smontano/montano vanno e vengono): tenerla in un ref evita che l'effetto
  // sotto si ripeta e faccia ripartire il tour dal primo passo ogni volta
  // che l'utente naviga con "Avanti".
  const startRef = useRef(start);
  startRef.current = start;
  const hasAutoStarted = useRef(false);

  useEffect(() => {
    if (hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    storage.getTutorialCompleted().then((done) => {
      // Piccolo ritardo: al primo render il target del passo 1 (icona tab
      // Impostazioni) potrebbe non essere ancora misurabile.
      if (!done) setTimeout(() => startRef.current(), 400);
    });
  }, []);

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
      animated={false}
      animationDuration={0}
      arrowSize={0}
      stepNumberComponent={() => null}
      stopOnOutsideClick={false}
      backdropColor="rgba(4,8,16,0.82)"
      tooltipStyle={styles.fullscreenLayer}
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
  // Sovrascrive il posizionamento che la libreria calcolerebbe in base al
  // target (vedi il commento sopra AppTooltip): copre tutto lo schermo, senza
  // offset, cosi' sia il fumetto sia la cornice evidenziata dentro
  // AppTooltip possono posizionarsi con coordinate assolute relative allo
  // schermo (altrimenti sarebbero relative al riquadro che la libreria
  // stessa posizionerebbe in base al target — proprio quello che vogliamo
  // evitare). "top/left/right/bottom/maxWidth" qui vincono su quelli che la
  // libreria avrebbe impostato lei stessa in base alla misura del target,
  // perche' un valore presente nell'ultimo oggetto di uno style array vince
  // sempre su un valore per la stessa chiave nei precedenti.
  fullscreenLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    maxWidth: undefined,
    backgroundColor: "transparent",
    // La libreria imposta di default "paddingTop"/"paddingHorizontal" (non
    // "padding") e "overflow: hidden" sul riquadro che ospita il fumetto:
    // essendo chiavi di stile diverse da "padding", non basta azzerare
    // quest'ultima per eliminarle (in RN vincono comunque, sono piu'
    // specifiche del semplice "padding"), altrimenti sposterebbero di
    // qualche pixel tutto cio' che posizioniamo qui dentro con coordinate
    // assolute. Vanno azzerate esplicitamente una per una.
    padding: 0,
    paddingTop: 0,
    paddingHorizontal: 0,
    borderRadius: 0,
    overflow: "visible",
  },
  // Cornice colorata e arrotondata sopra il ritaglio scuro (che resta un
  // rettangolo netto, disegnato dalla libreria): piu' visibile di un
  // semplice buco nell'overlay, e piu' "precisa" nel far percepire i confini
  // esatti dell'elemento — vedi il commento sopra AppTooltip per il motivo.
  highlightRing: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 3,
    borderColor: theme.colors.primary,
    backgroundColor: "transparent",
  },
  // Il fumetto vero e proprio: sempre alla stessa distanza dal fondo dello
  // schermo, con margini laterali fissi.
  tooltipBubble: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 96,
  },
  tooltip: {
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
