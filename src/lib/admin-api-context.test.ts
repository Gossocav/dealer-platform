import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getUserMock: vi.fn(),
  profileMaybeSingleMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

import { contestoAmministratore } from "./admin-api-context";

/**
 * La serratura del pannello amministrativo.
 *
 * **Quale difetto impedisce.** Fino al 06/09/2026 questo controllo era
 * ricopiato a mano dentro sei endpoint, ~70 righe l'uno, e questo modulo --
 * scritto per unificarli -- non aveva **nessun test**. Le sei copie ne
 * avevano, ognuna sulle proprie: il giorno che ci si spostava sopra, la
 * parte piu' delicata della piattaforma sarebbe rimasta l'unica non coperta.
 *
 * Ogni prova qui sotto e' un modo di entrare che deve restare chiuso. Non
 * verificano che il permesso venga dato -- quello si vede subito, perche' il
 * pannello non funzionerebbe -- ma che venga **negato** nei casi in cui un
 * errore lascerebbe passare qualcuno: e' il difetto che non si vede finche'
 * non e' tardi.
 */

function richiesta(intestazioni?: Record<string, string>) {
  return new Request("http://localhost/api/admin/qualcosa", { headers: intestazioni ?? {} });
}

function finto() {
  return {
    auth: { getUser: mocks.getUserMock },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.profileMaybeSingleMock })) })),
      insert: mocks.insertMock,
    })),
  };
}

/** Lo storico si scrive senza aspettarlo: qui si lascia girare la coda. */
const lasciaScrivere = () => new Promise((r) => setTimeout(r, 0));

