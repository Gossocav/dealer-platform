---
description: "Use when working on Supabase schema, migrations, grants, RLS, SQL functions/triggers, or server files that use Supabase clients."
applyTo:
  - "supabase/**"
  - "src/lib/**supabase**"
  - "src/app/api/**/route.ts"
  - "src/proxy.ts"
---
# Supabase Safety And Least Privilege Rules

## Migration Policy

- Nessuna migration distruttiva senza autorizzazione esplicita.
- Vietati `DROP`, `TRUNCATE` e cancellazioni massive salvo richiesta esplicita.
- Preferisci migration additive, forward-only e reversibili quando possibile.
- Non modificare migration gia applicate in produzione senza autorizzazione.
- Non eseguire migration remote.
- Non eseguire `supabase db push`.

## Security Model

- Rispetta sempre RLS e isolamento tenant.
- Non presumere che il bypass RLS sostituisca i privilegi SQL (ACL e grant restano necessari).
- Applica least privilege ai grant e all'uso delle funzioni security definer.
- `service_role` esclusivamente server-side.
- Mai usare `NEXT_PUBLIC_` per segreti.

## Change Discipline

- Segnala esplicitamente ogni modifica a schema, policy, trigger, funzione o grant.
- Verifica impatto su compatibilita locale, staging e produzione prima di concludere.
- Evita cambi non richiesti su oggetti DB non correlati al task.

## Operational Constraints

- Non modificare configurazioni Supabase remote.
- Non esporre segreti o token in codice, migration, script o log.
