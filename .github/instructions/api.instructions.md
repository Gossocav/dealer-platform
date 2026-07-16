---
description: "Use when creating or modifying Next.js API routes in src/app/api/** to enforce auth, input validation, security, and least privilege."
applyTo: "src/app/api/**/route.ts"
---
# API Route Security And Contract Rules

## Access Control

- Verifica sempre autenticazione e autorizzazione prima di operazioni sensibili.
- Distingui esplicitamente tra contesto anonimo, utente autenticato e admin.
- Applica il principio del minimo privilegio su query e operazioni.

## Input Safety

- Valida tutti gli input (query, path params, body, headers rilevanti).
- Limita dimensione, formato e cardinalita dei payload.
- Rifiuta payload non validi con errori stabili e coerenti.
- Applica rate limiting quando opportuno (endpoint pubblici, login-like, upload-like, azioni costose).

## Error Handling

- Non esporre stack trace o dettagli interni in risposta API.
- Mantieni messaggi lato client stabili e non sensibili.
- Logga in modo utile senza includere segreti.

## Supabase And Secrets

- Usa `service_role` solo lato server e solo dove strettamente necessario.
- Non importare mai chiavi server o segreti in componenti client.
- Non usare variabili `NEXT_PUBLIC_` per segreti.

## Abuse And Integrity

- Evita open redirect validando URL di destinazione e origin consentite.
- Evita user enumeration con risposte differenziate che rivelano esistenza utenti.
- Mantieni audit log per operazioni sensibili o amministrative.

## API Compatibility

- Non cambiare contratti API (shape risposta, status, campi) senza segnalarlo esplicitamente.
- Se il cambio e necessario, documenta impatto, backward compatibility e piano di migrazione.
