"""Gera HTML no formato do Kworb (dados sintéticos) para testar o parser e o site."""
import datetime as dt
import math
import random
from pathlib import Path

OUT = Path(__file__).parent / "fixtures"
OUT.mkdir(exist_ok=True)
random.seed(7)

SONGS = {
    "0bYg9bo50gSsH3LtXe2SQn": ("4iHNK0tOyZPYnBU7nGAgpQ", "All I Want for Christmas Is You", 1.0),
    "2FRnf9qhLbvw8fu4IBXx78": ("5lpH0xAS4fVfLkACg9DAuM", "Last Christmas", 0.93),
}
COLS = ["Global", "US", "GB", "BR"]


def daily_value(day: dt.date, scale: float, tid: str = ""):
    """Curva de temporada: sobe em novembro, pico 24/12, despenca após 26/12."""
    year = day.year if day.month >= 10 else day.year - 1
    peak = dt.date(year, 12, 24)
    d = (day - peak).days
    if d < -55 or d > 8:
        return None
    form = random.Random(f"{tid}{year}").uniform(0.82, 1.14)  # fase de cada diva no ano
    base = 24_000_000 * scale * form * (1 + 0.04 * (year - 2017))
    val = base * math.exp(-((d / 18) ** 2)) if d <= 0 else base * math.exp(-d / 2.2)
    return int(val * random.uniform(0.95, 1.05))


def cell(v, col):
    if v is None:
        return "--"
    factor = {"Global": 1, "US": 0.24, "GB": 0.1, "BR": 0.02}[col]
    s = int(v * factor)
    if col == "BR" and s < 250_000:
        return "--"
    pos = max(1, int(200 - s / (v * factor + 1) * 199 * min(1, v / 20_000_000)))
    return f"{pos} ({s:,})"


def rows(dates, scale, tid=""):
    out = []
    for d in dates:
        v = daily_value(d, scale, tid)
        if v is None:
            continue
        tds = "".join(f"<td>{cell(v, c)}</td>" for c in COLS)
        out.append(f"<tr><td>{d:%Y/%m/%d}</td>{tds}</tr>")
    return "\n".join(out)


start, end = dt.date(2017, 10, 1), dt.date(2026, 1, 31)
all_days = [start + dt.timedelta(n) for n in range((end - start).days + 1)]
weeks = all_days[::7]
head = "<tr><th>Date</th>" + "".join(f"<th>{c}</th>" for c in COLS) + "</tr>"
for tid, (aid, title, scale) in SONGS.items():
    html = f"""<html><body><div class="weekly"><table class="sortable">{head}
<tr><td>Total</td><td>2,139,431,362</td><td>1</td><td>1</td><td>1</td></tr>
{rows(weeks, scale * 7, tid)}</table></div>
<div class="daily" style="display:none"><table>{head}
<tr><td>Total</td><td>2,139,431,362</td><td>1</td><td>1</td><td>1</td></tr>
{rows([d for d in all_days if d >= dt.date(2025, 12, 7)], scale, tid)}</table></div></body></html>"""
    (OUT / f"track_{tid}.html").write_text(html, encoding="utf-8")
    songs = f"""<html><body><table><tr><th>Song Title</th><th>Streams</th><th>Daily</th></tr>
<tr><td><a href="../track/XXXXXXXXXXXXXXXXXXXXXX.html">Outra faixa</a></td><td>9,999</td><td>12</td></tr>
<tr><td><a href="../track/{tid}.html">{title}</a></td><td>{int(2_300_000_000*scale):,}</td><td>{int(1_400_000*scale):,}</td></tr>
</table></body></html>"""
    (OUT / f"songs_{aid}.html").write_text(songs, encoding="utf-8")
print("fixtures ok:", sorted(p.name for p in OUT.iterdir()))