function richiestaConMetodo(metodo: string, intestazioni?: Record<string, string>) {
  return new Request("http://localhost/api/admin/dealers", { method: metodo, headers: intestazioni ?? {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chiave-di-prova";
  mocks.createClientMock.mockReturnValue(finto());
  mocks.profileMaybeSingleMock.mockResolvedValue({ data: null, error: null });
  mocks.insertMock.mockResolvedValue({ error: null });
});

describe("chi NON deve entrare nel pannello amministrativo", () => {
  it("chi non porta nessun lasciapassare", async () => {
    const esito = await contestoAmministratore(richiesta());

    expect(esito.errore?.status).toBe(401);
    expect(esito.supabaseAdmin).toBeNull();
    // Se la chiave di servizio uscisse comunque, un errore piu' avanti
    // potrebbe usarla lo stesso: qui non deve proprio esistere.
    expect(esito.chiamanteId).toBeNull();
  });

  it("chi scrive un'intestazione che non e' un Bearer", async () => {
    const esito = await contestoAmministratore(richiesta({ authorization: "Basic abc" }));

    expect(esito.errore?.status).toBe(401);
    expect(esito.supabaseAdmin).toBeNull();
  });

  it("chi manda un Bearer vuoto", async () => {
    const esito = await contestoAmministratore(richiesta({ authorization: "Bearer    " }));

    expect(esito.errore?.status).toBe(401);
    expect(esito.supabaseAdmin).toBeNull();
  });

  it("chi porta un token che Supabase non riconosce", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "jwt scaduto" } });

    const esito = await contestoAmministratore(richiesta({ authorization: "Bearer inventato" }));

    expect(esito.errore?.status).toBe(401);
    expect(esito.supabaseAdmin).toBeNull();
  });

  it("un concessionario vero, con la sessione valida, ma che amministratore non e'", async () => {
    // La prova che conta piu' di tutte: non un estraneo, ma qualcuno che nel
    // sistema c'e' gia' e prova a chiamare gli endpoint del pannello.
    mocks.getUserMock.mockResolvedValue({
      data: { user: { id: "u-1", app_metadata: { role: "dealer" }, user_metadata: {} } },
      error: null,
    });
    mocks.profileMaybeSingleMock.mockResolvedValue({ data: { role: "dealer" }, error: null });

    const esito = await contestoAmministratore(richiesta({ authorization: "Bearer valido" }));

    expect(esito.errore?.status).toBe(403);
    expect(esito.supabaseAdmin).toBeNull();
  });

  it("chi si e' scritto 'admin' nei propri metadati", async () => {
    // user_metadata lo puo' cambiare l'utente stesso con una chiamata a
    // supabase.auth.updateUser(). Se il ruolo si leggesse da li', chiunque
    // abbia un account si nominerebbe amministratore da solo. Si legge da
    // app_metadata, che l'utente non puo' toccare.
    mocks.getUserMock.mockResolvedValue({
      data: { user: { id: "u-2", app_metadata: { role: "dealer" }, user_metadata: { role: "admin" } } },
      error: null,
    });
    mocks.profileMaybeSingleMock.mockResolvedValue({ data: { role: "dealer" }, error: null });

    const esito = await contestoAmministratore(richiesta({ authorization: "Bearer valido" }));

    expect(esito.errore?.status, "il ruolo e' stato letto da user_metadata").toBe(403);
  });

  it("quando la lettura del ruolo va in errore si chiude, non si apre", async () => {
    mocks.getUserMock.mockResolvedValue({
      data: { user: { id: "u-3", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mocks.profileMaybeSingleMock.mockResolvedValue({ data: null, error: { message: "database irraggiungibile" } });

    const esito = await contestoAmministratore(richiesta({ authorization: "Bearer valido" }));

    expect(esito.errore?.status).toBe(500);
    expect(esito.supabaseAdmin).toBeNull();
  });

  it("se al server mancano le variabili d'ambiente non lascia passare nessuno", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const esito = await contestoAmministratore(richiesta({ authorization: "Bearer valido" }));

    expect(esito.errore?.status).toBe(500);
    expect(esito.supabaseAdmin).toBeNull();
  });
});

describe("chi deve entrare", () => {
  it("l'amministratore dichiarato in app_metadata, senza nemmeno leggere il profilo", async () => {
    mocks.getUserMock.mockResolvedValue({
      data: { user: { id: "admin-1", app_metadata: { role: "admin" }, user_metadata: {} } },
      error: null,
    });

    const esito = await contestoAmministratore(richiesta({ authorization: "Bearer valido" }));

    expect(esito.errore).toBeNull();
    expect(esito.supabaseAdmin).not.toBeNull();
    expect(esito.chiamanteId).toBe("admin-1");
    expect(mocks.profileMaybeSingleMock, "ha interrogato il profilo senza bisogno").not.toHaveBeenCalled();
  });

  it("il titolare della piattaforma", async () => {
    mocks.getUserMock.mockResolvedValue({
      data: { user: { id: "capo", app_metadata: { role: "platform_owner" }, user_metadata: {} } },
      error: null,
    });

    expect((await contestoAmministratore(richiesta({ authorization: "Bearer valido" }))).errore).toBeNull();
  });

  it("l'amministratore che ha il ruolo solo sul profilo (il ripiego)", async () => {
    mocks.getUserMock.mockResolvedValue({
      data: { user: { id: "admin-2", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mocks.profileMaybeSingleMock.mockResolvedValue({ data: { role: "admin" }, error: null });

    const esito = await contestoAmministratore(richiesta({ authorization: "Bearer valido" }));

    expect(esito.errore).toBeNull();
    expect(esito.chiamanteId).toBe("admin-2");
  });
});

/**
 * Lo storico di chi bussa al pannello.
 *
 * **Quale difetto colma.** Trovato il 06/09/2026: `audit_logs` registrava le
 * operazioni sulle demo e sui veicoli, ma **niente** sul pannello
 * amministrativo. Se qualcuno provasse a raggiungerlo -- riuscendoci o no --
 * non ne restava traccia da nessuna parte: lo si sarebbe scoperto per caso, o
 * mai.
 */
describe("lo storico del pannello amministrativo", () => {
  const dealer = { id: "u-dealer", app_metadata: { role: "dealer" }, user_metadata: {} };
  const admin = { id: "admin-1", app_metadata: { role: "admin" }, user_metadata: {} };

  it("un concessionario che bussa lascia una traccia", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: dealer }, error: null });
    mocks.profileMaybeSingleMock.mockResolvedValue({ data: { role: "dealer" }, error: null });

    const esito = await contestoAmministratore(richiestaConMetodo("GET", { authorization: "Bearer valido" }));
    await lasciaScrivere();

    expect(esito.errore?.status).toBe(403);
    expect(mocks.insertMock, "il tentativo respinto non e' stato registrato").toHaveBeenCalledTimes(1);

    const riga = mocks.insertMock.mock.calls[0][0];
    expect(riga.action).toBe("admin.accesso_negato");
    expect(riga.actor_profile_id).toBe("u-dealer");
    expect(riga.metadata_json.percorso).toBe("/api/admin/dealers");
  });

  it("un amministratore che legge e basta non riempie lo storico", async () => {
    // Il pannello fa parecchie letture a ogni schermata aperta: registrarle
    // renderebbe lo storico illeggibile, ed e' cosi' che uno storico smette
    // di essere guardato.
    mocks.getUserMock.mockResolvedValue({ data: { user: admin }, error: null });

    await contestoAmministratore(richiestaConMetodo("GET", { authorization: "Bearer valido" }));
    await lasciaScrivere();

    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it("un amministratore che cambia qualcosa lascia una traccia", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: admin }, error: null });

    for (const metodo of ["POST", "PATCH", "DELETE"]) {
      mocks.insertMock.mockClear();
      await contestoAmministratore(richiestaConMetodo(metodo, { authorization: "Bearer valido" }));
      await lasciaScrivere();

      expect(mocks.insertMock, `${metodo} non e' stato registrato`).toHaveBeenCalledTimes(1);
      expect(mocks.insertMock.mock.calls[0][0].action).toBe("admin.azione");
      expect(mocks.insertMock.mock.calls[0][0].metadata_json.metodo).toBe(metodo);
    }
  });

  it("se lo storico non si scrive, la serratura risponde lo stesso", async () => {
    // E' la prova che conta piu' delle altre. Un errore nello storico non
    // deve poter chiudere il pannello a un amministratore, ne' -- peggio --
    // trasformare un rifiuto in un errore diverso, che direbbe a chi bussa
    // qualcosa sul funzionamento interno.
    mocks.insertMock.mockRejectedValue(new Error("database irraggiungibile"));
    mocks.getUserMock.mockResolvedValue({ data: { user: admin }, error: null });

    const esito = await contestoAmministratore(richiestaConMetodo("POST", { authorization: "Bearer valido" }));
    await lasciaScrivere();

    expect(esito.errore, "un errore nello storico ha chiuso il pannello").toBeNull();
    expect(esito.chiamanteId).toBe("admin-1");
  });

  it("e un rifiuto resta un rifiuto anche se lo storico fallisce", async () => {
    mocks.insertMock.mockRejectedValue(new Error("database irraggiungibile"));
    mocks.getUserMock.mockResolvedValue({ data: { user: dealer }, error: null });
    mocks.profileMaybeSingleMock.mockResolvedValue({ data: { role: "dealer" }, error: null });

    const esito = await contestoAmministratore(richiestaConMetodo("POST", { authorization: "Bearer valido" }));
    await lasciaScrivere();

    expect(esito.errore?.status).toBe(403);
  });

  it("un account senza profilo viene registrato lo stesso, senza il collegamento", async () => {
    // `actor_profile_id` punta a `profiles`. In questo progetto un account
    // puo' restare senza profilo, e la chiave esterna farebbe fallire
    // l'inserimento proprio nel caso piu' sospetto: qualcuno che non
    // dovrebbe essere li'. Meglio una riga senza collegamento che nessuna.
    mocks.insertMock
      .mockResolvedValueOnce({ error: { message: 'violates foreign key constraint "audit_logs_actor_profile_id_fkey"' } })
      .mockResolvedValueOnce({ error: null });
    mocks.getUserMock.mockResolvedValue({ data: { user: dealer }, error: null });
    mocks.profileMaybeSingleMock.mockResolvedValue({ data: { role: "dealer" }, error: null });

    await contestoAmministratore(richiestaConMetodo("GET", { authorization: "Bearer valido" }));
    await lasciaScrivere();

    expect(mocks.insertMock).toHaveBeenCalledTimes(2);
    const ripiego = mocks.insertMock.mock.calls[1][0];
    expect(ripiego.actor_profile_id).toBeNull();
    expect(ripiego.metadata_json.chiamante, "l'identita' e' andata persa").toBe("u-dealer");
  });
});
