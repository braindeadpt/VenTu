#!/usr/bin/env python3
"""Fetch MTG-I1 FCI frames from the EUMETSAT Data Store via Data Tailor
and write the animated-satellite bundle the map consumes:

  public/data/sat-mtg.json                 manifest (bounds + frame list)
  public/data/sat-mtg/frames/vis-*.webp    natural-color (slots diurnos)
  public/data/sat-mtg/frames/ir-*.webp     IR 10.5 µm colorizado (noite)

A escolha por slot é solar: elevação > ~8° sobre o centro da ROI →
natural-color (foto opaca); abaixo disso → IR colorizado com paleta de
topo de nuvem (alpha baixo no quente para o basemap respirar).

Why Data Tailor: each FCI FDHSI cycle is a full disc (~40 netCDF chunks,
GBs). The Tailor subsets server-side to our ROI (IR: filter ir_105 only;
VIS: filtro natural_color; ambos projectam para EPSG:4326) so we
download ~1 MB per frame.

Pipeline cadence: runs hourly inside update-data.yml, so the newest
frames are typically ≥60 min old (EUMETSAT "Core" data — CC-BY-4.0,
free to redistribute). Frames fresher than ~1 h sit in the "Recommended"
bucket (free for research/educational/personal use only) — see
docs/EXTERNAL-DATA.md before raising cadence.

Env: EUMETSAT_CONSUMER_KEY / EUMETSAT_CONSUMER_SECRET
(api.eumetsat.int/api-key). Missing creds → exit 0 with a warning so the
workflow degrades softly like the other optional layers.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import socket
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "public" / "data" / "sat-mtg" / "frames"
MANIFEST = REPO_ROOT / "public" / "data" / "sat-mtg.json"

COLLECTION = "EO:EUM:DAT:0662"  # FCI Level 1c Normal Resolution (FDHSI)
ROI_ID = "ventu_iberia_atlantic"
FILTER_ID = "ventu_fci_ir105"
FILTER_VIS_ID = "fcil1fdhsi_natural_color"  # filtro pré-definido EUMETSAT
CHAIN_ID = "ventu_fci_ir_geotiff_hr"
CHAIN_VIS_ID = "ventu_fci_vis_png"
# Resolução nativa FCI FDHSI (~2 km): 0.02°/px → 1750×1200 na ROI. A chain
# geotiff sem resample sai a 770×528 (~4.5 km/px) — visivelmente pixelada
# a zoom ≥ 8 (feedback utilizador 2026-10-05).
RESAMPLE_METHOD = "bilinear"
RESAMPLE_RESOLUTION = [0.02, 0.02]

# ROI criada no Data Tailor: N S W E — cobre Continente + Açores + Madeira.
ROI_NSWE = [52.0, 28.0, -34.0, 1.0]
BOUNDS = {"south": ROI_NSWE[1], "west": ROI_NSWE[2], "north": ROI_NSWE[0], "east": ROI_NSWE[3]}

FRAME_COUNT = 12          # ~2 h a cadência de 10 min
LOOKBACK_MIN = FRAME_COUNT * 10 + 30
JOB_POLL_S = 10
# Janela TOTAL (não por job) para o Data Tailor. Um run saudável demora 5–8 min.
# Era 40 min (4 × 10 min) — MAIS que o limite de 30 min do job do
# workflow: com o Tailor lento o job era morto antes de o script desistir e
# arrastava o pipeline todo. 8 min < timeout do passo (12) < timeout do job (30).
WINDOW_TIMEOUT_S = 480
# O stream_output do eumdac fica por vezes preso a meio de um download
# (socket aberto, zero bytes) — timeout duro por socket + um retry.
socket.setdefaulttimeout(180)

# FCI ir_105 — wavenumber central ~954.7 cm⁻¹ (guia de utilizador FCI L1).
IR105_WAVENUMBER = 954.7
C1 = 1.191042e-5          # primeiro coef. Planck, mW·m⁻²·sr⁻¹·(cm⁻¹)⁻¹
C2 = 1.4387752            # segundo coef. Planck, K·cm

# Paleta «topo de nuvem» — o quente (oceano/terra, sobretudo de noite)
# fica quase invisível para o basemap respirar por baixo (bug reportado:
# o véu ~50% escondia o Carto todo); só nuvens reais ganham corpo.
# Cinza-azulado (baixas/neblina) → ciano → amarelo → laranja → vermelho
# (convecção profunda). Sem roxo (design system).
PALETTE_STOPS = [
    # (K, (r, g, b), alpha 0-255)
    (310, (12, 20, 34), 0),
    (300, (16, 26, 42), 12),
    (295, (30, 44, 64), 30),
    (290, (50, 70, 96), 50),
    (284, (78, 106, 138), 80),
    (277, (124, 154, 186), 115),
    (270, (162, 192, 214), 150),
    (262, (112, 190, 214), 185),
    (254, (72, 200, 160), 215),
    (246, (240, 210, 90), 238),
    (238, (240, 140, 60), 248),
    (230, (230, 80, 70), 255),
    (220, (200, 40, 55), 255),
    (205, (150, 22, 45), 255),
]


def _interp(stops, t_kelvin):
    """(r,g,b,a) interpolado na paleta para uma temperatura em K."""
    import numpy as np

    ks = np.array([s[0] for s in stops], dtype=float)  # descrescente
    t = np.clip(t_kelvin, ks.min(), ks.max())
    i = int(np.searchsorted(-ks, -t))  # primeiro stop <= t
    i = min(max(i, 1), len(stops) - 1)
    k0, c0, a0 = stops[i - 1]
    k1, c1, a1 = stops[i]
    f = 0.0 if k1 == k0 else (k0 - t) / (k0 - k1)
    rgb = tuple(int(round(c0[j] + (c1[j] - c0[j]) * f)) for j in range(3))
    a = int(round(a0 + (a1 - a0) * f))
    return (*rgb, a)


def radiance_to_bt(radiance):
    """Radiância FCI ir_105 (mW·m⁻²·sr⁻¹·(cm⁻¹)⁻¹) → temperatura de
    brilho em K, inversão de Planck por wavenumber."""
    import numpy as np

    rad = np.where(radiance > 0.01, radiance, np.nan)
    return (C2 * IR105_WAVENUMBER) / np.log1p((C1 * IR105_WAVENUMBER**3) / rad)


def bt_to_rgba(bt):
    """Array de BT (K, NaN = sem dados) → RGBA uint8 via paleta."""
    import numpy as np

    ks = np.array([s[0] for s in PALETTE_STOPS], dtype=float)
    cols = np.array([s[1] for s in PALETTE_STOPS], dtype=float)
    alps = np.array([s[2] for s in PALETTE_STOPS], dtype=float)

    t = np.clip(bt, ks.min(), ks.max())
    # interpolação vectorizada entre stops
    idx = np.clip(np.searchsorted(-ks, -t, side="right") - 1, 0, len(ks) - 2)
    k0, k1 = ks[idx], ks[idx + 1]
    f = np.where(k0 != k1, (k0 - t) / (k0 - k1), 0.0)[..., None]

    rgb = cols[idx] + (cols[idx + 1] - cols[idx]) * f
    a = (alps[idx] + (alps[idx + 1] - alps[idx]) * f[..., 0])[..., None]
    rgba = np.concatenate([rgb, a], axis=-1)
    rgba[np.isnan(bt)] = (0, 0, 0, 0)
    return np.round(rgba).astype(np.uint8)


_FEATHER_CACHE = {}


def edge_feather(shape, px: int = 60):
    """Máscara 0→1 que dissolve as bordas do recorte: em zoom de mundo o
    rectângulo da ROI lia-se como «sticker» a meio do mapa. ~60 px ≈ 1.2°
    ≈ 100 km de rampa suave (distância à borda ^ 0.75)."""
    import numpy as np

    key = (shape, px)
    if key not in _FEATHER_CACHE:
        h, w = shape
        yy = np.minimum(np.arange(h), np.arange(h)[::-1])[:, None]
        xx = np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]
        _FEATHER_CACHE[key] = np.clip(
            np.minimum(yy, xx).astype("float32") / px, 0.0, 1.0
        ) ** 0.75
    return _FEATHER_CACHE[key]


def _get_or_create(crud, resource_id, factory):
    """Idempotente: read falha → create; se o erro for 'already exists'
    (a falha de read era transitória, ex.: DNS), relê em vez de rebentar."""
    try:
        return crud.read(resource_id)
    except Exception:
        pass
    try:
        return crud.create(factory())
    except Exception as e:
        if "already exists" in str(e):
            return crud.read(resource_id)
        raise


def ensure_tailor_resources(tailor):
    from eumdac.datatailor import Chain, Filter, RegionOfInterest

    _get_or_create(tailor.rois, ROI_ID, lambda: RegionOfInterest(
        id=ROI_ID, name="VenTu Iberia + Atlantic", NSWE=ROI_NSWE,
    ))
    _get_or_create(tailor.filters, FILTER_ID, lambda: Filter(
        id=FILTER_ID, name="FCI IR 10.5 only", product="FCIL1FDHSI",
        bands=["ir_105_effective_radiance"],
    ))
    _get_or_create(tailor.chains, CHAIN_ID, lambda: Chain(
        id=CHAIN_ID, product="FCIL1FDHSI", format="geotiff",
        name="VenTu FCI IR 10.5 Iberia HR", projection="geographic",
        roi=ROI_ID, filter=FILTER_ID,
        resample_method=RESAMPLE_METHOD,
        resample_resolution=RESAMPLE_RESOLUTION,
    ))
    _get_or_create(tailor.chains, CHAIN_VIS_ID, lambda: Chain(
        id=CHAIN_VIS_ID, product="FCIL1FDHSI", format="png_rgb",
        name="VenTu FCI Natural Color Iberia", projection="geographic",
        roi=ROI_ID, filter=FILTER_VIS_ID,
        resample_method=RESAMPLE_METHOD,
        resample_resolution=RESAMPLE_RESOLUTION,
    ))


def solar_elevation_deg(dt: datetime, lat: float = 40.0, lon: float = -16.5) -> float:
    """Elevação solar aproximada (±1°) sobre o centro da ROI — decide
    VIS vs IR por slot. NOAA approximation, suficiente para dawn/dusk."""
    import math

    n = dt.timetuple().tm_yday
    gamma = 2 * math.pi / 365 * (n - 1 + (dt.hour - 12) / 24)
    decl = (
        0.006918
        - 0.399912 * math.cos(gamma) + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2 * gamma) + 0.000907 * math.sin(2 * gamma)
        - 0.002697 * math.cos(3 * gamma) + 0.00148 * math.sin(3 * gamma)
    )
    eot_min = 229.18 * (
        0.000075 + 0.001868 * math.cos(gamma) - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2 * gamma) - 0.040849 * math.sin(2 * gamma)
    )
    tst_min = dt.hour * 60 + dt.minute + dt.second / 60 + eot_min + 4 * lon
    ha = math.radians(tst_min / 4 - 180)
    la = math.radians(lat)
    sin_e = math.sin(la) * math.sin(decl) + math.cos(la) * math.cos(decl) * math.cos(ha)
    return math.degrees(math.asin(max(-1.0, min(1.0, sin_e))))


# Acima desta elevação (no centro da ROI) o natural-color é legível;
# abaixo a foto fica escura demais para ser útil → IR. 15° no centro ≈
# ~10° na extremidade leste (Iberia fica ~10° a leste do centro) — já
# bastante escuro. Medido: a 12.9° no centro a foto era ilegível (2026-10).
VIS_MIN_ELEVATION_DEG = 15.0


def slot_kind(t_iso: str) -> str:
    """'vis' se o sol ilumina a ROI nesse slot, senão 'ir'."""
    dt = datetime.strptime(t_iso, "%Y-%m-%dT%H:%M:%S.000Z").replace(tzinfo=timezone.utc)
    return "vis" if solar_elevation_deg(dt) > VIS_MIN_ELEVATION_DEG else "ir"


def frame_name(kind: str, t_iso: str) -> str:
    return f"{kind}-{t_iso[:10]}T{t_iso[11:13]}{t_iso[14:16]}.webp"


def sensing_start(product_id: str) -> str | None:
    """`…_C_EUMT_<msg>_IDPFI_OPE_<YYYYMMDDHHMMSS>_<end>_…` → ISO do
    início de sensing (slot temporal «honesto» do frame)."""
    m = re.search(r"IDPFI_OPE_(\d{14})_(\d{14})", product_id)
    if not m:
        return None
    dt = datetime.strptime(m.group(1), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def main() -> int:
    key = os.environ.get("EUMETSAT_CONSUMER_KEY")
    secret = os.environ.get("EUMETSAT_CONSUMER_SECRET")
    if not key or not secret:
        print("⚠️  EUMETSAT_CONSUMER_KEY/SECRET em falta — salto MTG-IR (soft fail).")
        return 0

    try:
        import numpy  # noqa: F401
        import rasterio  # noqa: F401
        from PIL import Image, ImageFilter
        from eumdac import AccessToken
        from eumdac.datastore import DataStore
        from eumdac.datatailor import DataTailor
    except ImportError as e:
        print(f"⚠️  deps Python em falta ({e}) — pip install -r scripts/requirements-mtg.txt")
        return 0

    tok = AccessToken((key, secret))
    ds = DataStore(tok)
    tailor = DataTailor(tok)
    ensure_tailor_resources(tailor)
    chain = tailor.chains.read(CHAIN_ID)
    chain_vis = tailor.chains.read(CHAIN_VIS_ID)

    end = datetime.now(timezone.utc)
    prods = list(ds.get_collection(COLLECTION).search(
        dtstart=end - timedelta(minutes=LOOKBACK_MIN), dtend=end,
    ))
    # mais recentes primeiro, cap a FRAME_COUNT
    prods = prods[:FRAME_COUNT]
    if not prods:
        print("⚠️  sem produtos FCI na janela — mantenho o manifest actual.")
        return 0

    # Frames já gravados não voltam ao Tailor — poupa quota (máx. 3 jobs
    # em voo) e torna o rerun idempotente.
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    kinds = {}   # pid -> 'vis'|'ir' (elevação solar no slot)
    for p in prods:
        t_iso = sensing_start(str(p))
        if t_iso:
            kinds[str(p)] = slot_kind(t_iso)

    # Uniformiza a minoria: 1-2 frames do outro produto no meio do loop
    # liam-se como «flash» (foto diurna num sweep IR nocturno — reportado
    # pelo utilizador). Com <3 slots da minoria, esses slots vão para o
    # produto dominante — a janela crepuscular fica homogénea.
    vis_n = sum(1 for k in kinds.values() if k == "vis")
    ir_n = sum(1 for k in kinds.values() if k == "ir")
    if kinds and 0 < min(vis_n, ir_n) < 3:
        flip_to = "ir" if vis_n < ir_n else "vis"
        for pid in list(kinds):
            if kinds[pid] != flip_to:
                kinds[pid] = flip_to
        print(f"  uniformizo para '{flip_to}' (minoria {min(vis_n, ir_n)}/{len(kinds)})")

    existing_frames = []
    todo = []
    for p in prods:
        pid = str(p)
        t_iso = sensing_start(pid)
        if t_iso:
            kind = kinds[pid]
            name = frame_name(kind, t_iso)
            if (OUT_DIR / name).exists():
                existing_frames.append({
                    "frameTime": t_iso,
                    "imagePath": f"sat-mtg/frames/{name}",
                    "kind": kind,
                })
                continue
        todo.append(p)
    prods = todo
    print(f"  {len(existing_frames)} frames já em disco; {len(prods)} por processar")
    if not prods and existing_frames:
        frames = sorted(existing_frames, key=lambda f: f["frameTime"], reverse=True)
        manifest = {
            "source": "eumetsat-mtg-fci",
            "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "cadenceMin": 10,
            "bounds": BOUNDS,
            "attribution": "EUMETSAT",
            "frames": frames,
        }
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"🛰️  sat-mtg.json reescrito: {len(frames)} frames (todos em disco)")
        return 0
    if not prods:
        return 0
    print(f"🛰️  {len(prods)} ciclos FCI desde {prods[-1] and end - timedelta(minutes=LOOKBACK_MIN):%H:%M}Z")

    # O Tailor aceita no MÁXIMO 3 customizações queued+running por conta —
    # janela deslizante: submete até encher, descarrega cada DONE e submete
    # o próximo produto. A janela de 12 frames demora ~5-8 min no total.
    MAX_JOBS = 3
    queue = list(prods)
    jobs = {}        # pid -> Customisation em voo
    pending = []     # pids por ordem de submissão
    done_jobs = {}
    deadline = time.time() + WINDOW_TIMEOUT_S  # a janela toda (não por job)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    frames = []
    import numpy as np

    def download_output(job, suffix: str, tmp) -> Path | None:
        out_name = next((o for o in job.outputs if o.endswith(suffix)), None)
        if not out_name:
            return None
        out_path = Path(tmp) / os.path.basename(out_name)
        last_err: Exception | None = None
        for _attempt in range(3):
            try:
                with job.stream_output(out_name) as s, open(out_path, "wb") as f:
                    shutil.copyfileobj(s, f)
                if out_path.stat().st_size > 0:
                    last_err = None
                    break
            except Exception as e:  # socket.timeout, conn reset, …
                last_err = e
                time.sleep(5)
        if last_err is not None or out_path.stat().st_size == 0:
            print(f"  download falhou {out_name[-24:]}: {last_err}")
            return None
        return out_path

    def render_frame(pid, job, tmp):
        t_iso = sensing_start(pid)
        kind = kinds.get(pid, "ir")
        if not t_iso:
            return
        name = frame_name(kind, t_iso)
        if kind == "vis":
            # Natural color — o Tailor entrega RGB georreferenciado na ROI.
            # Reencodamos com dois tratamentos:
            #  1) lift de exposição FIXO (gamma 1.3 + gain) — o produto sai
            #     escuro (oceano ~6% reflectância); curva fixa, nunca
            #     normalizada por frame, senão a exposição varia entre
            #     ticks do carrossel e lê-se como strobe.
            #  2) alpha por luminância — oceano escuro ~45-55% deixa o
            #     basemap/costas lerem-se por baixo, terra ~70-85%,
            #     nuvens ~100%; lum<8 = pixels fora do disco FCI →
            #     transparentes. Sem isto a foto tapa o mapa inteiro.
            src = download_output(job, ".png", tmp)
            if not src:
                return
            a = np.asarray(Image.open(src).convert("RGB"), dtype="float32")
            a = np.clip(255.0 * (a / 255.0) ** (1.0 / 1.3) * 1.12, 0.0, 255.0)
            lum = (
                0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
            )
            alpha = np.where(
                lum < 8.0,
                0.0,
                0.45 + 0.55 * np.clip((lum - 40.0) / 130.0, 0.0, 1.0),
            )
            alpha = alpha * edge_feather(lum.shape)
            rgba = np.dstack(
                [a.astype("uint8"), (alpha * 255.0).astype("uint8")]
            )
            img = Image.fromarray(rgba, "RGBA").filter(
                ImageFilter.GaussianBlur(0.5),
            )
            img.save(OUT_DIR / name, "WEBP", quality=85, method=4)
            frames.append({
                "frameTime": t_iso,
                "imagePath": f"sat-mtg/frames/{name}",
                "kind": kind,
            })
            print(f"  ✅ {name} — VIS natural-color")
            return
        tif_path = download_output(job, ".tif", tmp)
        if not tif_path:
            return
        with rasterio.open(tif_path) as d:
            radiance = d.read(1).astype("float32")
            radiance[radiance == d.nodata] = float("nan")
        bt = radiance_to_bt(radiance)
        rgba = bt_to_rgba(bt)
        rgba[..., 3] = np.round(
            rgba[..., 3].astype("float32") * edge_feather(rgba.shape[:2])
        ).astype("uint8")
        # Suavizado sub-pixel: o FCI nativo é ~2 km e a overlay estica-se
        # com CSS — um blur ligeiro tira os bordos de escada do grid sem
        # lavar as células convectivas (σ < 1 px de fonte). WebP q85/m4:
        # ~0.75 MB/frame com alpha contínuo (PNG saía a ~2.9 MB); method=6
        # custa ~140 s/frame nesta máquina por ~3% de ganho — fica m4.
        img = Image.fromarray(rgba, "RGBA").filter(
            ImageFilter.GaussianBlur(0.8),
        )
        img.save(OUT_DIR / name, "WEBP", quality=85, method=4)
        frames.append({
            "frameTime": t_iso,
            "imagePath": f"sat-mtg/frames/{name}",
            "kind": kind,
        })
        print(f"  ✅ {name} — BT {np.nanmin(bt):.0f}–{np.nanmax(bt):.0f} K")

    with tempfile.TemporaryDirectory() as tmp:
        while (queue or pending) and time.time() < deadline:
            while queue and len(pending) < MAX_JOBS:
                p = queue.pop(0)
                pid = str(p)
                try:
                    jobs[pid] = tailor.new_customisation(
                        p, chain_vis if kinds.get(pid) == "vis" else chain,
                    )
                    pending.append(pid)
                except Exception as e:
                    print(f"  skip {pid[-24:]}: {e}")
            progressed = False
            for pid in list(pending):
                job = jobs[pid]
                status = job.status
                if status == "DONE":
                    pending.remove(pid)
                    done_jobs[pid] = job
                    try:
                        render_frame(pid, job, tmp)
                    except Exception as e:
                        print(f"  render falhou {pid[-24:]}: {e}")
                    try:
                        job.delete()
                    except Exception:
                        pass
                    progressed = True
                elif status in ("FAILED", "ERROR", "KILLED", "INACTIVE"):
                    print(f"  job falhou {pid[-24:]}: {status}")
                    pending.remove(pid)
                    progressed = True
            if not progressed:
                time.sleep(JOB_POLL_S)
        if pending:
            print(f"  ⏱️  {len(pending)} jobs por terminar — sigo com os DONE.")
            # O Tailor aceita no máximo 3 customizações queued+running por conta:
            # jobs deixados a meio ocupariam as vagas do run seguinte. Melhor
            # esforço — um erro aqui nunca impede de gravar o manifest.
            for pid in pending:
                try:
                    jobs[pid].kill()
                except Exception:
                    pass
                try:
                    jobs[pid].delete()
                except Exception:
                    pass

    frames.extend(existing_frames)
    if not frames:
        print("⚠️  nenhum frame produzido — mantenho o manifest actual.")
        return 1

    frames.sort(key=lambda f: f["frameTime"], reverse=True)
    keep = {f["imagePath"].rsplit("/", 1)[-1] for f in frames}
    for old in OUT_DIR.iterdir():
        if old.suffix in (".png", ".webp") and old.name not in keep:
            old.unlink()

    manifest = {
        "source": "eumetsat-mtg-fci",
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "cadenceMin": 10,
        "bounds": BOUNDS,
        "attribution": "EUMETSAT",
        "frames": frames,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"🛰️  sat-mtg.json: {len(frames)} frames, newest {frames[0]['frameTime']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
