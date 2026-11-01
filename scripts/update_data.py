#!/usr/bin/env python3
"""
Coletor de dados do Duelo de Natal.

Fontes (todas gratuitas):
  1. Kworb - página de histórico de chart de cada faixa
     https://kworb.net/spotify/track/<id>.html
     -> streams por dia (ou por semana) enquanto a faixa está no Top 200,
        com colunas por país (usamos Global e BR).
  2. Kworb - página de músicas do artista
     https://kworb.net/spotify/artist/<id>_songs.html
     -> total acumulado de streams no Spotify e streams do último dia.
  3. YouTube Data API v3 (opcional, precisa da variável YT_API_KEY)
     -> total de visualizações do clipe oficial.

Saídas:
  data/charts.json  histórico de chart (mesclado com o que já existe, nunca apaga)
  data/totals.json  um "retrato" por dia com os totais acumulados

Uso:
  python scripts/update_data.py                 # coleta real
  python scripts/update_data.py --fixtures DIR  # lê HTML salvo em DIR (testes)

Sem dependências externas: só biblioteca padrão.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.json"
CHARTS = ROOT / "data" / "charts.json"
TOTALS = ROOT / "data" / "totals.json"

UA = "Mozilla/5.0 (compatible; duelo-de-natal/1.0; +https://github.com)"
DATE_RE = re.compile(r"^(\d{4})/(\d{2})/(\d{2})$")
CELL_RE = re.compile(r"^\s*(\d+)\s*\(([\d,]+)\)\s*$")  # "1 (23,226,178)"
INT_RE = re.compile(r"^[\d,]+$")


# --------------------------------------------------------------------------
# Leitura genérica de tabelas HTML
# --------------------------------------------------------------------------
class TableParser(HTMLParser):
    """Extrai todas as tabelas: lista de linhas; cada célula = (texto, [hrefs])."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[tuple[str, list[str]]]]] = []
        self._stack: list[list] = []
        self._row: list | None = None
        self._cell: list[str] | None = None
        self._hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._stack.append([])
        elif tag == "tr" and self._stack:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell, self._hrefs = [], []
        elif tag == "a" and self._cell is not None:
            href = dict(attrs).get("href")
            if href:
                self._hrefs.append(href)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            text = " ".join("".join(self._cell).split())
            self._row.append((text, self._hrefs))
            self._cell = None
        elif tag == "tr" and self._row is not None and self._stack:
            if self._row:
                self._stack[-1].append(self._row)
            self._row = None
        elif tag == "table" and self._stack:
            self.tables.append(self._stack.pop())

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def parse_tables(html: str):
    p = TableParser()
    p.feed(html)
    return p.tables


# --------------------------------------------------------------------------
# Rede / fixtures
# --------------------------------------------------------------------------
def fetch(url: str, fixtures: Path | None, fixture_name: str) -> str:
    if fixtures:
        return (fixtures / fixture_name).read_text(encoding="utf-8")
    last_err = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"falha ao baixar {url}: {last_err}")


# --------------------------------------------------------------------------
# 1. Histórico de chart (Kworb track page)
# --------------------------------------------------------------------------
def to_iso(d: str) -> str | None:
    m = DATE_RE.match(d.strip())
    return f"{m[1]}-{m[2]}-{m[3]}" if m else None


def parse_track_history(html: str, columns: dict[str, str]) -> dict:
    """
    Procura tabelas cujo cabeçalho começa com 'Date'. O Kworb tem duas:
    a semanal (histórico completo desde 2013) e a diária (só as entradas
    mais recentes, cerca de 30). Classifica cada uma pelo intervalo mediano
    entre datas e devolve as duas:
    {"weekly": {region: [[data, pos, streams], ...]}, "daily": {...}}.
    """
    candidates = []
    for table in parse_tables(html):
        if not table:
            continue
        header = [c[0] for c in table[0]]
        if not header or header[0].strip().lower() != "date":
            continue
        rows = []
        for row in table[1:]:
            iso = to_iso(row[0][0]) if row else None
            if iso:
                rows.append((iso, [c[0] for c in row]))
        if len(rows) < 2:
            continue
        dates = sorted(dt.date.fromisoformat(r[0]) for r in rows)
        gaps = [(b - a).days for a, b in zip(dates, dates[1:]) if (b - a).days > 0]
        median_gap = statistics.median(gaps) if gaps else 7
        candidates.append({"gap": median_gap, "header": header, "rows": rows})

    if not candidates:
        raise ValueError("nenhuma tabela de histórico encontrada (layout do Kworb mudou?)")

    def extract(table: dict) -> dict:
        out = {}
        for region, col_name in columns.items():
            series = []
            if col_name in table["header"]:
                idx = table["header"].index(col_name)
                for iso, cells in table["rows"]:
                    if idx < len(cells):
                        m = CELL_RE.match(cells[idx])
                        if m:
                            series.append([iso, int(m[1]), int(m[2].replace(",", ""))])
            out[region] = sorted(series)
        return out

    result = {"weekly": {r: [] for r in columns}, "daily": {r: [] for r in columns}}
    for kind in ("weekly", "daily"):
        group = [c for c in candidates if (c["gap"] <= 1) == (kind == "daily")]
        if group:
            # se houver mais de uma do mesmo tipo, fica a mais longa
            result[kind] = extract(max(group, key=lambda c: len(c["rows"])))
    return result


