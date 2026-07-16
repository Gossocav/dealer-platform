---
description: "Use when modifying frontend files in src/app/** and src/components/** (excluding API route behavior) to preserve UX, accessibility, typing, and security boundaries."
applyTo:
  - "src/app/**"
  - "src/components/**"
---
# Frontend Guardrails

Nota: Le API route in `src/app/api/**` sono governate dalle istruzioni API dedicate.

## Scope And UX Stability

- Non modificare UI o UX non richieste dal task.
- Non cambiare route o navigazione non richieste.
- Preserva stati loading, empty ed error.

## Accessibility And Responsiveness

- Mantieni accessibilita (semantica, focus, label, contrasto) e comportamento responsive.
- Evita regressioni su desktop e mobile.

## Client/Server Boundaries

- Distingui correttamente Server Components e Client Components.
- Aggiungi `"use client"` solo quando necessario.
- Non esporre variabili server-side in codice client.
- Non usare `service_role` nel frontend.

## Type Safety And Quality

- Mantieni tipi TypeScript rigorosi.
- Non silenziare errori con `any`, `ts-ignore` o disabilitazioni lint senza motivazione esplicita.
- Evita nuove dipendenze se non strettamente necessarie.

## Security Hygiene

- Non inserire segreti, token o credenziali nel codice.
- Non stampare segreti nei log.
- Usa variabili d'ambiente gia previste dal progetto.
