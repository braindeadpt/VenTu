#!/usr/bin/env python3
"""
bake-land-clip.py — polígonos de terra para o recorte VECTORIAL dos campos
«Vento» e «Ondulação» do /mapa (src/lib/landClip.ts).

O campo é desenhado no canvas e a terra é depois «apagada» com estes
polígonos projectados para o ecrã (Canvas2D com anti-aliasing,
`destination-out`) — a costa fica nítida a qualquer zoom, em vez da escada
de píxeis da máscara raster (land-mask.json).

Fontes (ambas de domínio público / uso livre com atribuição):
  - GADM 4.1 nível 0, Portugal + Espanha (geopackage completo, sem
    simplificação prévia) — costa da Península, Açores, Madeira, Canárias,
    Baleares, Ceuta e Melilla. Coincide com a linha de costa do basemap.
  - Natural Earth 10m land — tudo o resto do domínio (França, Marrocos,
    Ilhas Britânicas, América do Norte, África, Mediterrâneo…).
  terra = GADM ∪ (NE fora da Península). A NE é cortada a 2,5 km da GADM e
  reposta junto às fronteiras terrestres (França, Andorra, Marrocos à volta
  de Ceuta/Melilla, Gibraltar), por isso a costa ibérica é só GADM.

Águas interiores = TERRA (o campo não as pinta, mas chega à costa aberta):
  1. fecho morfológico (+d, −d) com d = 1 km — enche rias, lagoas e barras
     com menos de ~2 km de boca (Ria de Aveiro, Ria Formosa, Óbidos, Sado,
     Mondego…);
  2. fechos explícitos nas bocas do Tejo e do Sado (CLOSERS);
  3. buracos < 3000 km² enchidos (lagos, estuários fechados pelo passo 1/2).
  O mar aberto (rias galegas largas, golfos) fica mar.

Saída (estática, commitada — não é dado do pipeline):
  public/geo/land-clip/index.json — { v: 1, source, domain, closingKm, dir,
    tiers: [{ minZoom, maxZoom, z, tileDeg, tiles: ["<sul>_<oeste>", …], full: […] }] }
  public/geo/land-clip/<nível>/<sul>_<oeste>.json — { v: 1, z, rings: [anel, …] }
  Quatro níveis por zoom (TIERS): z0–4 (mosaicos de 180°), z5–6 (20°),
  z7–8 (10°), z ≥ 9 (5°), simplificados a ~0,6 px ao zoom de referência.
  Anel = inteiros [x0, y0, dx1, dy1, …]: píxeis-mundo Web Mercator ao zoom
  `z` do nível (x = (lon+180)/360·256·2^z), deltas a partir do 2.º vértice.
  Os anéis desenham-se com a regra even-odd (buracos = anéis interiores).
  Mosaicos só-mar não existem; os só-terra vêm em `full`.

Uso (offline — o resultado é commitado; não corre no CI):
  pip install shapely numpy
  python3 scripts/bake-land-clip.py --gadm-prt gadm41_PRT.gpkg \
      --gadm-esp gadm41_ESP.gpkg --ne ne_10m_land.geojson
  (geopackages: https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/;
   NE: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson)
"""
import argparse
import json
import math
import os
import shutil
import sqlite3

import numpy as np
import shapely
from shapely import wkb
from shapely.geometry import LineString, MultiPolygon, Polygon, box, shape
from shapely.ops import unary_union

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# Domínio da terra: cobre maxBounds do /mapa (src/lib/map-constants.ts) com folga.
DOMAIN = (-112.0, -12.0, 56.0, 76.0)  # oeste, sul, este, norte
CLOSING_KM = 1.0
IBERIA_CUT_KM = 2.5
HOLE_FILL_KM2 = 3000.0
# Níveis: (zoom máximo do nível, zoom de quantização, tolerância em píxeis ao zoom máximo)
# Níveis: (zoom mín, zoom máx, zoom de quantização, zoom da tolerância,
# tolerância em px a esse zoom, lado do mosaico em graus). Cada mosaico é um
# ficheiro; o cliente só pede os que tocam a vista, do nível do zoom actual.
TIERS = [
    (0, 4, 6, 4, 0.6, 180),
    (5, 6, 8, 6, 0.6, 20),
    (7, 8, 10, 8, 0.6, 10),
    (9, 22, 13, 11, 0.6, 5),
]
FINE_TOL_PX_AT = (0.6, 11)

