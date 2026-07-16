# Dealer Platform - GitHub Copilot Instructions

Queste istruzioni sono permanenti per il repository e sono subordinate a `AGENTS.md`, che resta la fonte prioritaria.

## Regole Generali

- Rispetta integralmente `AGENTS.md` prima di qualunque modifica.
- Lavora solo sul task richiesto, senza ampliare autonomamente lo scope.
- Preserva tutte le modifiche locali non correlate e non alterarle.
- Proponi sempre modifiche minime, puntuali e reversibili.
- Non inserire segreti, token o credenziali nel codice.
- Non stampare segreti nei log.
- Usa solo variabili d'ambiente gia previste dal progetto.

## Flusso Obbligatorio

1. Analisi:
- Leggi i file coinvolti prima di modificare.
- Verifica lo stato del worktree e confronta con `HEAD` i file da toccare quando esistono modifiche locali.
- Se il task richiede cambi non previsti o extra-scope, fermati e riferisci.

2. Modifica minima:
- Applica la minima modifica necessaria.
- Evita sostituzioni complete di file quando basta una modifica puntuale.
- Non cancellare codice o modifiche locali non correlate.

3. Verifica diff:
- Controlla il diff dei file toccati e segnala eventuali rischi o regressioni.
- Evidenzia chiaramente i file modificati.

4. Test e validazione:
- Esegui solo i controlli coerenti con il task e i vincoli ricevuti.
- Non dichiarare concluso un task senza riportare verifiche eseguite e verifiche non eseguite con motivazione.

## Divieti Operativi

- Vietato eseguire commit, push, merge, reset, checkout, restore o rebase senza autorizzazione esplicita.
- Vietate operazioni distruttive su file, dati, history o worktree.
- Vietato applicare migration remote.
- Vietato eseguire `supabase db push`.
- Vietato modificare configurazioni Vercel o Supabase remote.

## Escalation Obbligatoria

- Se il task richiede modifiche non previste, impatti architetturali non richiesti o azioni bloccate da policy, interrompi l'esecuzione e fornisci un report chiaro con:
- motivo del blocco;
- opzioni minime possibili;
- rischi tecnici.
