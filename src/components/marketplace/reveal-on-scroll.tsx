"use client";

import { useEffect, useRef, useState } from "react";

type RevealOnScrollProps = {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Adds the .marketplace-reveal fade/slide-in defined in globals.css once the
 * element enters the viewport. Server-rendered content stays fully visible
 * until hydration flips `ready`, so there is no flash of hidden content if
 * JS is slow to load.
 */
export function RevealOnScroll({ children, delayMs = 0, className, style }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setReady(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${ready ? "marketplace-reveal" : ""} ${className ?? ""}`}
      style={{ ...style, "--reveal-delay": `${delayMs}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