def season_of(iso: str, start_md: str, end_md: str) -> int | None:
    """Ano do Natal (temporada start_md..end_md, atravessando a virada)."""
    md = iso[5:]
    if md >= start_md:
        return int(iso[:4])
    if md <= end_md:
        return int(iso[:4]) - 1
    return None


def compose(songs: dict, regions, start_md: str, end_md: str, min_cov: float = 0.9):
    """
    Monta a série usada pelo site, temporada a temporada, com UMA fonte para
    as duas músicas (para a comparação ser justa): diária quando ela cobre a
    temporada (soma diária >= 90% da semanal para cada música), senão semanal.
    Devolve {region: {ano: "daily"|"weekly"}} e grava songs[k][region].
    """
    gran: dict = {}
    for region in regions:
        by_season: dict = {}
        for key, e in songs.items():
            for kind in ("weekly", "daily"):
                for row in e.get(kind, {}).get(region, []):
                    y = season_of(row[0], start_md, end_md)
                    if y is not None:
                        by_season.setdefault(y, {}).setdefault(key, {"weekly": [], "daily": []})[kind].append(row)
        choice = {}
        for y, per_song in by_season.items():
            use_daily = True
            for d in per_song.values():
                wk = sum(r[2] for r in d["weekly"])
                dy = sum(r[2] for r in d["daily"])
                if wk and dy < min_cov * wk:
                    use_daily = False
            choice[y] = "daily" if use_daily else "weekly"
        gran[region] = {str(y): choice[y] for y in sorted(choice)}
        for key, e in songs.items():
            rows = []
            for y, per_song in by_season.items():
                rows += per_song.get(key, {}).get(choice[y], [])
            e[region] = sorted(rows)
    return gran


def merge_series(old: list, new: list) -> list:
    by_date = {r[0]: r for r in old}
    by_date.update({r[0]: r for r in new})  # dado novo prevalece
    return [by_date[k] for k in sorted(by_date)]


# --------------------------------------------------------------------------
# 2. Total acumulado (Kworb artist songs page)
# --------------------------------------------------------------------------
def parse_song_totals(html: str, track_id: str) -> dict:
    """Acha a linha com link para a faixa e lê os números seguintes: total e diário."""
    for table in parse_tables(html):
        header = [c[0].strip().lower() for c in table[0]] if table else []
        for row in table:
            hit = any(track_id in h for _, hrefs in row for h in hrefs)
            if not hit:
                continue
            link_idx = next(i for i, (_, hrefs) in enumerate(row) if any(track_id in h for h in hrefs))
            nums = []
            for text, _ in row[link_idx + 1:]:
                t = text.strip()
                nums.append(int(t.replace(",", "")) if INT_RE.match(t) else None)
            # tenta usar o cabeçalho; senão, ordem: total, diário
            out = {"total": None, "daily": None}
            if header and len(header) == len(row):
                for i, name in enumerate(header[link_idx + 1:]):
                    v = nums[i] if i < len(nums) else None
                    if name.startswith("stream") and out["total"] is None:
                        out["total"] = v
                    elif name.startswith("daily") and out["daily"] is None:
                        out["daily"] = v
            if out["total"] is None:
                vals = [n for n in nums if n is not None]
                out["total"] = vals[0] if vals else None
                out["daily"] = vals[1] if len(vals) > 1 else None
            return out
    raise ValueError(f"faixa {track_id} não encontrada na página de músicas")


