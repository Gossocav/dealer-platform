"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VehicleGalleryProps = {
  images: string[];
  label: string;
};

const THUMBNAIL_LIMIT = 8;

// Sotto questa distanza il gesto e' un tocco un po' mosso, non uno scorrimento:
// cambiare foto a ogni micro-movimento del dito renderebbe impossibile
// chiudere la galleria toccando lo sfondo.
const SWIPE_MIN_DISTANCE = 48;

export default function VehicleGallery({ images, label }: VehicleGalleryProps) {
  // null = viewer closed; otherwise the index being shown.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
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

  const coverUrl = images[0] ?? null;
  const hiddenThumbnailCount = Math.max(0, total - THUMBNAIL_LIMIT);

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt={label} decoding="async" className="h-full w-full max-w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
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
          <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {images.slice(0, THUMBNAIL_LIMIT).map((image, index) => {
              const isLastVisible = index === THUMBNAIL_LIMIT - 1 && hiddenThumbnailCount > 0;

              return (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  className="relative max-w-full cursor-zoom-in overflow-hidden rounded-2xl border border-white/10 bg-slate-800 transition hover:border-blue-400/40"
                  aria-label={`Apri foto ${index + 1} di ${total}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt={`${label} - foto ${index + 1}`} loading="lazy" decoding="async" className="h-32 w-full max-w-full object-cover" />
                  {isLastVisible ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-950/65 text-sm font-bold text-white">
                      +{hiddenThumbnailCount} foto
                    </span>
                  ) : null}
                </button>
              );
            })}
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
            {/* Backdrop click closes; the image itself stops the propagation. */}
            <button
              type="button"
              onClick={closeUnlessSwiping}
              className="absolute inset-0 cursor-zoom-out"
              aria-label="Chiudi le foto"
              tabIndex={-1}
            />

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[openIndex]}
              alt={`${label} - foto ${openIndex + 1} di ${total}`}
              decoding="async"
              className="relative max-h-full max-w-full object-contain"
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
