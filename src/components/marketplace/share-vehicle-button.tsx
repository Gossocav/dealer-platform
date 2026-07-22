"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ShareVehicleButtonProps = {
  title: string;
  text: string;
  url: string;
};

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export default function ShareVehicleButton({ title, text, url }: ShareVehicleButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${text}\n${url}`);

  const links = useMemo(
    () => [
      { label: "WhatsApp", href: `https://wa.me/?text=${encodedText}` },
      { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
      { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
      { label: "Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(text)}` },
      { label: "Email", href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}` },
    ],
    [encodedText, encodedUrl, text, title]
  );

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const handleShareClick = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && isMobileDevice()) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // Se l'utente annulla o share fallisce, apri il menu fallback.
      }
    }

    setOpen((prev) => !prev);
  };

  const handleCopyLink = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopied(true);
    setOpen(false);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          void handleShareClick();
        }}
        className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
      >
        Condividi
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]">
          {links.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              {item.label}
            </a>
          ))}
          <button
            type="button"
            onClick={() => {
              void handleCopyLink();
            }}
            className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            Copia link
          </button>
        </div>
      ) : null}

      {copied ? <p className="absolute right-0 mt-2 text-xs font-semibold text-cyan-300">Link copiato</p> : null}
    </div>
  );
}
