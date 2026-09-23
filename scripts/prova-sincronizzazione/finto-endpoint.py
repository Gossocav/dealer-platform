"""Finto endpoint di sincronizzazione, per provare il workflow senza toccare
   ne' la piattaforma vera ne' i siti delle concessionarie.

   FALLISCI="3,4"     -> a quei giri chiude la connessione senza rispondere
                         (curl esce 52: nessuna risposta HTTP)
   FALLISCI=__500__   -> risponde sempre 500: e' il "difetto nostro"
   FALLISCI=__MUTO__  -> dal terzo giro accetta e non risponde mai (curl 28)
   FALLISCI=__NONJSON__ -> dal terzo giro risponde 200 con dell'HTML
   FALLISCI=__SENZA_RISCRITTE__ -> tre siti, e nessuno dichiara un conteggio
                         valido: uno omette la chiave, uno manda `true`,
                         uno manda -1 e "3"
   FALLISCI=__UN_SITO_A_ZERO__  -> tre siti, tutti dichiarano, uno a zero
   FALLISCI=__NON_PARTO__ -> esce subito senza mettersi in ascolto: serve a
                         far vedere rosso il confronto d'identita' della
                         sonda, che altrimenti non sarebbe mai stato visto
                         rispondere
   FALLISCI=__403__     -> risponde sempre 403: la piattaforma rifiuta
   FALLISCI=__FERMO24H__ -> risponde bene, ma dichiara un sito fermo da tre
                            giorni in `sitiDaSegnalare`
   FALLISCI=__LENTO__   -> risponde bene, ma ci mette quattro secondi: serve
                         a far scattare l'orologio del ciclo senza che cada
                         nessuna chiamata, cosi' la prova separa "fermato dal
                         tempo" da "fermato dal tetto delle chiamate"

   Gli ultimi due esistono per una ragione sola, e sono una coppia: i due
   numeri che il giro dichiara nel riepilogo non devono avere un valore
   predefinito, **e uno zero dichiarato non e' un valore mancante**. Sono due
   direzioni dello stesso confine, e si distinguono a valle solo se il
   lettore le distingue: con un ripiego a zero l'assente diventa zero e il
   primo caso passerebbe per la ragione sbagliata; trattando lo zero come
   non dichiarato, un sito senza novita' marchierebbe illeggibile un giro
   sano. Una misura che non e' mai stata vista rispondere in tutti e due i
   modi non ha ancora dimostrato di saper rispondere.
"""
import http.server
import json
import os
import sys
import time

GREZZO = os.environ.get("FALLISCI", "")
MODO = GREZZO if GREZZO.startswith("__") else ""
FALLISCI = {int(x) for x in GREZZO.split(",") if x.strip().isdigit()}
stato = {"n": 0}

