import { ExternalLink, Globe, KeyRound } from "lucide-react";
import { formatWebsiteForDisplay, resolveClickableWebsite } from "@/lib/website-url";

/**
 * Dove trovare la concessionaria fuori da KeyAuto.
 *
 * Chiesto dal titolare il 03/09/2026, e nato da una domanda sul noleggio: molte
 * concessionarie hanno un sito dedicato -- `noleggio.autogepy.it` -- che dalla
 * loro pagina qui non era raggiungibile.
 *
 * Nel farlo si e' chiuso anche quello che era rimasto a meta': sito web,
 * Facebook, Instagram e LinkedIn si raccolgono nelle Impostazioni dal
 * 02/07/2026 e **non comparivano da nessuna parte**. Nessun concessionario li
 * aveva compilati, il che e' logico: si smette di riempire i campi che non
 * producono niente.
 *
 * **Il noleggio sta davanti agli altri, ed e' l'unico pulsante pieno.** E' una
 * cosa che si vende, non un recapito: chi guarda le auto di una concessionaria
 * e sta pensando "forse invece la noleggio" deve vederlo senza cercarlo.
 *
 * **Ogni indirizzo si ricontrolla prima di diventare un pulsante.** Nel
 * database puo' esserci ancora qualcosa che non e' un indirizzo -- i campi sono
 * a testo libero da luglio -- e un pulsante che porta su una pagina morta e'
 * peggio di un pulsante assente.
 */
export function CollegamentiConcessionaria({
  rentalUrl,
  website,
  facebook,
  instagram,
  linkedin,
}: {
  rentalUrl: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
}) {
  const noleggio = resolveClickableWebsite(rentalUrl);
  const sito = resolveClickableWebsite(website);

  // Il nome scritto e non l'icona: questa versione della libreria non ha piu'
  // i marchi, e "Facebook" scritto si legge meglio di un'icona generica che
  // non si sa dove porti.
  const social = [
    { href: resolveClickableWebsite(facebook), nome: "Facebook" },
    { href: resolveClickableWebsite(instagram), nome: "Instagram" },
    { href: resolveClickableWebsite(linkedin), nome: "LinkedIn" },
  ].filter((voce): voce is { href: string; nome: string } => Boolean(voce.href));

  // Senza nemmeno un indirizzo valido il riquadro non si disegna: una sezione
  // vuota sotto un'intestazione sembra un guasto.
  if (!noleggio && !sito && social.length === 0) return null;

  return (
    <section className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Dove trovarci</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {noleggio ? (
          <a
            href={noleggio}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
          >
            <KeyRound className="h-4 w-4" />
            Le nostre offerte di noleggio
          </a>
        ) : null}

        {sito ? (
          <a
            href={sito}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            <Globe className="h-4 w-4 flex-none" />
            <span className="truncate">{formatWebsiteForDisplay(website) ?? "Sito web"}</span>
            <ExternalLink className="h-3.5 w-3.5 flex-none opacity-60" />
          </a>
        ) : null}

        {social.map(({ href, nome }) => (
          <a
            key={nome}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            {nome}
            <ExternalLink className="h-3.5 w-3.5 flex-none opacity-60" />
          </a>
        ))}
      </div>
    </section>
  );
}