# Bocas fechadas à mão (lat, lon) — linhas engrossadas 150 m e unidas à terra.
CLOSERS = [
    # Tejo: São Julião da Barra → Cova do Vapor (a barra; o estuário fica terra).
    [(38.6744, -9.3268), (38.6590, -9.3000), (38.6560, -9.2960)],
    # Sado: Outão → ponta de Tróia.
    [(38.4876, -8.9305), (38.4935, -8.9100), (38.4925, -8.8985)],
]
# Gibraltar não está no GADM ESP — fica com a Natural Earth.
GIBRALTAR = box(-5.37, 36.10, -5.33, 36.16)

R = 6378137.0


def merc(lon, lat):
    x = np.radians(lon) * R
    lat = np.clip(lat, -85.05, 85.05)
    y = np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)) * R
    return x, y


def unmerc(x, y):
    return np.degrees(x / R), np.degrees(2 * np.arctan(np.exp(y / R)) - np.pi / 2)


def to_merc(g):
    return shapely.transform(g, lambda c: np.column_stack(merc(c[:, 0], c[:, 1])))


def to_world_px(g, z):
    """Mercator (m) → píxeis-mundo ao zoom z."""
    s = 256 * 2 ** z / (2 * math.pi * R)
    return shapely.transform(g, lambda c: np.column_stack(((c[:, 0] + math.pi * R) * s, (math.pi * R - c[:, 1]) * s)))


def mlen(km, lat=40.0):
    """km no terreno → metros Mercator à latitude de referência."""
    return km * 1000.0 / math.cos(math.radians(lat))


def read_gadm(path):
    con = sqlite3.connect(path)
    (blob,) = con.execute('select geom from ADM_ADM_0').fetchone()
    flags = blob[3]
    envlen = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
    return wkb.loads(bytes(blob[8 + envlen:]))


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for p in getattr(g, 'geoms', []) if isinstance(p, (Polygon, MultiPolygon)) for p in polys(p)]


def fill_small_holes(g, max_m2):
    out = []
    for p in polys(g):
        keep = [i for i in p.interiors if Polygon(i).area > max_m2]
        out.append(Polygon(p.exterior, keep))
    return unary_union(out)


def build_land(args):
    dom = box(*DOMAIN)
    fine_tol = FINE_TOL_PX_AT[0] * 2 * math.pi * R / (256 * 2 ** FINE_TOL_PX_AT[1])
    print('[land-clip] NE 10m…', flush=True)
    feats = [shape(f['geometry']) for f in json.load(open(args.ne))['features']]
    ne = unary_union([g.intersection(dom) for g in feats if g.intersects(dom)])
    ne_m = to_merc(ne).buffer(0)
    print('[land-clip] GADM PT+ES…', flush=True)
    gadm = unary_union([read_gadm(args.gadm_prt), read_gadm(args.gadm_esp)])
    # Simplificada à tolerância do nível fino (~0,6 px a z11) antes de tudo.
    gadm_m = to_merc(gadm).buffer(0).simplify(fine_tol)
    # NE só fora da Península: corte a 2,5 km da GADM…
    cut = gadm_m.simplify(300).buffer(mlen(IBERIA_CUT_KM), quad_segs=4)
    other = ne_m.difference(cut)
    # …e reposta junto às fronteiras terrestres (França, Andorra, Marrocos à
    # volta de Ceuta/Melilla): o núcleo vizinho re-alargado, cortado à NE.
    near = other.intersection(cut.buffer(mlen(5), quad_segs=2))
    refill = ne_m.intersection(cut).intersection(near.buffer(mlen(IBERIA_CUT_KM) + 300, quad_segs=4))
    gib = to_merc(ne.intersection(GIBRALTAR))
    closers = [to_merc(LineString([(lon, lat) for lat, lon in c])).buffer(150, quad_segs=2) for c in CLOSERS]
    land = unary_union([gadm_m, other, refill, gib, *closers]).buffer(0)
    print('[land-clip] fecho morfológico (Península + ilhas)…', flush=True)
    # Só onde a GADM manda (rias/lagoas/estuários de PT+ES, costuras das
    # fronteiras); fora disso a NE 10m fica como está. A região de trabalho é
    # alargada 4·d para o −d não comer a borda do recorte.
    d = mlen(CLOSING_KM)
    region = cut.buffer(mlen(8), quad_segs=2)
    work = land.intersection(region.buffer(4 * d, quad_segs=2))
    closed = work.buffer(d, quad_segs=4).buffer(-d, quad_segs=4).intersection(region)
    land = unary_union([land.difference(region), closed]).buffer(0)
    # Os buracos medem-se em m² Mercator: escala ~1/cos² (a 40° ≈ 1,7×).
    land = fill_small_holes(land, HOLE_FILL_KM2 * 1e6 / math.cos(math.radians(40)) ** 2)
    print(f'[land-clip] terra: {shapely.get_num_coordinates(land)} vértices', flush=True)
    return land.buffer(0)


