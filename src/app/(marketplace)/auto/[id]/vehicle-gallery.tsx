"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type VehicleGalleryProps = {
  images: string[];
  label: string;
};

/**
 * **La striscia le porta tutte, quindi non c'e' piu' niente da limitare.**
 *
 * C'erano otto miniature in griglia e le altre dietro un riquadro "+5 foto".
 * Due cose non andavano. Su un telefono la griglia e' a una colonna: otto
 * miniature alte 128px con gli spazi facevano **circa 1.120 pixel**, cioe'
 * i due terzi dei 1.618 che la galleria pesava in tutto. E per vedere la
 * nona foto serviva un clic, quando le foto sono la cosa che fa vendere.
 *
 * Adesso sono tutte in una striscia che scorre di lato: **nessun clic in
 * piu'**, e il gesto e' quello che chi compra un'auto fa gia' su AutoScout
 * e su Subito, quindi non deve impararlo.
 */
const ALTEZZA_MINIATURA = "h-20";

/**
 * Quante miniature si scaricano all'apertura, e perche' questo numero.
 *
 * **`loading="lazy"` da solo non basta, e la misura lo ha dimostrato.** In
 * una striscia che scorre di lato il browser considera "in vista" tutto
 * quello che sta nella fascia verticale dello schermo, anche cio' che e'
 * oltre il bordo destro: con tredici miniature scaricava tredici immagini.
 * Misurato il 20/09/2026 sulla stessa scheda: **da 4 immagini e 44 KB si
 * passava a 14 e 113 KB**. La pagina si accorciava e il telefono
 * rallentava, che e' uno scambio che non conviene a nessuno.
 *
 * Quattro e' quanto ne entra sullo schermo piu' stretto (390px diviso 120px
 * di miniatura piu' spazio fa tre e un quarto) piu' una di margine. Le
 * altre arrivano a gruppi mentre il dito scorre, e il posto lo tengono da
 * subito: la striscia e' lunga uguale, quindi non si muove niente sotto le
 * dita.
 */
const MINIATURE_SUBITO = 4;

/** Quante se ne aggiungono ogni volta che si arriva in fondo a quelle caricate. */
const MINIATURE_PER_VOLTA = 6;

// Sotto questa distanza il gesto e' un tocco un po' mosso, non uno scorrimento:
// cambiare foto a ogni micro-movimento del dito renderebbe impossibile
// chiudere la galleria toccando lo sfondo.
const SWIPE_MIN_DISTANCE = 48;