# --------------------------------------------------------------------------
# 3. YouTube
# --------------------------------------------------------------------------
def youtube_views(video_ids: list[str], api_key: str) -> dict[str, dict]:
    qs = urllib.parse.urlencode({"part": "statistics,snippet", "id": ",".join(video_ids), "key": api_key})
    url = f"https://www.googleapis.com/youtube/v3/videos?{qs}"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
        data = json.load(r)
    out = {}
    for item in data.get("items", []):
        out[item["id"]] = {
            "views": int(item["statistics"].get("viewCount", 0)),
            "title": item["snippet"].get("title", ""),
        }
    return out


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def load_json(path: Path, default):
    if path.exists() and path.stat().st_size:
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures", type=Path, help="pasta com HTML salvo (modo teste)")
    ap.add_argument("--date", help="data do retrato (AAAA-MM-DD); padrão = hoje UTC")
    args = ap.parse_args()

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    columns = {k: v["kworb_column"] for k, v in cfg["regions"].items()}
    today = args.date or dt.datetime.now(dt.timezone.utc).date().isoformat()
    now_iso = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

    charts = load_json(CHARTS, {"songs": {}})
    totals = load_json(TOTALS, {"snapshots": []})
    errors: list[str] = []
    chart_ok = 0

    # --- 1. histórico de chart
    for s in cfg["songs"]:
        tid = s["spotify_track_id"]
        try:
            html = fetch(f"https://kworb.net/spotify/track/{tid}.html", args.fixtures, f"track_{tid}.html")
            parsed = parse_track_history(html, columns)
            entry = charts["songs"].setdefault(s["key"], {})
            entry.pop("granularity", None)  # formato antigo
            for kind in ("weekly", "daily"):
                store = entry.setdefault(kind, {})
                for region in columns:
                    store[region] = merge_series(store.get(region, []), parsed[kind][region])
            chart_ok += 1
            print(f"[chart] {s['key']}: "
                  + ", ".join(f"{k} {r}={len(parsed[k][r])} pontos" for k in ("weekly", "daily") for r in columns))
        except Exception as e:  # noqa: BLE001
            errors.append(f"chart {s['key']}: {e}")

    if chart_ok:
        charts["granularity"] = compose(charts["songs"], columns, cfg["season_start"], cfg["season_end"])
        for region, g in charts["granularity"].items():
            print(f"[temporadas] {region}: " + " ".join(f"{y}={'d' if v == 'daily' else 's'}" for y, v in g.items()))

    # --- 2. totais Spotify
    snap = {"date": today, "songs": {}}
    for s in cfg["songs"]:
        rec = snap["songs"].setdefault(s["key"], {})
        aid = s["spotify_artist_id"]
        try:
            html = fetch(f"https://kworb.net/spotify/artist/{aid}_songs.html", args.fixtures, f"songs_{aid}.html")
            t = parse_song_totals(html, s["spotify_track_id"])
            rec["spotify_total"] = t["total"]
            rec["spotify_daily"] = t["daily"]
            print(f"[spotify] {s['key']}: total={t['total']:,} diário={t['daily']}")
        except Exception as e:  # noqa: BLE001
            errors.append(f"spotify total {s['key']}: {e}")

    # --- 3. YouTube
    key = os.environ.get("YT_API_KEY", "").strip()
    if key and not args.fixtures:
        try:
            yt = youtube_views([s["youtube_video_id"] for s in cfg["songs"]], key)
            for s in cfg["songs"]:
                info = yt.get(s["youtube_video_id"])
                if info:
                    snap["songs"][s["key"]]["youtube_views"] = info["views"]
                    print(f"[youtube] {s['key']}: {info['views']:,} views - '{info['title']}'")
                else:
                    errors.append(f"youtube {s['key']}: vídeo {s['youtube_video_id']} não encontrado")
        except Exception as e:  # noqa: BLE001
            errors.append(f"youtube: {e}")
    elif not args.fixtures:
        print("[youtube] YT_API_KEY ausente - pulando (configure o secret no GitHub)")

    # grava retrato do dia (substitui se já existir)
    if any(v for v in snap["songs"].values()):
        totals["snapshots"] = [x for x in totals["snapshots"] if x["date"] != today] + [snap]
        totals["snapshots"].sort(key=lambda x: x["date"])
        totals["updated"] = now_iso
    if chart_ok:
        charts["updated"] = now_iso

    save_json(CHARTS, charts)
    save_json(TOTALS, totals)

    for e in errors:
        print(f"[aviso] {e}", file=sys.stderr)
    # falha o job só se nada de chart funcionou, para você ser avisado
    return 1 if chart_ok == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