def encode_ring(coords):
    pts = np.round(np.asarray(coords)[:-1]).astype(np.int64)
    if len(pts) < 3:
        return None
    # tira vértices repetidos depois do arredondamento
    keep = np.ones(len(pts), bool)
    keep[1:] = np.any(pts[1:] != pts[:-1], axis=1)
    pts = pts[keep]
    if len(pts) < 3:
        return None
    out = [int(pts[0, 0]), int(pts[0, 1])]
    dd = np.diff(pts, axis=0)
    out.extend(int(v) for v in dd.reshape(-1))
    return out


def encode_geom(g_px):
    rings = []
    for p in polys(g_px):
        for r in [p.exterior, *p.interiors]:
            e = encode_ring(r.coords)
            if e:
                rings.append(e)
    return rings


def tiles_of(land_m, tile_deg, tol_m, min_area_m2):
    simp = land_m.simplify(tol_m, preserve_topology=True) if tol_m > 0 else land_m
    # Ilhas/buracos abaixo de ~1,5 px² ao zoom máximo do nível não se vêem.
    keep = []
    for p in polys(simp):
        if p.area < min_area_m2:
            continue
        keep.append(Polygon(p.exterior, [i for i in p.interiors if Polygon(i).area >= min_area_m2]))
    simp = unary_union(keep)
    shapely.prepare(simp)
    w0, s0, e0, n0 = DOMAIN
    for s in range(int(math.floor(s0 / tile_deg) * tile_deg), int(n0), tile_deg):
        for w in range(int(math.floor(w0 / tile_deg) * tile_deg), int(e0), tile_deg):
            tb = to_merc(box(w, max(s, -85), w + tile_deg, min(s + tile_deg, 85)))
            if not simp.intersects(tb):
                continue
            part = simp.intersection(tb)
            if part.is_empty:
                continue
            yield f'{s}_{w}', part, part.area >= tb.area * 0.999999


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gadm-prt', required=True)
    ap.add_argument('--gadm-esp', required=True)
    ap.add_argument('--ne', required=True)
    ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'geo'))
    ap.add_argument('--cache', help='WKB da terra já fechada (re-execuções rápidas)')
    a = ap.parse_args()
    if a.cache and os.path.exists(a.cache):
        land = shapely.from_wkb(open(a.cache, 'rb').read())
    else:
        land = build_land(a)
        if a.cache:
            open(a.cache, 'wb').write(shapely.to_wkb(land))
    base = os.path.join(a.out, 'land-clip')
    shutil.rmtree(base, ignore_errors=True)
    tiers = []
    for t, (min_z, max_z, qz, tol_z, tol_px, tile_deg) in enumerate(TIERS):
        px_m = 2 * math.pi * R / (256 * 2 ** tol_z)
        os.makedirs(os.path.join(base, str(t)), exist_ok=True)
        keys = []
        full = []
        nv = 0
        size = 0
        for key, part, is_full in tiles_of(land, tile_deg, tol_px * px_m, (1.5 * px_m) ** 2):
            rings = encode_geom(to_world_px(part, qz))
            if not rings:
                continue
            keys.append(key)
            if is_full:
                full.append(key)
            nv += sum(len(r) // 2 for r in rings)
            body = json.dumps({'v': 1, 'z': qz, 'rings': rings}, separators=(',', ':'))
            size += len(body)
            with open(os.path.join(base, str(t), f'{key}.json'), 'w') as fh:
                fh.write(body)
        print(f'[land-clip] nível {t} (z{min_z}–{max_z}): {len(keys)} mosaicos, {nv} vértices, {size // 1024} KB', flush=True)
        tiers.append({'minZoom': min_z, 'maxZoom': max_z, 'z': qz, 'tileDeg': tile_deg, 'tiles': sorted(keys), 'full': sorted(full)})
    doc = {
        'v': 1,
        'source': 'GADM 4.1 level-0 PT+ES (full res) + Natural Earth 10m land; inland waters closed '
        f'({CLOSING_KM:g} km closing + Tejo/Sado mouths + holes < {HOLE_FILL_KM2:g} km²)',
        'domain': {'west': DOMAIN[0], 'south': DOMAIN[1], 'east': DOMAIN[2], 'north': DOMAIN[3]},
        'closingKm': CLOSING_KM,
        'dir': 'geo/land-clip',
        'tiers': tiers,
    }
    with open(os.path.join(base, 'index.json'), 'w') as fh:
        json.dump(doc, fh, separators=(',', ':'))
    print('[land-clip] ok')


if __name__ == '__main__':
    main()