if MODO == "__NON_PARTO__":
    # Non un errore: e' il caso di prova per cui il banco deve accorgersi che
    # sulla porta non risponde **il suo**. Senza, quel confronto sarebbe una
    # promessa scritta in un commento.
    sys.exit(1)


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        # **La sonda di prontezza non deve contare come un giro.** La prima
        # versione del banco sondava con una POST, e il finto endpoint conta
        # ogni POST: il giro 1 dello script diventava il giro 2 del server, e
        # il caso "cade l'ultima chiamata" faceva cadere la diciannovesima.
        # Il controllo sul numero di cadute non l'ha preso -- ne attendeva
        # una, ed era una -- perche' verificava la **quantita'**, non
        # **quale**. La sonda usa GET, che qui non conta niente.
        #
        # **E la sonda dichiara chi sono e come sono stato avviato**, perche'
        # "qualcuno risponde" e' l'unica informazione che non serve. Un finto
        # endpoint rimasto da una prova precedente risponde alla sonda
        # benissimo -- solo nel modo sbagliato -- e il caso girerebbe contro
        # di lui uscendo verde per la risposta di un altro. Il PID e'
        # l'identita' esatta: il banco sa quale processo ha avviato e
        # confronta. Il modo dice che e' stato avviato **come chiesto**, e
        # prende l'errore in cui il banco stesso passa la variabile sbagliata.
        corpo = json.dumps({"fallisci": GREZZO, "pid": os.getpid()}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_POST(self):
        stato["n"] += 1
        n = stato["n"]
        try:
            self.rfile.read(int(self.headers.get("content-length", 0) or 0))
        except Exception:
            pass

        if MODO == "__500__":
            corpo = b'{"errore":"il database non risponde"}'
            self.send_response(500)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
            return

        # **Il rifiuto della piattaforma.** E' una delle cinque vie d'uscita
        # del passo, e fino al 22/09/2026 non l'aveva mai esercitata nessuno:
        # quindici casi ne provavano tre. Un 403 esce molto piu' su di ogni
        # contatore -- non tocca `perse`, ne' `di_fila`, ne' la soglia -- ed
        # e' proprio per questo che va provato a parte.
        if MODO == "__403__":
            corpo = b'{"errore":"CRON_SECRET sbagliato"}'
            self.send_response(403)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
            return

        if MODO == "__NONJSON__" and n > 2:
            corpo = b"<html><body>502 Bad Gateway</body></html>"
            self.send_response(200)
            self.send_header("content-type", "text/html")
            self.send_header("content-length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
            return

        if MODO == "__MUTO__" and n > 2:
            time.sleep(400)
            return

        if MODO == "__LENTO__":
            # Quattro secondi: sotto i 180 di --max-time, quindi la chiamata
            # riesce e non cade niente. Con la pausa di cinque secondi fra un
            # giro e l'altro fanno nove secondi a giro, e un tetto di
            # venticinque secondi scatta al terzo.
            time.sleep(4)

        if n in FALLISCI:
            self.close_connection = True
            try:
                self.connection.close()
            except Exception:
                pass
            return

        def sito(nome, rilette, riscritte):
            # `riscritte=None` vuol dire: la chiave non c'e' proprio.
            voce = {
                "sito": nome,
                "ultimaSincronizzazione": "2026-09-21T12:00:00Z",
                "schede": 150, "schedeFresche": 150, "nascoste": 0,
                "ripristinate": 0, "importate": 0, "nota": None,
                "rilette": rilette,
            }
            if riscritte is not None:
                voce["riscritte"] = riscritte
            return voce

        # **Un sito fermo da piu' di 24 ore.** La guardia che se ne accorge
        # e' nata dall'incidente di Autogepy -- quattro giorni con zero
        # schede aggiornate e il lavoro verde -- ed era l'unica via d'uscita
        # del passo che **nessuno aveva mai visto funzionare**: la protezione
        # costruita dopo un guasto e' quella che nessuno prova, perche' il
        # caso che la giustifica sembra gia' capito.
        #
        # Il rosso lo decide `sitiDaSegnalare`, non `sitiInRitardo`: chi e'
        # in ritardo si legge nel riepilogo, chi va segnalato colora.
        if MODO == "__FERMO24H__":
            corpo = json.dumps({
                "ancoraDaFare": False,
                "cursore": None,
                "esiti": [sito("autogepy.it", 10, 3)],
                "sitiInRitardo": [{"sito": "autogepy.it", "ultimaSincronizzazione": "2026-09-18T12:00:00Z",
                                   "schede": 150, "schedeFresche": 0}],
                "sitiDaSegnalare": [{"sito": "autogepy.it", "ultimaSincronizzazione": "2026-09-18T12:00:00Z"}],
            }).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
            return

        if MODO == "__SENZA_RISCRITTE__":
            # Quattro modi di non dichiarare un conteggio, e sono una
            # famiglia: la chiave che manca, un booleano, un negativo, una
            # stringa che sembra un numero. Il lettore accetta solo interi
            # veri non negativi; gli altri arrivano dalla stessa strada del
            # primo e devono uscire dalla stessa porta, nominati.
            esiti = [sito("autogepy.it", 10, None),
                     sito("delorenzi.it", 5, True),
                     sito("ponginibbi.it", -1, "3")]
        elif MODO == "__UN_SITO_A_ZERO__":
            # Il secondo e' la forma vera della produzione (riletto, niente
            # cambiato); il terzo non aveva novita'. Tutti e due valgono zero
            # da qualche parte, e tutti e due sono dati.
            esiti = [sito("autogepy.it", 10, 3),
                     sito("delorenzi.it", 5, 0),
                     sito("ponginibbi.it", 0, 0)]
        else:
            esiti = [sito("autogepy.it", 10, 3)]

        corpo = json.dumps({
            "ancoraDaFare": True,
            "cursore": {"dopo": "autogepy.it", "saltate": {}},
            "esiti": esiti,
            "sitiInRitardo": [],
            "sitiDaSegnalare": [],
        }).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)


http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