export default function VehicleGallery({ images, label }: VehicleGalleryProps) {
  // null = viewer closed; otherwise the index being shown.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [miniatureCaricate, setMiniatureCaricate] = useState(MINIATURE_SUBITO);
  const strisciaRef = useRef<HTMLDivElement | null>(null);
  const sentinellaRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // Uno scorrimento finisce anche in un clic sullo sfondo, che chiuderebbe la
  // galleria subito dopo aver cambiato foto. Questo lo trattiene una volta.
  const swipeHandledRef = useRef(false);

  const total = images.length;
  const isOpen = openIndex !== null;

  const showPrevious = useCallback(() => {
    setOpenIndex((current) => (current === null ? current : (current - 1 + total) % total));
  }, [total]);

  const showNext = useCallback(() => {
    setOpenIndex((current) => (current === null ? current : (current + 1) % total));
  }, [total]);

  const handleTouchStart = (event: React.TouchEvent) => {
    // Piu' dita significa pizzicare per ingrandire, non scorrere.
    touchStartRef.current =
      event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;

    const touch = event.changedTouches[0];
    if (!start || !touch || total < 2) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    // Solo gesti chiaramente orizzontali: uno scorrimento obliquo o verticale
    // non deve far saltare la foto.
    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    swipeHandledRef.current = true;
    if (deltaX < 0) showNext();
    else showPrevious();
  };

  const closeUnlessSwiping = () => {
    if (swipeHandledRef.current) {
      swipeHandledRef.current = false;
      return;
    }
    setOpenIndex(null);
  };

  // Keyboard navigation plus a scroll lock, so the page behind the viewer
  // cannot move while it is open.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenIndex(null);
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    // Move focus off the thumbnail now hidden behind the overlay, so screen
    // readers announce the viewer and Tab stays inside it.
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, showNext, showPrevious]);

  /**
   * Carica il gruppo successivo quando il dito arriva in fondo a quelle
   * gia' pronte. L'osservatore guarda **dentro la striscia** (`root`), non
   * la pagina: e' l'unico modo di sapere che una miniatura e' comparsa
   * scorrendo di lato.
   */
  useEffect(() => {
    const sentinella = sentinellaRef.current;
    const striscia = strisciaRef.current;
    if (!sentinella || !striscia || miniatureCaricate >= total) return;

    const osservatore = new IntersectionObserver(
      (voci) => {
        if (voci.some((v) => v.isIntersecting)) {
          setMiniatureCaricate((quante) => Math.min(total, quante + MINIATURE_PER_VOLTA));
        }
      },
      { root: striscia, rootMargin: "0px 200px 0px 0px" },
    );
    osservatore.observe(sentinella);
    return () => osservatore.disconnect();
  }, [miniatureCaricate, total]);

  const coverUrl = images[0] ?? null;

  return (
    <>
      <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-900 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]">
        <div className="relative h-[460px] max-w-full overflow-hidden bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950">
          {coverUrl ? (
            <button
              type="button"
              onClick={() => setOpenIndex(0)}
              className="group block h-full w-full cursor-zoom-in"
              aria-label={`Apri le foto di ${label}`}
            >
              {/* La foto piu' grande della pagina e la prima che si vede:
                  "priority" la fa partire subito invece di aspettare che il
                  browser scopra che serve. E' la misura che sposta di piu' il
                  tempo percepito su una pagina d'atterraggio. */}
              <Image
                src={coverUrl}
                alt={label}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 66vw"
                className="max-w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
            </button>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-600">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-16 w-16 fill-current opacity-50">
                <path d="M5 6a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h1.5a2.5 2.5 0 1 0 5 0h1a2.5 2.5 0 1 0 5 0H19a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1.35a1 1 0 0 1-.83-.45l-.64-.97A2 2 0 0 0 14.53 4h-5.1a2 2 0 0 0-1.65.88l-.64.97A1 1 0 0 1 6.31 6H5Zm4 9.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
              </svg>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/70 to-transparent" />
          {total > 1 ? (
            <span className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              {total} foto
            </span>
          ) : null}
        </div>

        {total > 1 ? (
          /*
            **La striscia scorre, non si apre.** `overflow-x-auto` con le
            miniature `flex-none`: ci stanno tutte, e chi ne vuole vedere
            un'altra fa scorrere il dito. `snap-x` le fa fermare allineate,
            cosi' non resta mai mezza foto tagliata sul bordo.

            `overscroll-x-contain` serve perche' arrivando in fondo alla
            striscia il gesto non si propaghi alla pagina: senza, chi scorre
            le foto si ritrova improvvisamente a scorrere l'annuncio.
          */
          <div
            ref={strisciaRef}
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain p-3"
            role="group"
            aria-label={`Le ${total} foto di ${label}`}
          >
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => setOpenIndex(index)}
                className={`relative w-28 flex-none snap-start cursor-zoom-in overflow-hidden rounded-xl border border-white/10 bg-slate-800 transition hover:border-blue-400/40 ${ALTEZZA_MINIATURA}`}
                aria-label={`Apri foto ${index + 1} di ${total}`}
              >
                {/*
                  **Le miniature fuori schermo non si scaricano.** In una
                  striscia che scorre di lato il browser considera fuori
                  vista anche cio' che sta oltre il bordo destro, quindi le
                  ultime partono solo quando il dito le porta dentro. Senza,
                  accorciare la pagina avrebbe rallentato il telefono: chi
                  guarda tre foto ne avrebbe scaricate tredici.

                  `priority` non si mette mai qui: la foto che deve partire
                  subito e' quella grande, una sola.
                */}
                {index < miniatureCaricate ? (
                  <Image
                    src={image}
                    alt={`${label} - foto ${index + 1}`}
                    width={224}
                    height={160}
                    loading="lazy"
                    sizes="112px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  /* Il posto c'e' gia': la striscia e' lunga quanto sara',
                     quindi caricando le prossime non si sposta niente sotto
                     il dito. */
                  <span aria-hidden="true" className="block h-full w-full bg-slate-800" />
                )}
              </button>
            ))}
            {/* Quando questa entra nella striscia, arriva il gruppo dopo. */}
            <div ref={sentinellaRef} aria-hidden="true" className="w-px flex-none" />
          </div>
        ) : null}
      </div>

      {isOpen ? (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95 backdrop-blur-sm outline-none"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto di ${label}`}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <p className="text-sm font-semibold text-white">
              {openIndex + 1} / {total}
              {total > 1 ? <span className="ml-2 font-normal text-slate-400 sm:hidden">Scorri per cambiare foto</span> : null}
            </p>
            <button
              type="button"
              onClick={() => setOpenIndex(null)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/15"
              aria-label="Chiudi le foto"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-6"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/*
              Toccare lo sfondo chiude; la foto ferma il tocco e non chiude.

              **Lo sfondo non ha un nome, ed e' una correzione del
              20/09/2026.** Si chiamava anche lui "Chiudi le foto", come il
              bottone in alto: chi usa un lettore di schermo sentiva **due
              comandi con la stessa identica dicitura**, senza nessun modo di
              sapere quale facesse cosa -- e uno dei due e' un rettangolo
              invisibile grande quanto lo schermo.

              Lo sfondo e' una comodita' per chi tocca, non un comando: il
              comando e' il bottone in alto, e si chiama "Chiudi". Quindi
              `aria-hidden` (sparisce dalla voce) e `tabIndex={-1}` (non si
              raggiunge col Tab). Le due cose vanno **insieme**: un elemento
              nascosto alla voce ma raggiungibile con la tastiera sarebbe
              peggio di prima, perche' il fuoco finirebbe su qualcosa che il
              lettore dichiara inesistente.
            */}
            <button
              type="button"
              onClick={closeUnlessSwiping}
              className="absolute inset-0 cursor-zoom-out"
              aria-hidden="true"
              tabIndex={-1}
            />

            {/* A schermo intero si guarda la carrozzeria da vicino, quindi si
                chiede la misura piena.

                "h-full w-full object-contain" e non "w-auto max-w-full": con
                la misura automatica la fotografia si disegnava esattamente
                grande quanto il file arrivato -- 600 pixel dentro un'area da
                1440 -- perche' un limite massimo puo' rimpicciolire, mai
                ingrandire. Adesso occupa lo spazio disponibile e "contain" le
                conserva le proporzioni, senza tagliarla.

                "pointer-events-none" perche' ora la fotografia copre tutta
                l'area, sfondo compreso: senza, il clic per chiudere non
                arriverebbe piu' allo sfondo che sta sotto. */}
            <Image
              src={images[openIndex]}
              alt={`${label} - foto ${openIndex + 1} di ${total}`}
              width={1600}
              height={1200}
              sizes="100vw"
              className="pointer-events-none relative h-full w-full object-contain"
            />

            {total > 1 ? (
              <>
                <button
                  type="button"
                  onClick={showPrevious}
                  className="absolute left-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white transition hover:bg-slate-950 sm:left-4 sm:h-14 sm:w-14"
                  aria-label="Foto precedente"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-2">
                    <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  className="absolute right-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white transition hover:bg-slate-950 sm:right-4 sm:h-14 sm:w-14"
                  aria-label="Foto successiva"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-2">
                    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            ) : null}
          </div>

          {total > 1 ? (
            <div className="flex gap-2 overflow-x-auto px-4 pb-5 sm:px-6">
              {images.map((image, index) => (
                <button
                  key={`viewer-${image}-${index}`}
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border transition ${
                    index === openIndex ? "border-blue-400" : "border-white/15 opacity-60 hover:opacity-100"
                  }`}
                  aria-label={`Vai alla foto ${index + 1}`}
                  aria-current={index === openIndex}
                >
                  <Image src={image} alt="" width={96} height={64} sizes="96px" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
