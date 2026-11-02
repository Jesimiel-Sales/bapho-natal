/* =========================================================
   BAPHO! Especial de Natal
   js puro, sem framework, porque eu sou dessas.
   Chart.js vem do CDN. o resto é amor e gambiarra controlada.
   ========================================================= */
(() => {
  "use strict";

  // ------------------------------------------------------------ utilidades (o básico bem feito)
  const $ = (s) => document.querySelector(s);
  const nf = new Intl.NumberFormat("pt-BR");
  const nfc = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TODAY = new Date().toISOString().slice(0, 10);
  const CROWN = '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M4 36 L8 10 L22 24 L32 4 L42 24 L56 10 L60 36 Z"/></svg>';
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const colorOf = (i) => css(i ? "--blue" : "--pink");
  const fmtD = (iso, y) => { const [Y, M, D] = iso.split("-"); return y ? `${D}/${M}/${Y}` : `${D}/${M}`; };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const pct = (x) => x.toFixed(1).replace(".", ",") + "%";
  const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
  const pick = (arr, seed) => arr[hash(seed) % arr.length];
  const fill = (tpl, o) => tpl.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? "");

  async function getJSON(path, fallback) {
    try {
      const r = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const t = await r.text();
      return t.trim() ? JSON.parse(t) : fallback;
    } catch { return fallback; } // deu ruim? finge que nada aconteceu, igual ex no Orkut
  }

  // ------------------------------------------------------------ o roteiro da fofoqueira
  // shade carinhoso. ninguém aqui ataca ninguém por quem ela é, só pelo desempenho no chart.
  const KIND = { ko: "Humilhou", clear: "Arrasou", close: "Suadinho", photo: "Foto-finish", wo: "Nem apareceu" };
  const LINES = {
    ko: [
      "{W} humilhou. {L} foi chorar no depoimento do Orkut. Vantagem de {p}.",
      "Nem foi luta, foi aula: {W} {p} na frente e {L} de figurante.",
      "{L} tentou, mas tentar não é conseguir, né amor? {W} passou o rodo por {p}.",
    ],
    clear: [
      "{W} arrasou e {L} ficou de enfeite de árvore: {p}.",
      "Sem barraco, só fatos: {W} na frente por {p}. Aceita que dói menos.",
      "{W} entregou TUDO. {L} entregou o mínimo. Placar: {p}.",
    ],
    close: [
      "Ganhou, mas suou o glitter: {W} por {p}.",
      "{L} quase, QUASE. Mas quase não é rainha. {W} por {p}.",
      "Apertado igual calça de cintura baixa: {W} por {p}.",
    ],
    photo: [
      "OMG que babado: {W} venceu por {p}. Os juízes tão bege até agora.",
      "Diferença de {p}. Isso não é vitória, é exame de DNA. Mas a coroa é de {W}.",
      "Tão perto que teve replay: {W} por {p}. {L} já pediu recontagem.",
    ],
    wo: [
      "{L} nem apareceu no Top 200. Fail total. {W} ganhou por W.O.",
      "{W} cantou pra plateia vazia de rival: {L} faltou à própria luta. W.O. kkkk",
    ],
  };

  // ------------------------------------------------------------ estado
  const S = { region: "global", year: null, speed: 1 };
  let cfg, charts, totals, rounds = [], replay = null, raceChart = null, growthChart = null;
  const short = (i) => cfg.songs[i].short;
  const cls = (i) => (i ? "b" : "a");
  const span = (i) => `<span class="${cls(i)}">${short(i)}</span>`;

  // ------------------------------------------------------------ dados -> rounds
  const xmasYear = (iso) => { const [y, m] = iso.split("-").map(Number); return m >= 10 ? y : m <= 1 ? y - 1 : null; };
  // todos os dias de chart diário guardados (inclui Natais que pontuam pela régua semanal)
  const dailyOf = (i, region) => charts.songs?.[cfg.songs[i].key]?.daily?.[region || S.region] || [];
  const dailyPeak = (i, region) => dailyOf(i, region).reduce((m, r) => (!m || r[2] > m[2] ? r : m), null);
  const seriesOf = (i, region) => charts.songs?.[cfg.songs[i].key]?.[region || S.region] || [];

  function stats(rows) {
    if (!rows.length) return null;
    let total = 0, peak = rows[0], best = rows[0][1], ones = 0;
    for (const r of rows) {
      total += r[2];
      if (r[2] > peak[2]) peak = r;
      if (r[1] < best) best = r[1];
      if (r[1] === 1) ones++;
    }
    return { total, peak, best, ones, days: rows.length };
  }

  function buildRounds(region) {
    const years = new Set();
    [0, 1].forEach((i) => seriesOf(i, region).forEach(([d]) => { const y = xmasYear(d); if (y != null) years.add(y); }));
    const cur = xmasYear(TODAY);
    if (cur != null && years.size) years.add(cur);

    return [...years].sort((a, b) => a - b).map((year, idx) => {
      const ra = seriesOf(0, region).filter((r) => xmasYear(r[0]) === year);
      const rb = seriesOf(1, region).filter((r) => xmasYear(r[0]) === year);
      const a = stats(ra), b = stats(rb);
      const wk = charts.granularity?.[region || S.region]?.[year] === "weekly";
      const R = { year, n: idx + 1, ra, rb, a, b, wk, live: TODAY <= `${year + 1}-01-31`, w: null, kind: null, margin: 0, duel: [0, 0] };
      if (a && b) {
        R.w = a.total >= b.total ? 0 : 1;
        const [W, L] = R.w ? [b, a] : [a, b];
        R.margin = (W.total / L.total - 1) * 100;
        R.kind = R.margin >= 20 ? "ko" : R.margin >= 8 ? "clear" : R.margin >= 3 ? "close" : "photo";
        const mb = new Map(rb.map((r) => [r[0], r[2]]));
        ra.forEach((r) => { if (mb.has(r[0])) R.duel[r[2] > mb.get(r[0]) ? 0 : 1]++; });
      } else if (a || b) {
        R.w = a ? 0 : 1;
        R.kind = "wo";
      }
      R.line = verdictLine(R, region || S.region);
      return R;
    });
  }

  function verdictLine(R, region) {
    if (R.w == null) return "Natal em andamento e nenhuma das duas entrou no chart ainda. Tão no camarim fazendo babyliss.";
    const o = { W: short(R.w), L: short(1 - R.w), p: pct(R.margin) };
    if (R.live) {
      return R.kind === "wo"
        ? `AO VIVO: só ${o.W} chegou na festa até agora. ${o.L} tá atrasada(o) como sempre.`
        : `AO VIVO: ${o.W} tá na frente por ${o.p}, mas segura a peruca que até 31/01 tudo pode mudar.`;
    }
    return fill(pick(LINES[R.kind], `${region}${R.year}`), o);
  }

  // ------------------------------------------------------------ capa
  function countUp(el, to) {
    const from = +el.textContent || 0;
    if (REDUCE || from === to) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const doneOf = (rs) => rs.filter((r) => !r.live && r.w != null);
  const winsOf = (rs) => [0, 1].map((i) => doneOf(rs).filter((r) => r.w === i).length);

  function renderCover() {
    const done = doneOf(rounds);
    const wins = winsOf(rounds);
    countUp($("#sa"), wins[0]);
    countUp($("#sb"), wins[1]);
    const lead = wins[0] === wins[1] ? null : wins[0] > wins[1] ? 0 : 1;
    document.querySelectorAll(".portrait").forEach((p) => p.classList.toggle("leader", +p.dataset.side === lead));
    $("#score-sub").textContent = done.length ? `${cfg.regions[S.region].label} · ${done[0].year}-${done.at(-1).year}` : cfg.regions[S.region].label;

    // manchete
    const h = $("#headline");
    if (!done.length) {
      h.textContent = charts.songs && Object.keys(charts.songs).length
        ? "Nenhum Natal completo nessa região ainda. Paciência, bb."
        : "A revista tá na gráfica: falta só a primeira coleta de dados. Vai lá no Actions e aperta o botão.";
    } else {
      const last = done.at(-1).w;
      let streak = 0;
      for (let k = done.length - 1; k >= 0 && done[k].w === last; k--) streak++;
      const where = S.region === "br" ? "brasileiro" : "mundial";
      if (lead == null) {
        h.innerHTML = `Empatou?! ${wins[0]} a ${wins[1]}. Isso aqui tá mais disputado que comunidade do Orkut. ${span(last)} levou o último Natal${streak > 1 ? ` e vem de ${streak} seguidos` : ""}.`;
      } else if (lead === last) {
        h.innerHTML = `${span(lead)} manda no Natal ${where}${streak > 1 ? ` e tá invicta há ${streak} dezembros` : ""}. ${span(1 - lead)} que lute.`;
        if (lead === 1) h.innerHTML = h.innerHTML.replace("invicta", "invicto");
      } else {
        h.innerHTML = `${span(lead)} lidera a série, mas ${span(last)} levou o último Natal${streak > 1 ? ` (${streak} seguidos!)` : ""}. A peruca tá balançando.`;
      }
    }

    // chamadas dinâmicas da capa
    const surra = done.filter((r) => r.kind !== "wo").sort((x, y) => y.margin - x.margin)[0];
    $("#cl-surra").textContent = surra ? `${short(surra.w)} humilhou ${short(1 - surra.w)} em ${surra.year}` : "A maior surra da história";
    $("#cl-surra-dek").textContent = surra ? `${pct(surra.margin)} de vantagem. Até hoje tem gente de luto.` : "em breve, aguardem";

    const cur = rounds.find((r) => r.live);
    if (cur && cur.w != null) {
      $("#cl-live-kick").textContent = "Ao vivo";
      $("#cl-live").textContent = `Natal ${cur.year}: ${short(cur.w)} na frente`;
    } else {
      $("#cl-live-kick").textContent = "Vem aí";
      $("#cl-live").textContent = cur ? `Natal ${cur.year}: as divas tão no camarim` : "O próximo Natal";
    }

    // polêmica: o Brasil discorda do mundo?
    const other = S.region === "br" ? "global" : "br";
    const ow = winsOf(buildRounds(other));
    const olead = ow[0] === ow[1] ? null : ow[0] > ow[1] ? 0 : 1;
    const big = $("#cl-region-big"), dek = $("#cl-region-dek");
    if (olead == null || lead == null) { big.textContent = "Mundo x Brasil"; dek.textContent = "troca a aba lá em cima e vê o babado"; }
    else if (olead === lead) { big.textContent = `Mundo e Brasil concordam: ${short(lead)}`; dek.textContent = "unanimidade, coisa rara nessa internet"; }
    else { big.textContent = `O Brasil discorda do mundo!`; dek.textContent = `lá fora é ${short(S.region === "br" ? olead : lead)}, aqui é ${short(S.region === "br" ? lead : olead)}. polêmica!`; }
  }

  // ------------------------------------------------------------ plantão (letreiro)
  function renderTicker() {
    const items = rounds.filter((r) => r.w != null).slice().reverse()
      .map((r) => `<span><b>Natal ${r.year}${r.live ? " ao vivo" : ""}</b>${r.line}</span>`);
    const all = [0, 1].map((i) => [i, dailyPeak(i)]).filter(([, p]) => p);
    if (all.length) {
      const [i, p] = all.reduce((m, x) => (x[1][2] > m[1][2] ? x : m));
      items.unshift(`<span><b>Recorde</b>Maior dia já registrado nessa região: ${short(i)}, ${nf.format(p[2])} streams em ${fmtD(p[0], true)}. Isso é que é hino.</span>`);
    }
    if (!items.length) items.push("<span><b>Plantão</b>As divas tão no camarim. O babado começa depois da primeira coleta de dados.</span>");
    $("#ticker").innerHTML = items.join("") + items.join(""); // duplicado pro loop não ter buraco
  }

  // ------------------------------------------------------------ polaroids
  const TILT = [-3, 2, -1.5, 3, -2.5, 1.5, -1, 2.5];
  function renderRounds() {
    const box = $("#rounds");
    box.innerHTML = rounds.map((r, k) => {
      const share = r.a && r.b ? (r.a.total / (r.a.total + r.b.total)) * 100 : r.a ? 100 : r.b ? 0 : 50;
      const sticker = r.live
        ? '<span class="burst verdict live">Ao vivo</span>'
        : r.kind ? `<span class="burst verdict ${r.kind}">${KIND[r.kind]}</span>` : "";
      const who = r.w == null ? "aguardando..." : `${r.live ? "" : CROWN}${short(r.w)}`;
      const cap = `<span class="a">${r.a ? nfc.format(r.a.total) : "--"}</span> x <span class="b">${r.b ? nfc.format(r.b.total) : "--"}</span>`;
      return `<button type="button" class="round ${r.w == null ? "empty-round" : r.w ? "w-b" : "w-a"}" data-year="${r.year}"
          aria-pressed="${r.year === S.year}" aria-label="Natal ${r.year}" style="--r:${TILT[k % TILT.length]}deg;--d:${k * 70}ms">
          ${sticker}
          <span class="photo"><span class="rn">Round ${r.n}</span><span class="yr">${r.year}</span><span class="who">${who}</span></span>
          <span class="tug"><i data-p="${share.toFixed(1)}"></i></span>
          <span class="caption">${cap}</span></button>`;
    }).join("") || '<p class="empty">Nenhum round ainda. A revista sai depois da primeira coleta.</p>';
    requestAnimationFrame(() => requestAnimationFrame(() =>
      box.querySelectorAll(".tug i").forEach((i) => (i.style.width = i.dataset.p + "%"))));
  }

  function selectRound(year, autoplay) {
    S.year = year;
    document.querySelectorAll(".round").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.year === year));
    buildReplay(autoplay);
  }

  // ------------------------------------------------------------ o barraco ao vivo
  function buildReplay(autoplay) {
    stopReplay();
    const R = rounds.find((r) => r.year === S.year);
    if (!R || (!R.a && !R.b)) {
      $("#replay-title").textContent = R ? `O barraco do Natal ${R.year}` : "O barraco";
      $("#narrator").textContent = R ? R.line : "Sem barraco pra mostrar ainda. Volta depois, bb.";
      $("#lanes").innerHTML = ""; $("#log").innerHTML = "";
      $("#clock-date").textContent = "--/--"; $("#clock-day").textContent = "";
      if (raceChart) { raceChart.destroy(); raceChart = null; }
      return;
    }

    const dates = [...R.ra, ...R.rb].map((r) => r[0]).sort();
    const axis = [];
    if (R.wk) axis.push(...new Set(dates)); // semanal: um passo por semana de chart
    else for (let d = dates[0]; d <= dates.at(-1); d = addDays(d, 1)) axis.push(d);
    const maps = [R.ra, R.rb].map((rows) => new Map(rows.map((r) => [r[0], r])));
    const daily = maps.map((m) => axis.map((d) => (m.get(d) ? m.get(d)[2] : null)));
    const cum = daily.map((arr) => { let s = 0; return arr.map((v) => (s += v || 0)); });

    // os lances, em formato de tweet
    const events = axis.map(() => []);
    const seen = [false, false], topped = [false, false];
    let leader = null;
    axis.forEach((d, k) => {
      [0, 1].forEach((i) => {
        const r = maps[i].get(d);
        if (r && !seen[i]) {
          seen[i] = true;
          events[k].push([i, i === 0 && ["10", "11"].includes(d.slice(5, 7)) // o meme do descongelamento, óbvio
            ? `${short(i)} DESCONGELOU. Entrou no Top 200 em #${r[1]}. Acabou o sossego.`
            : `${short(i)} entrou no Top 200 em #${r[1]}. Chegou chegando.`]);
        }
        if (r && r[1] === 1 && !topped[i]) { topped[i] = true; events[k].push([i, `${short(i)} chegou no #1. Senta que lá vem coroa.`]); }
      });
      if (seen[0] && seen[1]) {
        const now = cum[0][k] === cum[1][k] ? leader : cum[0][k] > cum[1][k] ? 0 : 1;
        if (leader === null) events[k].push([now, `${short(now)} saiu na frente. ${short(1 - now)} ainda tá fazendo o babyliss.`]);
        else if (now !== leader) events[k].push([now, `VIRADA!!! ${short(now)} passou ${short(1 - now)} no acumulado e eu tô passada.`]);
        leader = now;
      }
    });
    [0, 1].forEach((i) => {
      const s = i ? R.b : R.a;
      if (s) events[axis.indexOf(s.peak[0])].push([i, `PICO: ${short(i)} fez ${nf.format(s.peak[2])} streams ${R.wk ? "numa semana só" : "num dia só"}. Isso é que é hino.`]);
    });
    if (!R.live && R.w != null) events[axis.length - 1].push([R.w, `FIM. ${R.line}`]);

    replay = { R, axis, daily, cum, events, i: axis.length - 1, max: Math.max(cum[0].at(-1), cum[1].at(-1), 1) };

    $("#replay-title").innerHTML = `O barraco do <mark>Natal ${R.year}</mark>`;
    $("#race-note").textContent = `streams por ${R.wk ? "semana" : "dia"}, amor${R.wk ? " (esse Natal só tem chart semanal)" : ""}. linha que some = fora do Top 200`;
    $("#lanes").innerHTML = [0, 1].map((i) =>
      `<div class="lane" data-side="${i}"><span class="who">${CROWN}${short(i)}</span><div class="bar"><i></i><span>0</span></div></div>`).join("");
    $("#scrub").max = axis.length - 1;

    if (raceChart) raceChart.destroy();
    const ink = css("--muted");
    const ymax = Math.max(...daily.flat().filter((v) => v != null));
    raceChart = new Chart($("#race-chart"), {
      type: "line",
      data: {
        labels: axis,
        datasets: [0, 1].map((i) => ({
          label: `${short(i)} · ${cfg.songs[i].title}`, data: daily[i].slice(),
          borderColor: colorOf(i), backgroundColor: colorOf(i) + "2E", fill: "origin",
          borderWidth: 3, pointRadius: 0, pointHoverRadius: 5, tension: 0.35,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: ink, usePointStyle: true, boxWidth: 8, font: { family: "Nunito", weight: "700" } } },
          tooltip: { callbacks: {
            title: (it) => fmtD(it[0].label, true),
            label: (it) => `${short(it.datasetIndex)}: ${it.raw == null ? "fora do chart (vergonha)" : nf.format(it.raw) + " streams"}`,
          } },
        },
        scales: {
          x: { ticks: { color: ink, maxRotation: 0, autoSkipPadding: 16, callback: (v) => fmtD(axis[v]) }, grid: { display: false } },
          y: { min: 0, max: Math.ceil(ymax * 1.08), ticks: { color: ink, callback: (v) => nfc.format(v) }, grid: { color: "rgba(255, 31, 142, .12)" } },
        },
      },
    });

    if (autoplay && !REDUCE) { drawFrame(0, true); playReplay(); } else drawFrame(replay.i, true);
  }

  // tweet de 2009: "há X dias via web"
  const tweet = (k, i, t) => {
    const ago = Math.max(0, replay.axis.length - 1 - k);
    return `<li class="${cls(i)}"><b>@fofoqueira_natal</b> ${t}<small>${fmtD(replay.axis[k], true)} · ${ago ? `há ${ago} ${replay.R.wk ? "semana" : "dia"}${ago > 1 ? "s" : ""} do fim` : "agorinha"} via web</small></li>`;
  };

  function drawFrame(k, rebuildLog) {
    const P = replay;
    if (!P) return;
    P.i = k;
    const { axis, cum, daily, events } = P;
    $("#scrub").value = k;
    $("#clock-unit").textContent = P.R.wk ? "semana até" : "dia";
    $("#clock-date").textContent = fmtD(axis[k]);
    $("#clock-day").textContent = `${axis[k].slice(0, 4)} · ${k + 1} de ${axis.length}`;

    const lead = cum[0][k] === cum[1][k] ? null : cum[0][k] > cum[1][k] ? 0 : 1;
    document.querySelectorAll(".lane").forEach((lane) => {
      const i = +lane.dataset.side;
      lane.querySelector("i").style.width = (cum[i][k] / P.max) * 100 + "%";
      lane.querySelector(".bar span").textContent = cum[i][k] ? nfc.format(cum[i][k]) : "fora do chart";
      lane.classList.toggle("lead", lead === i);
    });

    if (raceChart) {
      raceChart.data.datasets.forEach((ds, i) => { ds.data = daily[i].map((v, j) => (j <= k ? v : null)); });
      raceChart.update("none");
    }

    const log = $("#log");
    if (rebuildLog) {
      const past = [];
      events.slice(0, k + 1).forEach((ev, j) => ev.forEach((e) => past.push([j, e])));
      log.innerHTML = past.slice(-5).reverse().map(([j, [i, t]]) => tweet(j, i, t)).join("");
      $("#narrator").textContent = k === axis.length - 1 ? P.R.line : past.length ? past.at(-1)[1][1] : "Apaga a luz que o barraco vai começar.";
    } else if (events[k].length) {
      events[k].forEach(([i, t]) => { log.insertAdjacentHTML("afterbegin", tweet(k, i, t)); $("#narrator").textContent = t; });
      while (log.children.length > 5) log.lastElementChild.remove();
    }
  }

  function playReplay() {
    const P = replay;
    if (!P) return;
    if (P.i >= P.axis.length - 1) drawFrame(0, true);
    $("#play").textContent = "Pausar o babado";
    P.timer = setInterval(() => {
      if (P.i >= P.axis.length - 1) { stopReplay(); $("#play").textContent = "Ver de novo (viciada)"; return; }
      drawFrame(P.i + 1, false);
    }, 150 / S.speed);
  }
  function stopReplay() {
    if (replay && replay.timer) { clearInterval(replay.timer); replay.timer = null; }
    $("#play").textContent = "Assistir ao barraco";
  }

  // ------------------------------------------------------------ raio-x
  function renderXray() {
    const done = doneOf(rounds);
    const agg = [0, 1].map((i) => {
      const ss = rounds.map((r) => (i ? r.b : r.a)).filter(Boolean);
      return {
        wins: done.filter((r) => r.w === i).length,
        total: ss.reduce((s, x) => s + x.total, 0),
        peak: dailyPeak(i)?.[2] || 0,
        ones: ss.reduce((s, x) => s + x.ones, 0),
        duel: rounds.reduce((s, r) => s + r.duel[i], 0),
        ko: done.filter((r) => r.w === i && r.kind === "ko").length,
      };
    });
    const rows = [
      ["wins", "Natais vencidos", (v) => v],
      ["total", "Streams em chart", (v) => nfc.format(v)],
      ["peak", "Maior dia", (v) => (v ? nfc.format(v) : "--")],
      ["ones", "Vezes em #1", (v) => v],
      ["duel", "Duelos diretos", (v) => v],
      ["ko", "Humilhações", (v) => v],
    ];
    $("#tape-sub").textContent = `Todos os Natais somados, Top 200 ${cfg.regions[S.region].label}. Os números não mentem, já as divas...`;
    $(".xray-names .a").textContent = short(0);
    $(".xray-names .b").textContent = short(1);
    $("#tape").innerHTML = rows.map(([k, label, f]) => {
      const a = agg[0][k], b = agg[1][k], m = Math.max(a, b) || 1;
      return `<div class="tape-row">
        <div class="half l ${a > b ? "win" : ""}"><i data-w="${(a / m) * 100}"></i><b>${f(a)}</b></div>
        <span class="label">${label}</span>
        <div class="half r ${b > a ? "win" : ""}"><i data-w="${(b / m) * 100}"></i><b>${f(b)}</b></div></div>`;
    }).join("");
    requestAnimationFrame(() => requestAnimationFrame(() =>
      document.querySelectorAll(".half i").forEach((i) => (i.style.width = `max(4px, calc(${i.dataset.w}% - 80px))`))));

    $("#best").innerHTML = [0, 1].map((i) => {
      const mine = done.filter((r) => r.w === i && r.kind !== "wo").sort((x, y) => y.margin - x.margin)[0];
      return `<div><small>A maior surra que ${short(i)} já deu</small>${mine
        ? `Natal ${mine.year}: ${KIND[mine.kind].toLowerCase()} por ${pct(mine.margin)}. ${mine.kind === "ko" ? "Sem dó." : "Educadamente."}`
        : "Nunca humilhou ninguém. Fofa demais pra isso, ou fraca mesmo?"}</div>`;
    }).join("");
  }

  // ------------------------------------------------------------ teste (o mais importante, obviamente)
  const QUIZ = [
    ["Sua vibe na ceia é:", "Vestido de paetê e agudo no salto", "Jaqueta jeans, topete e sofrência"],
    ["Seu ex te manda mensagem no Natal. Você:", "Visualiza e posta foto arrasando", "Escreve textão no Fotolog ouvindo música triste"],
    ["Seu presente ideal:", "Qualquer coisa, desde que brilhe e custe caro", "Uma mixtape gravada à mão, com dedicatória"],
    ["Em novembro você:", "Já montou a árvore no dia 1º, e daí?", "Só aceita Natal depois de dezembro, tenha respeito"],
    ["Seu status no MSN:", "~*~ diva demais pra vc ~*~", "(L) ouvindo músicas tristes (L)"],
  ];
  const RESULT = [
    ["Time Mariah", "Escândalo, agudo e zero humildade. Você não entra no Natal, o Natal entra em você. A árvore é montada em novembro e quem não gostou que se mude."],
    ["Time Wham!", "Sofrência elegante, nostalgia e coração partido com estilo. Você chora, mas chora bonito, de jaqueta jeans e olhando pela janela do ônibus."],
  ];
  function renderQuiz() {
    const form = $("#quiz-form");
    form.innerHTML = QUIZ.map(([q, a, b], n) => `<fieldset><legend><span>${n + 1}.</span>${q}</legend><div class="opts">
        <label class="opt"><input type="radio" name="q${n}" value="0">${a}</label>
        <label class="opt"><input type="radio" name="q${n}" value="1">${b}</label></div></fieldset>`).join("")
      + `<div class="quiz-actions"><button class="glossy" type="submit">Ver resultado</button><span class="hint" id="quiz-hint"></span></div>`;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const ans = QUIZ.map((_, n) => form.querySelector(`input[name=q${n}]:checked`));
      if (ans.some((x) => !x)) { $("#quiz-hint").textContent = "Responde tudo, preguiçosa. Faltou pergunta."; return; }
      $("#quiz-hint").textContent = "";
      const score = ans.reduce((s, x) => s + +x.value, 0);
      const side = score >= 3 ? 1 : 0;
      const [title, txt] = RESULT[side];
      track(`teste-${side ? "wham" : "mariah"}`, `Teste: deu ${title}`);
      const box = $("#quiz-result");
      box.className = `quiz-result ${cls(side)}`;
      box.hidden = false;
      const share = `Fiz o teste da BAPHO! e deu ${title.toUpperCase()}. E vc, é time Mariah ou time Wham!? ${location.href.split("#")[0]}#teste`;
      box.innerHTML = `<small>Você é</small><h3>${title}!</h3><p>${txt}</p>
        <span class="tabs"><button type="button" id="share">Copiar pro Twitter</button><button type="button" id="redo">Refazer</button></span>`;
      $("#share").addEventListener("click", async (ev) => {
        try { await navigator.clipboard.writeText(share); ev.target.textContent = "Copiado! Agora posta"; track("teste-compartilhou", "Teste: copiou pra postar"); }
        catch { ev.target.textContent = "Seu navegador não deixou :("; }
      });
      $("#redo").addEventListener("click", () => { form.reset(); box.hidden = true; form.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth" }); });
      box.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth", block: "center" });
    });
  }

  // ------------------------------------------------------------ fofoca de bastidor
  function renderTotals() {
    const snaps = totals.snapshots || [];
    const last = snaps.at(-1);
    const empty = $("#growth-empty");
    if (!last) {
      $("#totals").innerHTML = "";
      empty.hidden = false;
      empty.textContent = "Ainda sem fofoca: os totais aparecem depois da primeira coleta.";
      return;
    }
    const v = (x) => (x == null ? "-" : nf.format(x));
    $("#totals").innerHTML = `<thead><tr><th>Diva</th><th>Spotify</th><th>YouTube</th><th>Soma</th><th>Spotify ontem</th></tr></thead><tbody>${
      cfg.songs.map((s, i) => {
        const r = last.songs[s.key] || {};
        const sum = (r.spotify_total || 0) + (r.youtube_views || 0);
        return `<tr><td><span class="dot" style="background:${colorOf(i)}"></span>${s.short} · ${s.title}</td>
          <td>${v(r.spotify_total)}</td><td>${v(r.youtube_views)}</td><td class="sum">${sum ? nf.format(sum) : "-"}</td><td>${v(r.spotify_daily)}</td></tr>`;
      }).join("")}</tbody>`;

    if (growthChart) { growthChart.destroy(); growthChart = null; }
    if (snaps.length < 2) {
      empty.hidden = false;
      empty.textContent = `Retrato de ${fmtD(last.date, true)}. O gráfico de crescimento aparece a partir do segundo dia de coleta.`;
      return;
    }
    empty.hidden = true;
    const labels = snaps.slice(1).map((s) => s.date);
    const ink = css("--muted");
    growthChart = new Chart($("#growth"), {
      type: "line",
      data: {
        labels,
        datasets: cfg.songs.map((s, i) => ({
          label: s.short,
          data: snaps.slice(1).map((cur, k) => {
            const p = snaps[k].songs[s.key] || {}, c = cur.songs[s.key] || {};
            const days = Math.max(1, (new Date(cur.date) - new Date(snaps[k].date)) / 864e5);
            if (c.spotify_total == null || p.spotify_total == null) return null;
            const yt = c.youtube_views != null && p.youtube_views != null ? c.youtube_views - p.youtube_views : 0;
            return Math.round((c.spotify_total - p.spotify_total + yt) / days);
          }),
          borderColor: colorOf(i), backgroundColor: colorOf(i), borderWidth: 3, pointRadius: 3, tension: 0.35,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: ink, usePointStyle: true, boxWidth: 8 } },
          title: { display: true, text: "Novos streams + views por dia (Spotify + YouTube)", color: ink, align: "start" },
          tooltip: { callbacks: { title: (it) => fmtD(it[0].label, true), label: (it) => `${it.dataset.label}: ${it.raw == null ? "-" : nf.format(it.raw)}` } },
        },
        scales: {
          x: { ticks: { color: ink, maxRotation: 0, callback: (v) => fmtD(labels[v]) }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: ink, callback: (v) => nfc.format(v) }, grid: { color: "rgba(15, 168, 224, .12)" } },
        },
      },
    });
  }

  // ------------------------------------------------------------ rastro de brilho no mouse. 2009 nunca morreu.
  function sparkleTrail() {
    if (REDUCE || !matchMedia("(pointer: fine)").matches) return;
    let last = 0;
    addEventListener("pointermove", (e) => {
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      const s = document.createElement("span");
      s.className = "trail";
      s.style.left = e.clientX - 7 + "px";
      s.style.top = e.clientY - 7 + "px";
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 700);
    });
  }

  // ------------------------------------------------------------ orquestra (a regente sou eu)
  function renderRegion() {
    rounds = buildRounds();
    const done = doneOf(rounds);
    if (!rounds.some((r) => r.year === S.year)) S.year = (done.at(-1) || rounds.at(-1) || {}).year ?? null;
    renderCover();
    renderTicker();
    renderRounds();
    renderXray();
    buildReplay(false);
  }

  // ------------------------------------------------------------ contador de visitas (GoatCounter, sem cookies)
  // liga quando config.json tiver "goatcounter": "<código>"; eventos aparecem no painel como páginas
  function loadCounter() {
    const code = (cfg.goatcounter || "").trim();
    if (!code || /^(localhost|127\.)/.test(location.hostname)) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
    document.head.appendChild(s);
  }
  const track = (path, title) => {
    try { window.goatcounter?.count?.({ path, title, event: true }); } catch { /* contador é opcional */ }
  };

  async function init() {
    [cfg, charts, totals] = await Promise.all([
      getJSON("config.json", null),
      getJSON("data/charts.json", { songs: {} }),
      getJSON("data/totals.json", { snapshots: [] }),
    ]);
    if (!cfg) { $("#headline").textContent = "config.json sumiu. Quem apagou? Confessa."; return; }
    loadCounter();

    document.querySelectorAll(".portrait").forEach((p) => {
      const s = cfg.songs[+p.dataset.side];
      p.querySelector(".name").textContent = s.short;
      p.querySelector(".alias").textContent = s.alias;
      p.setAttribute("aria-label", `${s.artist}, ${s.title}`);
    });

    const upd = [charts.updated, totals.updated].filter(Boolean).sort().pop();
    $("#updated").textContent = (upd
      ? `Atualizado em ${new Date(upd).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}. `
      : "Ainda sem dados: rode o workflow de coleta uma vez. ")
      + "Fontes: Spotify Charts (via kworb.net) e YouTube Data API."
      + (cfg.goatcounter ? " Visitas contadas pelo GoatCounter, sem cookies e sem dado pessoal." : "");

    $("#region").innerHTML = Object.entries(cfg.regions)
      .map(([k, r]) => `<button type="button" data-v="${k}" aria-pressed="${k === S.region}">${r.label}</button>`).join("");
    $("#region").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.dataset.v === S.region) return;
      S.region = b.dataset.v;
      track(`regiao-${S.region}`, `Trocou para ${cfg.regions[S.region].label}`);
      $("#region").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      renderRegion();
    });

    $("#rounds").addEventListener("click", (e) => {
      const b = e.target.closest(".round");
      if (!b) return;
      selectRound(+b.dataset.year, true);
      $("#barraco").scrollIntoView({ behavior: REDUCE ? "auto" : "smooth", block: "start" });
    });
    $("#play").addEventListener("click", () => {
      if (replay && replay.timer) return stopReplay();
      track(`barraco-${S.year}`, `Assistiu ao barraco de ${S.year}`);
      playReplay();
    });
    $("#speed").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      S.speed = +b.dataset.v;
      $("#speed").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      if (replay && replay.timer) { stopReplay(); playReplay(); }
    });
    $("#scrub").addEventListener("input", (e) => { stopReplay(); drawFrame(+e.target.value, true); });

    renderRegion();
    renderQuiz();
    renderTotals();
    sparkleTrail();
  }

  init();
})();
