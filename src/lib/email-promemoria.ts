/**
 * L'email del mattino: cosa scade oggi e cosa c'e' da fare.
 *
 * Chiesta dal titolare il 03/09/2026, con una scelta precisa: **una sola email
 * al giorno**, non una per promemoria. Dopo tre giorni di avvisi separati
 * finiscono nello spam mentale, e poi in quello vero -- oltre a mangiarsi il
 * limite giornaliero di invio.
 *
 * Il testo si costruisce qui e non dentro l'endpoint perche' e' la parte che
 * si puo' provare senza database e senza mandare niente a nessuno.
 */

import { escapeHtml } from "@/lib/escape-html";
import { urgenza } from "@/lib/promemoria";

export type VoceEmail = {
  titolo: string;
  tipo: string;
  scade_il: string;
  /** La vettura o la persona a cui si riferisce, gia' scritta per esteso. */
  riferimento?: string | null;
  note?: string | null;
};

export type ContenutoEmail = {
  oggetto: string;
  html: string;
};

function riga(voce: VoceEmail, adesso: Date) {
  const quanto = urgenza(voce.scade_il, adesso);
  const colore = quanto?.scaduto ? "#b91c1c" : "#0f172a";

  const dettagli = [voce.tipo, voce.riferimento, voce.note]
    .map((pezzo) => String(pezzo ?? "").trim())
    .filter(Boolean)
    .map((pezzo) => escapeHtml(pezzo))
    .join(" · ");

  return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
        <strong style="color:${colore};">${escapeHtml(voce.titolo)}</strong>
        <br />
        <span style="font-size:13px;color:#475569;">${dettagli}</span>
      </td>
      <td style="padding:8px 0 8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;color:${colore};font-size:13px;font-weight:600;">
        ${escapeHtml(quanto?.etichetta ?? voce.scade_il)}
      </td>
    </tr>
  `;
}

/**
 * Costruisce l'email, oppure **niente**.
 *
 * Se non c'e' niente da ricordare non si manda una email che dice "non c'e'
 * niente": e' la strada piu' rapida perche' venga ignorata anche il giorno in
 * cui invece qualcosa c'e'. Torna `null`, e chi chiama non spedisce.
 */
export function costruisciEmailPromemoria(input: {
  nomeConcessionaria: string;
  scaduti: VoceEmail[];
  oggi: VoceEmail[];
  /** Quanti ne arrivano nei prossimi sette giorni: una riga, non un elenco. */
  inArrivo: number;
  indirizzoPiattaforma: string;
  adesso?: Date;
}): ContenutoEmail | null {
  const adesso = input.adesso ?? new Date();
  const quanti = input.scaduti.length + input.oggi.length;

  if (quanti === 0) return null;

  // L'oggetto dice il numero e la cosa piu' urgente: si legge dalla notifica
  // del telefono, senza aprire.
  const oggetto =
    input.scaduti.length > 0
      ? `KeyAuto: ${input.scaduti.length} in ritardo${input.oggi.length > 0 ? ` e ${input.oggi.length} per oggi` : ""}`
      : `KeyAuto: ${input.oggi.length} ${input.oggi.length === 1 ? "cosa" : "cose"} da fare oggi`;

  const sezione = (titolo: string, voci: VoceEmail[], colore: string) =>
    voci.length === 0
      ? ""
      : `
        <p style="margin:20px 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${colore};">
          ${escapeHtml(titolo)} (${voci.length})
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tbody>${voci.map((voce) => riga(voce, adesso)).join("")}</tbody>
        </table>
      `;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:640px;">
      <h2 style="margin:0 0 4px;">Buongiorno${input.nomeConcessionaria ? `, ${escapeHtml(input.nomeConcessionaria)}` : ""}</h2>
      <p style="margin:0 0 12px;color:#475569;">Ecco cosa scade e cosa c'e' da fare.</p>

      ${sezione("In ritardo", input.scaduti, "#b91c1c")}
      ${sezione("Oggi", input.oggi, "#0f172a")}

      ${
        input.inArrivo > 0
          ? `<p style="margin:20px 0 0;font-size:13px;color:#475569;">Nei prossimi sette giorni ce ne sono altri ${input.inArrivo}.</p>`
          : ""
      }

      <p style="margin:24px 0 0;">
        <a href="${input.indirizzoPiattaforma}/promemoria" style="display:inline-block;background:#0f172a;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Apri i promemoria</a>
      </p>

      <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">
        Ricevi questa email una volta al giorno, solo quando c'e' qualcosa da ricordare.
      </p>
    </div>
  `.trim();

  return { oggetto, html };
}
