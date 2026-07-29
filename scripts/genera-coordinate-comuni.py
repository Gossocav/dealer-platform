#!/usr/bin/env python3
"""Rigenera src/lib/italian-geo-data.ts.

    python3 scripts/genera-coordinate-comuni.py /percorso/cartella-scaricati

La cartella deve contenere i quattro file elencati in SOURCES, scaricabili con
gli URL indicati. Lo script NON scarica da solo: le fonti sono pubbliche ma la
build non deve dipendere dalla rete.

Cosa fa: calcola il centro geografico di ogni comune italiano dai confini
comunali reali, e lo associa ai nomi che le concessionarie possono scegliere in
fase di registrazione. Fallisce se anche un solo comune resta senza coordinate:
un comune scoperto sparirebbe dalla ricerca per distanza senza dare errore.
"""
import json, re, sys, unicodedata

SOURCES = {
    "limits.geojson": "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_municipalities.geojson",
    "italy_geo.json": "https://raw.githubusercontent.com/MatteoHenryChinaski/Comuni-Italiani-2018-Sql-Json-excel/master/italy_geo.json",
    "italy_cities.json": "https://raw.githubusercontent.com/MatteoHenryChinaski/Comuni-Italiani-2018-Sql-Json-excel/master/italy_cities.json",
    "comuni_cap.json": "https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json",
}

# Comuni rinominati dopo l'ultimo aggiornamento delle mappe. Solo rinomine
# accertate, non somiglianze: un aggancio sbagliato mette una concessionaria
# a chilometri da dove sta davvero.
RENAMES = {("BS", "puegnagodelgarda"): ("BS", "puegnagosulgarda")}


def norm(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def is_number(v):
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def ring_centroid(ring):
    """Centroide d'area, non media dei vertici: su un comune costiero con molti
    punti addensati su un lato la media sposta il centro verso quel lato."""
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(a) < 1e-12:
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring), 0.0
    a *= 0.5
    return cx / (6 * a), cy / (6 * a), abs(a)


def centroid(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    best = None
    for poly in polys:  # il poligono maggiore: le isole minori non spostano il centro
        cx, cy, area = ring_centroid(poly[0])
        if best is None or area > best[2]:
            best = (cx, cy, area)
    return best[0], best[1]


def main(folder):
    limits = json.load(open(f"{folder}/limits.geojson"))

    primary, alias = {}, {}
    for feature in limits["features"]:
        props = feature["properties"]
        province = props["prov_acr"].upper()
        lng, lat = centroid(feature["geometry"])
        primary[(province, norm(props["name"]))] = (round(lat, 4), round(lng, 4))

        # Alias: nomi bilingui dell'Alto Adige ("Bolzano/Bozen") e comuni nati
        # da fusione ("Lu e Cuccaro Monferrato", "Moransengo-Tonengo"), che gli
        # elenchi piu' vecchi conoscono ancora con il nome di una sola parte.
        for chunk in props["name"].split("/"):
            for part in [chunk] + re.split(r"\s+e\s+|-", chunk):
                part = part.strip()
                if part and (province, norm(part)) not in primary:
                    alias.setdefault((province, norm(part)), (round(lat, 4), round(lng, 4)))

    # Ripiego per i comuni soppressi, spariti dalle mappe attuali ma ancora
    # negli elenchi da cui si sceglie.
    geo = {g["istat"]: g for g in json.load(open(f"{folder}/italy_geo.json"))
           if g.get("istat") and is_number(g.get("lat")) and is_number(g.get("lng"))}
    cities = {c["istat"]: c for c in json.load(open(f"{folder}/italy_cities.json")) if c.get("istat")}
    legacy = {}
    for istat, g in geo.items():
        city = cities.get(istat)
        if city:
            legacy[(city["provincia"].upper(), norm(g["comune"]))] = (round(float(g["lat"]), 4), round(float(g["lng"]), 4))

    def lookup(province, name):
        key = RENAMES.get((province, norm(name)), (province, norm(name)))
        return primary.get(key) or alias.get(key) or legacy.get(key)

    source = open("src/lib/italian-locations.ts", encoding="utf8").read()
    block = source[source.index("ITALIAN_CITIES_BY_PROVINCE"):]
    selectable = {}
    for match in re.finditer(r'^\s{2}([A-Z]{2}):\s*\[(.*?)\],\s*$', block, re.M | re.S):
        selectable[match.group(1)] = re.findall(r'"((?:[^"\\]|\\.)*)"', match.group(2))

    places, missing = {}, []
    for province, names in sorted(selectable.items()):
        rows = []
        for name in names:
            hit = lookup(province, name)
            if hit is None:
                missing.append(f"{province} {name}")
            else:
                rows.append((name, hit[0], hit[1]))
        places[province] = rows

    if missing:
        raise SystemExit("Comuni senza coordinate, il file NON e' stato scritto:\n  " + "\n  ".join(missing))

    caps = {}
    for entry in json.load(open(f"{folder}/comuni_cap.json")):
        province = entry["sigla"].upper()
        if lookup(province, entry["nome"]) is None:
            continue
        for cap in entry.get("cap", []):
            caps.setdefault(cap, f"{province}|{entry['nome']}")

    out = [HEADER]
    out.append("const COMUNI_BY_PROVINCE: Record<string, ReadonlyArray<readonly [string, number, number]>> = {")
    for province, rows in places.items():
        body = ",".join(f'["{n}",{lat},{lng}]' for n, lat, lng in rows)
        out.append(f"  {province}: [{body}],")
    out.append("};")
    out.append("")
    out.append("const CAP_TO_PLACE: Record<string, string> = {")
    out.append(",".join(f'"{k}":"{v}"' for k, v in sorted(caps.items())))
    out.append("};")
    out.append("")
    out.append("export { COMUNI_BY_PROVINCE, CAP_TO_PLACE };")

    open("src/lib/italian-geo-data.ts", "w", encoding="utf8").write("\n".join(out) + "\n")
    total = sum(len(v) for v in places.values())
    print(f"scritto src/lib/italian-geo-data.ts — {total} comuni, {len(caps)} CAP")


HEADER = '''// GENERATO da scripts/genera-coordinate-comuni.py. Non modificare a mano.
//
// Coordinate di ogni comune selezionabile in italian-locations.ts, piu'
// l'indice dei CAP. Servono alla ricerca per distanza: senza un punto sulla
// mappa "entro 50 km da Milano" non e' calcolabile.
//
// Il centro di ogni comune e' il centroide d'area del suo confine reale, non
// una media di vertici e non il capoluogo di provincia.
//
// La copertura e' totale per costruzione: il generatore si rifiuta di scrivere
// il file se anche un solo comune resta scoperto. Un comune senza coordinate
// non darebbe errore, sparirebbe e basta da ogni ricerca per distanza.
//
// PESANTE E SOLO LATO SERVER: non importarlo da un componente "use client",
// finirebbe nel browser di ogni visitatore.
'''

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
