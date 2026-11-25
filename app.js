/* ============================================================
   围棋死活大师 · 过关斩将 · 逻辑（两个难度 + 孩子档案 + 轮次 + 日常）

   结构：
     · 级位（Shds1→3，900 题）、段位（Shds4→5，600 题）两个入口
     · 每关 10 题，允许错 1 题；每题只限第一步
     · 轮次：第 1 轮 100 题（10 关），第 2 轮 200 题（20 关）……每轮从第 1 关重来
     · 孩子档案：每个孩子级位/段位进度、今日统计、活跃地图、错题集各存各的
   ============================================================ */

const DEV = new URLSearchParams(location.search).has("dev");
const KEY = DEV ? "gshj_v7_dev" : "gshj_v7";
const N_TI = 10;              // 每关题数
const ROUND_UNIT = 100;       // 每轮递增题数（第 n 轮 n×100）

const LEVELS = [
  { nm: "级位", g: 0, icon: "flower", c: "#c8892f", cd: "#8a4f20", bg: "#f9f1e2" },
  { nm: "段位", g: 1, icon: "leaf", c: "#4f7a3f", cd: "#2f5426", bg: "#eef4ea" }
];

/* ---------- 存档 ---------- */
function blankLv() { return { round: 1, done: 0, guanDone: 0, wrong: 0, plays: 0, active: false, left: 0, bestRound: 0 }; }
function blankDay() { return { d: "", n: 0, sec: 0, fo: 0, fa: 0 }; }
function blankStat() { return { guans: 0, runs: 0, timeout: 0, wrong: 0, ok: 0 }; }
let SEQ = 1;
function newProfile(name) {
  return { id: SEQ++, name: name || "孩子 1", lv: [blankLv(), blankLv()], today: blankDay(), hist: {}, wrong: [], stat: blankStat() };
}
function fresh() {
  SEQ = 1;
  return {
    v: 7, cur: 0, sel: 0, limit: 60, mode: "time", min: 10, bonus: 0,
    profiles: [newProfile("孩子 1")], sfx: { on: true, vol: 0.45 }, auto: false
  };
}
function normLv(L) {
  const x = L || {};
  let done = x.done | 0, round = x.round | 0;
  if (!round) {                        // v6：guan/ti → done，轮次按 100 题一段
    done = (x.guan | 0) * N_TI + (x.ti | 0);
    round = Math.floor(done / ROUND_UNIT) + 1;
  }
  return {
    round: Math.max(1, round || 1),
    done: Math.max(0, done),
    guanDone: Math.max(0, Math.min(N_TI, (x.guanDone != null ? x.guanDone : ((x.guan || 0) * N_TI + (x.ti || 0))) % N_TI)),
    wrong: Math.max(0, Math.min(N_TI, x.wrong | 0)),
    plays: Math.max(0, x.plays | 0),
    active: !!x.active,
    left: Math.max(0, x.left | 0),
    bestRound: Math.max(0, (x.bestRound | 0) || round || 1)
  };
}
function normalize(o) {
  if (!o || typeof o !== "object") return fresh();
  if (o.v === 6 && Array.isArray(o.profiles)) {
    const p = o.profiles[0] || {};
    const pr = newProfile(p.name || "孩子 1");
    pr.lv = [normLv((p.lv || [])[0]), normLv((p.lv || [])[1])];
    pr.stat = Object.assign(blankStat(), p.stat);
    return {
      v: 7, cur: 0, sel: 0, limit: [15, 30, 60].includes(o.limit) ? o.limit : 60,
      mode: "time", min: 10, bonus: 0, profiles: [pr],
      sfx: Object.assign({ on: true, vol: 0.45 }, o.sfx), auto: o.auto === true
    };
  }
  if (o.v === 5 && Array.isArray(o.slots)) {          // 更老的六书签
    const pick = arr => arr.reduce((a, b) => (b.best > a.best ? b : a), arr[0]);
    const pr = newProfile("孩子 1");
    pr.lv = [normLv(pick(o.slots.slice(0, 3))), normLv(pick(o.slots.slice(3, 6)))];
    pr.stat = Object.assign(blankStat(), o.stat);
    return {
      v: 7, cur: 0, sel: 0, limit: [15, 30, 60].includes(o.limit) ? o.limit : 60,
      mode: "time", min: 10, bonus: 0, profiles: [pr],
      sfx: Object.assign({ on: true, vol: 0.45 }, o.sfx), auto: o.auto === true
    };
  }
  if (o.v !== 7 || !Array.isArray(o.profiles) || !o.profiles.length) return fresh();
  const out = {
    v: 7, cur: 0, sel: 0,
    limit: [15, 30, 60].includes(o.limit) ? o.limit : 60,
    mode: o.mode === "free" ? "free" : "time",
    min: Math.max(5, Math.min(60, o.min | 0 || 10)),
    bonus: Math.max(0, o.bonus | 0),
    sfx: Object.assign({ on: true, vol: 0.45 }, o.sfx || {}),
    auto: o.auto === true,
    profiles: o.profiles.map(pr => {
      const p = newProfile(String(pr.name || "孩子").slice(0, 12));
      p.id = pr.id | 0 || p.id;
      p.lv = [normLv((pr.lv || [])[0]), normLv((pr.lv || [])[1])];
      p.today = Object.assign(blankDay(), pr.today || {});
      p.hist = (pr.hist && typeof pr.hist === "object") ? pr.hist : {};
      p.wrong = Array.isArray(pr.wrong) ? pr.wrong.slice(0, 100) : [];
      p.stat = Object.assign(blankStat(), pr.stat || {});
      return p;
    })
  };
  out.cur = Math.max(0, Math.min(out.profiles.length - 1, o.cur | 0));
  out.sel = Math.max(0, Math.min(1, o.sel | 0));
  out.profiles.forEach(p => { SEQ = Math.max(SEQ, p.id + 1); });
  return out;
}
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return fresh(); }
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const prof = () => S.profiles[S.cur];
const slotState = () => prof().lv[S.sel];
const bank = () => DATA[S.sel].p;
const bankLen = () => bank().length;
const maxRound = () => Math.max(1, Math.ceil(bankLen() / ROUND_UNIT));
const targetOf = (round) => Math.min(round * ROUND_UNIT, bankLen());
const guanNo = L => Math.floor((L.done - L.guanDone) / N_TI) + 1;
const tiNo = L => L.guanDone + 1;
const correctOf = L => L.guanDone - L.wrong;

// 这个难度是否已全部走完（轮次/关都是自动推进的，走完了就不再往下推）
function clearedOf(L, gi) {
  const g = gi == null ? S.sel : gi;
  const len = DATA[g].p.length;
  return L.round >= Math.max(1, Math.ceil(len / ROUND_UNIT)) &&
         L.done >= Math.min(L.round * ROUND_UNIT, len);
}
// 通关后关号会算到 91/61 这种越界值，这里收回到最后一关
const guanShown = (L, gi) => {
  const g = gi == null ? S.sel : gi;
  return clearedOf(L, g) ? Math.ceil(DATA[g].p.length / N_TI) : guanNo(L);
};

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function ensureToday() {
  const p = prof();
  if (!p.today || p.today.d !== todayStr()) p.today = blankDay(), p.today.d = todayStr();
  if (!p.hist[todayStr()]) p.hist[todayStr()] = { n: 0, sec: 0 };
}
function addSec(sec) {
  const p = prof();
  ensureToday();
  p.today.sec += Math.max(0, Math.round(sec));
  const h = p.hist[todayStr()] || (p.hist[todayStr()] = { n: 0, sec: 0 });
  h.sec = p.today.sec;
}

/* ---------- 图标 ---------- */
function flowerSVG() {
  let petals = "";
  for (let i = 0; i < 5; i++) {
    petals += `<ellipse class="fl-petal" cx="0" cy="-8.6" rx="5.2" ry="7.6" transform="rotate(${i * 72})"/>`;
  }
  return `<svg viewBox="0 0 52 44" aria-hidden="true"><g transform="translate(26,22.5)">${petals}
    <circle class="fl-core" cx="0" cy="0" r="3.8"/></g></svg>`;
}
function leafSVG() {
  return `<svg viewBox="0 0 52 44" aria-hidden="true">
    <path class="lf-body" d="M26 4.5 C39 13 39.5 28 26 39.5 C12.5 28 13 13 26 4.5 Z"/>
    <path class="lf-rib" d="M26 9.5 L26 35"/></svg>`;
}

/* ---------- 首页 ---------- */
function lvSub(L, gi) {
  if (clearedOf(L, gi)) return "第 " + L.round + " 轮 · " + totalGuan(gi) + " 关全部通关";
  if (L.active) return "第 " + L.round + " 轮 · 第 " + guanNo(L) + " 关";
  if (L.bestRound > 0 && (L.done > 0 || L.plays > 0)) return "最佳 第 " + L.bestRound + " 轮";
  return "未开始";
}
function renderLevels() {
  const box = $("levels");
  box.innerHTML = "";
  LEVELS.forEach((lv, i) => {
    const L = prof().lv[i];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lvcard" + (S.sel === i ? " sel" : "");
    b.style.setProperty("--c", lv.c);
    b.style.setProperty("--cd", lv.cd);
    b.style.setProperty("--bg", lv.bg);
    b.innerHTML = (lv.icon === "flower" ? flowerSVG() : leafSVG()) +
      `<b>${lv.nm}</b><span class="p">${lvSub(L, i)}</span>` +
      `<span class="m">共 ${totalGuan(i)} 关</span>`;
    b.onclick = () => {
      if (S.sel === i) return;
      S.sel = i;
      save(); renderHome();
    };
    box.appendChild(b);
  });
}
const totalGuan = i => Math.ceil(DATA[i].p.length / N_TI);

function renderWho() {
  $("whoName").textContent = prof().name;
  const panel = $("whoPanel");
  panel.innerHTML = "";
  S.profiles.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "prow" + (i === S.cur ? " on" : "");
    const sum = LEVELS.map((lv, k) => {
      const L = p.lv[k];
      return lv.nm + (clearedOf(L, k) ? " 第" + L.round + "轮 全通关"
        : (L.active ? " 第" + L.round + "轮 第" + guanNo(L) + "关" : (L.bestRound ? " 第" + L.bestRound + "轮" : " 未开始")));
    }).join(" · ");
    row.innerHTML = `<span class="pn">${p.name}</span><span class="pm">${sum}</span>`;
    row.onclick = e => {
      if (e.target.classList.contains("px")) return;
      S.cur = i; save(); panel.classList.add("hide"); renderHome();
    };
    const ren = document.createElement("button");
    ren.className = "px"; ren.textContent = "改名";
    ren.onclick = () => {
      const n = prompt("改成什么名字？", p.name);
      if (n === null) return;
      const t = n.trim().slice(0, 12);
      if (!t) return;
      p.name = t; save(); renderHome();
    };
    const del = document.createElement("button");
    del.className = "px"; del.textContent = "删除";
    del.onclick = () => {
      if (S.profiles.length <= 1) { alert("至少留一个档案"); return; }
      if (!confirm("删除「" + p.name + "」的档案和全部进度？")) return;
      S.profiles.splice(i, 1);
      S.cur = Math.min(S.cur, S.profiles.length - 1);
      save(); renderHome();
    };
    row.appendChild(ren); row.appendChild(del);
    panel.appendChild(row);
  });
  const add = document.createElement("button");
  add.className = "padd";
  add.textContent = "＋ 新增一个孩子";
  add.onclick = () => {
    const n = prompt("孩子的名字？", "孩子" + (S.profiles.length + 1));
    if (n === null) return;
    const t = n.trim().slice(0, 12);
    if (!t) return;
    S.profiles.push(newProfile(t));
    S.cur = S.profiles.length - 1;
    save(); renderHome();
    $("whoPanel").classList.remove("hide");
  };
  panel.appendChild(add);
}

function renderToday() {
  const p = prof();
  ensureToday();
  const fo = p.today.fo, fa = p.today.fa;
  $("tdN").textContent = p.today.n;
  $("tdMin").textContent = Math.round(p.today.sec / 60);
  $("tdFirst").textContent = (fo + fa) ? Math.round(100 * fo / (fo + fa)) + "%" : "—";
  $("modeSeg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.m === S.mode));
  $("rowMin").classList.toggle("hide", S.mode !== "time");
  $("numMin").value = S.min;
  $("modeSeg").parentElement.parentElement.querySelectorAll("[data-min]").forEach(() => {});
  document.querySelectorAll("#rowMin [data-min]").forEach(b => b.classList.toggle("on", +b.dataset.min === S.min));
  const quota = S.min * 60 + S.bonus;
  $("todayHint").textContent = S.mode === "free"
    ? "自由模式：想做多久做多久"
    : "今天已做 " + Math.round(p.today.sec / 60) + " 分钟 / 共 " + Math.round(quota / 60) + " 分钟";
}

function days_in_month(y, m) { return new Date(y, m + 1, 0).getDate(); }
function renderCal12() {
  const p = prof();
  ensureToday();
  const cal = $("cal");
  cal.innerHTML = "";
  cal.classList.add("rolling");
  const end = new Date();
  for (let i = 83; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const n = (p.hist[key] && p.hist[key].n) || 0;
    const cls = n === 0 ? "lv0" : n <= 10 ? "lv1" : n <= 20 ? "lv2" : n <= 30 ? "lv3" : n <= 50 ? "lv4" : "lv5";
    const cell = document.createElement("div");
    cell.className = "cell " + cls + (key === todayStr() ? " cur" : "");
    cell.title = key + " · " + n + " 题";
    cell.innerHTML = `<span>${d.getDate()}</span>`;
    cal.appendChild(cell);
  }
  let sum = 0, active = 0;
  for (let i = 0; i < 84; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const n = (p.hist[key] && p.hist[key].n) || 0;
    if (n > 0) { sum += n; active++; }
  }
  $("calSum").textContent = "近 12 周 " + sum + " 题 · " + active + " 天有做题";
  $("calHint").textContent = "最近 12 周每天做了多少题（每格一天）";
  $("mapSeg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === mapView));
}
function renderCal() {
  if (mapView === "12w") { renderCal12(); return; }
  $("cal").classList.remove("rolling");
  const p = prof();
  ensureToday();
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1);
  const days = new Date(y, m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;       // 周一开头
  const cal = $("cal");
  cal.innerHTML = "";
  for (let i = 0; i < offset; i++) {
    const d = document.createElement("div");
    d.className = "cell empty";
    cal.appendChild(d);
  }
  for (let day = 1; day <= days; day++) {
    const key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const n = (p.hist[key] && p.hist[key].n) || 0;
    const cell = document.createElement("div");
    const cls = n === 0 ? "lv0" : n <= 10 ? "lv1" : n <= 20 ? "lv2" : n <= 30 ? "lv3" : n <= 50 ? "lv4" : "lv5";
    cell.className = "cell " + cls + (key === todayStr() ? " cur" : "") +
      (new Date(y, m, day) > now ? " fut" : "");
    cell.innerHTML = `<span>${day}</span>` + (n ? `<em>${n}</em>` : "");
    cal.appendChild(cell);
  }
  // 连续天数
  let streak = 0;
  const d0 = new Date();
  for (;;) {
    const key = d0.getFullYear() + "-" + String(d0.getMonth() + 1).padStart(2, "0") + "-" + String(d0.getDate()).padStart(2, "0");
    const n = (p.hist[key] && p.hist[key].n) || 0;
    if (n > 0) { streak++; d0.setDate(d0.getDate() - 1); }
    else break;
  }
  $("streak").textContent = "连续 " + streak + " 天";
  let sum = 0, activeDays = 0;
  for (let day = 1; day <= days_in_month(y, m); day++) {
    const key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const n = (p.hist[key] && p.hist[key].n) || 0;
    if (n > 0) { sum += n; activeDays++; }
  }
  $("calSum").textContent = sum + " 题 · " + activeDays + " 天有做题";
  $("mapSeg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === mapView));
}

function renderWrong() {
  const p = prof();
  $("wrongN").textContent = p.wrong.length;
  const box = $("wrongList");
  if (!p.wrong.length) {
    box.innerHTML = '<div class="emptyLine">还没有错题</div>';
    return;
  }
  box.innerHTML = "";
  p.wrong.slice(0, 8).forEach(it => {
    const row = document.createElement("div");
    row.className = "wrow";
    const lv = LEVELS[it.lv] ? LEVELS[it.lv].nm : "";
    row.innerHTML = `<span class="wn">${lv} · 第${it.round}轮 第${it.guan}关</span>` +
      `<span class="wr">第 ${it.ti} 题 · ${it.reason}</span><span class="wd">${it.d || ""}</span>`;
    row.onclick = () => practiceWrong(it);
    box.appendChild(row);
  });
}

function renderHome() {
  ensureToday();
  renderLevels();
  renderWho();
  const L = slotState(), lv = LEVELS[S.sel];
  // 轮次和关都是自动推进的，「重刷」不是"开新一轮"，只在整条难度走完时才露面，平时不占位
  const cleared = clearedOf(L);
  const dGuan = guanShown(L), dTi = cleared ? N_TI : tiNo(L), dDone = cleared ? N_TI : L.guanDone;
  $("nowRank").textContent = lv.nm;
  $("nowRound").textContent = L.round;
  $("nowJie").textContent = dGuan;
  $("nowTi").textContent = dTi;
  $("ringtxt").textContent = dDone + "/10";
  const C = 2 * Math.PI * 42;
  $("ringfg").style.strokeDasharray = (dDone / 10 * C) + " " + C;

  // 圆环＝本关（10 题）进度；进度条＝本轮（100/200/300 题）进度
  const target = targetOf(L.round);
  const pct = Math.min(1, L.done / target);
  const dots = $("dots");
  dots.innerHTML = "";
  const filled = Math.round(pct * 10);
  for (let i = 0; i < 10; i++) {
    const d = document.createElement("i");
    if (i < filled) d.className = "done";
    dots.appendChild(d);
  }
  $("roundLine").textContent = "本轮 " + L.done + " / " + target + " 题" +
    (L.done >= target ? " · 已完成" : "");

  const started = L.active || L.done > 0 || L.plays > 0;
  $("resume").classList.toggle("hide", cleared);
  $("resume").textContent = started
    ? "继续闯关（第 " + L.round + " 轮 · 第 " + guanNo(L) + " 关 · 第 " + tiNo(L) + " 题）"
    : "开始闯关";
  $("newRun").classList.toggle("hide", !cleared);
  $("newRun").classList.toggle("ghost", !cleared);
  if (cleared) {
    $("newHint").textContent = lv.nm + " " + totalGuan(S.sel) + " 关全部走完了 · 点上面「重刷」从第 1 轮再来";
  } else if (L.active) {
    $("newHint").textContent = "本关已对 " + correctOf(L) + " 题 · " +
      (L.wrong === 0 ? "还能错 1 题"
        : L.wrong === 1 ? "已错 1 题，再错一题就过不了"
        : "已错 " + L.wrong + " 题，本关过不了");
  } else if (started) {
    $("newHint").textContent = "上次停在第 " + L.round + " 轮 · 第 " + guanNo(L) + " 关 · 第 " + tiNo(L) + " 题";
  } else {
    $("newHint").textContent = prof().name + " · " + lv.nm + "共 " + totalGuan(S.sel) + " 关 · 从第 1 关开始";
  }

  $("limitSeg").querySelectorAll("button").forEach(b => {
    b.classList.toggle("on", +b.dataset.s === S.limit);
  });
  $("limitHint").textContent = "只限每题第一步：第一手走对后就不再计时（当前 " + S.limit + " 秒）";

  const st = prof().stat;
  $("stOk").textContent = st.guans;
  $("stFirst").textContent = Math.max(prof().lv[0].bestRound, prof().lv[1].bestRound);
  $("stPass").textContent = st.runs;
  $("stTime").textContent = st.timeout;

  $("sfxBtn").classList.toggle("on", S.sfx.on);
  $("sfxBtn").textContent = S.sfx.on ? "开" : "关";
  $("sfxVol").value = Math.round(S.sfx.vol * 100);
  $("autoBtn").classList.toggle("on", S.auto);
  $("autoBtn").textContent = S.auto ? "开" : "关";

  renderToday();
  renderCal();
  renderWrong();
}

/* ---------- 做题状态 ---------- */
let cur = null;
let placed = [], alive = [], step = 0, answered = false, firstMove = false;
let wrongMarks = [];
let cell = 30, ox = 0, oy = 0;
let autoTimer = null;
let practice = false, practiceLine = null, ansIdx = 0;
let mapView = "month";
let tiStart = 0, timeUp = false, dayTimer = null;

function fb(text, tone) {
  const el = $("fb");
  el.className = "fb" + (tone ? " " + tone : "");
  el.textContent = text;
}
function setMask(title, sub, b1, fn1) {
  $("maskTitle").textContent = title;
  $("maskSub").textContent = sub;
  $("maskBtn").textContent = b1;
  $("maskBtn").onclick = fn1;
  $("mask").classList.remove("hide");
}
function hideMask() { $("mask").classList.add("hide"); }

/* ---------- 每题倒计时 ---------- */
let cdEnd = 0, cdLeft = 0, cdTimer = null;
function tickCd() {
  const left = Math.max(0, cdEnd - Date.now());
  cdLeft = left;
  const el = $("clock");
  el.textContent = Math.max(0, Math.ceil(left / 1000)) + "″";
  el.classList.toggle("warn", left <= 10000);
  if (left <= 0) { stopCd(); tiFailed("timeout"); }
}
function startCd(ms) {
  stopCd();
  cdLeft = ms; cdEnd = Date.now() + ms;
  const el = $("clock");
  el.className = "";
  tickCd();
  cdTimer = setInterval(tickCd, 100);
}
function stopCd() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }
function pauseCd() { if (cdTimer) { cdLeft = Math.max(0, cdEnd - Date.now()); stopCd(); } }
function resumeCd() {
  if (cdTimer || answered || firstMove || cdLeft <= 0) return;
  cdEnd = Date.now() + cdLeft;
  cdTimer = setInterval(tickCd, 100);
}

/* ---------- 每日时间（固定时间模式） ---------- */
function dayLeftSec() {
  ensureToday();
  return Math.max(0, S.min * 60 + S.bonus - prof().today.sec);
}
function startDayTimer() {
  stopDayTimer();
  if (S.mode !== "time") return;
  $("dayline").classList.remove("hide");
  const tick = () => {
    const left = dayLeftSec();
    const total = S.min * 60 + S.bonus;
    $("dayLeft").textContent = "今日剩 " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    $("dayTotal").textContent = "共 " + Math.round(total / 60) + " 分钟";
    if (left <= 0 && !timeUp) { timeUp = true; }
  };
  tick();
  dayTimer = setInterval(tick, 1000);
}
function stopDayTimer() { if (dayTimer) { clearInterval(dayTimer); dayTimer = null; } $("dayline").classList.add("hide"); }

/* ---------- 棋盘 ---------- */
const NB = 19, DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const inBoard = (r, c) => r >= 0 && r < NB && c >= 0 && c < NB;
function groupInfo(b, r, c, col) {
  const stones = [], seen = new Set(), libs = new Set(), stack = [[r, c]];
  while (stack.length) {
    const [y, x] = stack.pop(), k = y * NB + x;
    if (seen.has(k)) continue;
    seen.add(k); stones.push([y, x]);
    DIRS.forEach(d => {
      const ny = y + d[0], nx = x + d[1];
      if (!inBoard(ny, nx)) return;
      const v = b[ny][nx];
      if (v === 0) libs.add(ny * NB + nx);
      else if (v === col && !seen.has(ny * NB + nx)) stack.push([ny, nx]);
    });
  }
  return { stones, libs: libs.size };
}
function captureAfter(b, r, c, col) {
  const opp = col === 1 ? 2 : 1, checked = new Set();
  let n = 0;
  DIRS.forEach(d => {
    const y = r + d[0], x = c + d[1], k = y * NB + x;
    if (!inBoard(y, x) || b[y][x] !== opp || checked.has(k)) return;
    const g = groupInfo(b, y, x, opp);
    g.stones.forEach(p => checked.add(p[0] * NB + p[1]));
    if (g.libs === 0) g.stones.forEach(p => { b[p[0]][p[1]] = 0; n++; });
  });
  return n;
}
function baseBoard() {
  const b = Array.from({ length: NB }, () => new Array(NB).fill(0));
  (cur.s || []).forEach(p => { if (inBoard(p[0], p[1])) b[p[0]][p[1]] = p[2]; });
  return b;
}
function playBoard() {
  const b = baseBoard();
  const capLog = [];
  placed.forEach(p => {
    if (!inBoard(p[0], p[1])) { capLog.push(0); return; }
    b[p[0]][p[1]] = p[2];
    capLog.push(captureAfter(b, p[0], p[1], p[2]));
  });
  return { board: b, capLog };
}
const boardKey = b => b.map(row => row.join("")).join("");
function posHistory() {
  const b = baseBoard(), out = [boardKey(b)];
  placed.forEach(p => {
    if (!inBoard(p[0], p[1])) { out.push(boardKey(b)); return; }
    b[p[0]][p[1]] = p[2];
    captureAfter(b, p[0], p[1], p[2]);
    out.push(boardKey(b));
  });
  return out;
}
function illegalReason(r, c) {
  const pb = playBoard();
  if (pb.board[r][c] !== 0) return "已经有子";
  const b = pb.board.map(row => row.slice());
  b[r][c] = 1;
  captureAfter(b, r, c, 1);
  const g = groupInfo(b, r, c, 1);
  if (g.libs === 0) return "不入气";
  const hist = posHistory();
  if (placed.length >= 2 && boardKey(b) === hist[hist.length - 2]) return "打劫，请找劫材";
  return null;
}
function draw(from) {
  const pb = playBoard(), board = pb.board;
  const caps = pb.capLog.slice(Math.max(0, from || 0)).reduce((a, b) => a + b, 0);
  const svg = $("svg");
  let r0 = 18, r1 = 0, c0 = 18, c1 = 0;
  (cur.s || []).forEach(p => {
    r0 = Math.min(r0, p[0]); r1 = Math.max(r1, p[0]);
    c0 = Math.min(c0, p[1]); c1 = Math.max(c1, p[1]);
  });
  (cur.qa || [cur.q || []]).forEach(line => line.forEach(p => {
    r0 = Math.min(r0, p[0]); r1 = Math.max(r1, p[0]);
    c0 = Math.min(c0, p[1]); c1 = Math.max(c1, p[1]);
  }));
  r0 = Math.max(0, r0 - 1); c0 = Math.max(0, c0 - 1);
  r1 = Math.min(18, r1 + 1); c1 = Math.min(18, c1 + 1);
  const needW = Math.max(13, c1 - c0 + 1), needH = Math.max(13, r1 - r0 + 1);
  const mc = Math.round((c0 + c1) / 2), mr = Math.round((r0 + r1) / 2);
  c0 = clamp(mc - Math.floor(needW / 2), 0, 19 - needW); c1 = c0 + needW - 1;
  r0 = clamp(mr - Math.floor(needH / 2), 0, 19 - needH); r1 = r0 + needH - 1;
  const w = c1 - c0 + 1, h = r1 - r0 + 1;
  cell = Math.max(22, Math.min(34, Math.floor(Math.min(430 / w, 430 / h))));
  const PAD = Math.round(cell * 0.8);
  const W = (w - 1) * cell + PAD * 2, H = (h - 1) * cell + PAD * 2;
  ox = PAD; oy = PAD;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  let g = `<rect width="${W}" height="${H}" fill="#e8c879" rx="6"/>`;
  for (let i = 0; i < w; i++)
    g += `<line x1="${PAD + i * cell}" y1="${PAD}" x2="${PAD + i * cell}" y2="${PAD + (h - 1) * cell}" stroke="#7a5a2a" stroke-width="1"/>`;
  for (let j = 0; j < h; j++)
    g += `<line x1="${PAD}" y1="${PAD + j * cell}" x2="${PAD + (w - 1) * cell}" y2="${PAD + j * cell}" stroke="#7a5a2a" stroke-width="1"/>`;
  [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]].forEach(([r, c]) => {
    if (r < r0 || r > r1 || c < c0 || c > c1) return;
    g += `<circle cx="${PAD + (c - c0) * cell}" cy="${PAD + (r - r0) * cell}" r="${Math.max(2, cell * 0.07)}" fill="#7a5a2a"/>`;
  });
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const v = board[r][c];
    if (!v) continue;
    const x = PAD + (c - c0) * cell, y = PAD + (r - r0) * cell, rad = cell * 0.46;
    g += v === 1
      ? `<circle cx="${x}" cy="${y}" r="${rad}" fill="#1a1a1a"/>`
      : `<circle cx="${x}" cy="${y}" r="${rad}" fill="#fbfbfb" stroke="#333" stroke-width="1"/>`;
  }
  wrongMarks.forEach(([r, c]) => {
    if (r < r0 || r > r1 || c < c0 || c > c1) return;
    const x = PAD + (c - c0) * cell, y = PAD + (r - r0) * cell, d = cell * 0.22;
    g += `<path d="M${x - d} ${y - d} L${x + d} ${y + d} M${x + d} ${y - d} L${x - d} ${y + d}"
           stroke="#97302c" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>`;
  });
  g += `<g id="marks"></g>`;
  svg.innerHTML = g;
  svg.onclick = onTap;
  svg._c0 = c0; svg._r0 = r0;
  return caps;
}

/* ---------- 判题 ---------- */
function branchStep(lines, st, r, c) {
  const aliveOK = lines.filter(b => { const p = b[st]; return p && p[0] === r && p[1] === c; });
  if (!aliveOK.length) return { alive: aliveOK, hit: false, white: null, step: st, done: false };
  const line = aliveOK[0];
  let s = st + 1;
  const white = s < line.length ? line[s] : null;
  if (white) s++;
  return { alive: aliveOK, hit: true, white, step: s, done: aliveOK.some(b => s >= b.length) };
}
function onTap(e) {
  if (practice) { onPracticeTap(e); return; }
  if (answered) return;
  const el = e.currentTarget, rect = el.getBoundingClientRect(), vb = el.viewBox.baseVal;
  const px = (e.clientX - rect.left) / rect.width * vb.width;
  const py = (e.clientY - rect.top) / rect.height * vb.height;
  let r = Math.round((py - oy) / cell), c = Math.round((px - ox) / cell);
  r = clamp(r + el._r0, 0, 18); c = clamp(c + el._c0, 0, 18);

  const bad = illegalReason(r, c);
  if (bad) { fb("此处不可落子：" + bad + "（不算错，换个点）", ""); return; }

  const j = branchStep(alive, step, r, c);
  if (j.hit) {
    alive = j.alive;
    const from = placed.length;
    const wasFirst = placed.length === 0;
    placed.push([r, c, 1]);
    SFX.stone();
    if (j.white) { placed.push([j.white[0], j.white[1], 2]); setTimeout(() => SFX.white(), 130); }
    step = j.step;
    if (wasFirst) {
      firstMove = true;
      stopCd();
      const el2 = $("clock");
      el2.className = "done";
      el2.textContent = "✓";
    }
    const caps = draw(from);
    if (caps) SFX.capture();
    if (j.done) tiSolved();
    else fb("对，白棋应了一手" + (caps ? "，提掉 " + caps + " 子" : "") + "，继续走完", "ok");
  } else {
    tiFailed("wrong", r, c);
  }
}

/* ---------- 一题的结果 ---------- */
function tiSolved() {
  answered = true;
  stopCd();
  $("skipBtn").classList.add("hide");
  const p = prof(), L = slotState();
  p.stat.ok++;
  p.today.fo++;
  p.today.n++;
  const h = p.hist[todayStr()] || (p.hist[todayStr()] = { n: 0, sec: 0 });
  h.n = p.today.n;
  addSec((Date.now() - tiStart) / 1000);
  L.done++;
  L.guanDone++;
  L.bestRound = Math.max(L.bestRound, L.round);
  L.left = 0;
  save();
  SFX.ok();
  draw();
  fb("哈哈成功啦！本关已对 " + correctOf(L) + " 题", "ok");
  if (S.auto) { clearTimeout(autoTimer); autoTimer = setTimeout(afterTi, 800); }
  else showNext("下题 →", afterTi);
}
function tiFailed(reason, r, c) {
  if (answered) return;
  answered = true;
  stopCd();
  $("skipBtn").classList.add("hide");
  const p = prof(), L = slotState();
  L.wrong++;
  L.done++;
  L.guanDone++;
  if (reason === "wrong") { p.stat.wrong++; wrongMarks.push([r, c]); draw(); SFX.wrong(); }
  else { p.stat.timeout++; SFX.timeup(); }
  p.today.fa++;
  p.today.n++;
  const h = p.hist[todayStr()] || (p.hist[todayStr()] = { n: 0, sec: 0 });
  h.n = p.today.n;
  addSec((Date.now() - tiStart) / 1000);
  // 错题集
  const item = {
    lv: S.sel, idx: Math.min(L.done - 1, bankLen() - 1), no: cur.no || 0,
    reason: reason === "wrong" ? "落子错误" : (reason === "skip" ? "主动跳过" : "超时"),
    d: todayStr(), round: L.round, guan: guanNo(L), ti: tiNo(L)
  };
  p.wrong = [item].concat(p.wrong.filter(w => !(w.lv === item.lv && w.idx === item.idx))).slice(0, 100);
  save();
  $("pwrong").textContent = L.wrong;
  $("pcount").textContent = correctOf(L);
  fb(reason === "skip"
      ? "这题跳过了（记 1 错）。可以点「答案」看正解，或「下题」。"
      : (reason === "timeout" ? "时间到，这题算错。可以点「答案」看正解。" : "怎么会失败呢！点「答案」看正解，或直接「下题」。"), "no");
  $("ansBtn").classList.remove("hide");
  showNext("下题 →", afterTi);
}

function afterTi() {
  hideAnswer();
  const L = slotState();
  if (L.guanDone >= N_TI) { guanResult(); return; }
  if (timeUp) { showTimeUp(); return; }
  enterTi();
}
function guanResult() {
  const L = slotState();
  if (L.wrong <= 1) guanPassed(); else guanFailed();
}
function guanPassed() {
  const L = slotState();
  const passedNo = L.done / N_TI;
  const wrong = L.wrong;
  const correct = N_TI - wrong;
  L.wrong = 0;
  L.guanDone = 0;
  L.bestRound = Math.max(L.bestRound, L.round);
  prof().stat.guans++;
  const target = targetOf(L.round);
  if (L.done >= target) { roundPassed(correct, wrong); return; }
  save();
  SFX.done();
  fb("第 " + passedNo + " 关通过 · 对 " + correct + " 题 错 " + wrong + " 题", "ok");
  $("nextBtn").classList.add("hide");
  $("pcount").textContent = correct;
  $("pwrong").textContent = wrong;
  const nextNo = passedNo + 1;
  setMask("恭喜您过了上关", "对 " + correct + " 题 · 错 " + wrong + " 题。准备好了吗？",
          "开始第 " + nextNo + " 关", () => {
            if (timeUp) { showTimeUp(); return; }
            hideMask(); enterTi();
          });
}
function roundPassed(correct, wrong) {
  const L = slotState();
  const doneRound = L.round;
  const maxR = maxRound();
  if (doneRound < maxR) {
    L.round++;
    L.done = 0;
    L.guanDone = 0;
    save();
    SFX.done();
    setMask("第 " + doneRound + " 轮完成", "对 " + correct + " 题 · 错 " + wrong + " 题。下一轮 " +
            (doneRound + 1) * ROUND_UNIT + " 题，从第 1 关重新开始。",
            "开始第 " + L.round + " 轮", () => { hideMask(); enterTi(); });
  } else {
    L.done = targetOf(doneRound);
    save();
    SFX.done();
    setMask("全部通过！", LEVELS[S.sel].nm + "的 " + totalGuan(S.sel) + " 关全部走完了。回首页点「重刷」可以从第 1 轮再来。",
            "回首页", () => { hideMask(); goHome(); });
  }
}
function guanFailed() {
  const L = slotState();
  const no = L.done / N_TI;
  const wrong = L.wrong;
  const correct = N_TI - wrong;
  L.done -= N_TI;
  L.guanDone = 0;
  L.wrong = 0;
  L.active = true;
  L.left = 0;
  save();
  $("rTitle").textContent = "本关不通过";
  $("rReason").textContent = "错 " + wrong + " 题";
  $("rLine").textContent = "第 " + L.round + " 轮 · 第 " + no + " 关 · 对 " + correct + " 题 错 " + wrong + " 题";
  $("rSub").textContent = "只被允许错 1 题 · 本档案最佳 第 " + L.bestRound + " 轮";
  $("fb").classList.add("hide");
  $("nextBtn").classList.add("hide");
  $("ansBtn").classList.add("hide");
  $("result").classList.remove("hide");
  $("pwrong").textContent = wrong;
  $("pcount").textContent = correct;
}

/* ---------- 进入一题 ---------- */
function enterTi() {
  const L = slotState();
  ensureToday();
  const b = bank();
  cur = b[Math.min(L.done, b.length - 1)];
  placed = []; step = 0; answered = false; firstMove = false;
  wrongMarks = [];
  practice = false; practiceLine = null;
  alive = cur.qa && cur.qa.length ? cur.qa.slice() : [cur.q || []];
  hideMask();
  $("result").classList.add("hide");
  $("fb").classList.remove("hide");
  hideAnswer();
  clearTimeout(autoTimer);
  $("phead").textContent = LEVELS[S.sel].nm + " · 第 " + L.round + " 轮 · 第 " + guanNo(L) + " 关 · 第 " + tiNo(L) + " / " + N_TI + " 题";
  $("goal").textContent = cur.t || "黑先";
  $("pno").textContent = cur.no || "—";
  $("pcount").textContent = correctOf(L);
  $("pwrong").textContent = L.wrong;
  $("skipBtn").classList.remove("hide");
  fb(L.wrong === 0 ? "限时 " + S.limit + " 秒，走出正解第一手。"
     : (L.wrong === 1 ? "本关已错 1 题，再错就过不了。" : "本关已错 " + L.wrong + " 题，已经过不了，把剩下的题练完。"), "");
  draw();
  const left = L.left > 0 ? Math.min(L.left, S.limit * 1000) : S.limit * 1000;
  L.left = 0;
  save();
  tiStart = Date.now();
  startCd(left);
  if (S.mode === "time") startDayTimer();
}

/* ---------- 答案 / 练习 ---------- */
function aliveLines() {
  const out = [];
  alive.forEach(line => {
    const key = line.slice(step).map(p => p[0] + "," + p[1]).join("|");
    if (!out.some(o => o.key === key)) out.push({ line, key });
  });
  return out;
}
function markLine(idx) {
  const svg = $("svg"), marks = $("marks");
  const lines = aliveLines();
  ansIdx = idx;
  const line = (lines[idx] && lines[idx].line) || [];
  if (!marks || !line.length) return;
  let html = "";
  for (let i = step; i < line.length; i++) {
    const [r, c] = line[i];
    const x = ox + (c - svg._c0) * cell, y = oy + (r - svg._r0) * cell;
    const black = i % 2 === 0;
    const n = i - step + 1;
    html += `<circle cx="${x}" cy="${y}" r="${cell * 0.32}" fill="${black ? "#1a1a1a" : "#fbfbfb"}"
              stroke="${black ? "#fbfbfb" : "#333"}" stroke-width="1.5"/>`;
    html += `<text x="${x}" y="${y + cell * 0.12}" text-anchor="middle"
              font-size="${cell * 0.36}" font-weight="700"
              fill="${black ? "#ffffff" : "#1a1a1a"}">${n}</text>`;
    if (i === step) {
      html += `<circle cx="${x}" cy="${y}" r="${cell * 0.5}" fill="none" stroke="#c0392b" stroke-width="3">
        <animate attributeName="opacity" values="1;.45;1" dur="1.2s" repeatCount="indefinite"/></circle>`;
    }
  }
  marks.innerHTML = html;
  $("ansRow").querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === idx));
  const total = lines.length;
  fb("现在明白了吧！答案 " + (idx + 1) + " / " + total + "：红圈是第一手，数字是手顺。" +
     (total > 1 ? "点下面的「答案" + (idx === 0 ? 2 : 1) + "」可以换一条线路。" : ""), "");
}
function showAnswerRow() {
  const row = $("ansRow");
  const lines = aliveLines();
  row.innerHTML = "";
  lines.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = "答案" + (i + 1);
    b.onclick = () => markLine(i);
    row.appendChild(b);
  });
  const wb = document.createElement("button");
  wb.type = "button"; wb.className = "chip walk"; wb.id = "walkBtn"; wb.textContent = "跟着走一遍";
  wb.onclick = () => startPractice();
  row.appendChild(wb);
  row.classList.remove("hide");
  $("ansBtn").classList.add("hide");
  markLine(0);
}
function startPractice() {
  const lines = aliveLines();
  practiceLine = (lines[ansIdx] && lines[ansIdx].line) || [];
  if (!practiceLine.length) return;
  hideAnswer();
  practice = true;
  placed = []; step = 0; answered = false; wrongMarks = [];
  firstMove = true;
  stopCd(); stopDayTimer();
  alive = [practiceLine];
  showNext("下题 →", afterTi);
  draw(); markGuide();
  fb("跟着走一遍：红圈是第一手，按 1、2、3… 走，白棋会自动应。", "");
}
function markGuide() {
  const svg = $("svg"), marks = $("marks");
  if (!practiceLine || !marks) return;
  let html = "";
  for (let i = step; i < practiceLine.length; i++) {
    const [r, c] = practiceLine[i];
    const x = ox + (c - svg._c0) * cell, y = oy + (r - svg._r0) * cell;
    const black = i % 2 === 0;
    html += `<circle cx="${x}" cy="${y}" r="${cell * 0.32}" fill="${black ? "#1a1a1a" : "#fbfbfb"}"
              stroke="${black ? "#fbfbfb" : "#333"}" stroke-width="1.5"/>`;
    html += `<text x="${x}" y="${y + cell * 0.12}" text-anchor="middle"
              font-size="${cell * 0.36}" font-weight="700"
              fill="${black ? "#ffffff" : "#1a1a1a"}">${i + 1}</text>`;
    if (i === step) {
      html += `<circle cx="${x}" cy="${y}" r="${cell * 0.5}" fill="none" stroke="#c0392b" stroke-width="3"/>`;
    }
  }
  marks.innerHTML = html;
}
function onPracticeTap(e) {
  if (answered) return;
  const el = e.currentTarget, rect = el.getBoundingClientRect(), vb = el.viewBox.baseVal;
  const px = (e.clientX - rect.left) / rect.width * vb.width;
  const py = (e.clientY - rect.top) / rect.height * vb.height;
  let r = Math.round((py - oy) / cell), c = Math.round((px - ox) / cell);
  r = clamp(r + el._r0, 0, 18); c = clamp(c + el._c0, 0, 18);
  if (playBoard().board[r][c] !== 0) { fb("这里已经有子，跟着编号走。", ""); return; }
  const j = branchStep(alive, step, r, c);
  if (!j.hit) { fb("这手不对，跟着编号走。", "no"); return; }
  placed.push([r, c, 1]);
  SFX.stone();
  if (j.white) { placed.push([j.white[0], j.white[1], 2]); setTimeout(() => SFX.white(), 130); }
  step = j.step;
  draw();
  if (j.done) { answered = true; fb("走对了！这题记下了。", "ok"); $("nextBtn").classList.remove("hide"); }
  else { markGuide(); fb("对，继续。", "ok"); }
}
function hideAnswer() {
  $("ansBtn").classList.add("hide");
  $("nextBtn").classList.add("hide");
  $("skipBtn").classList.add("hide");
  practice = false;
  const row = $("ansRow");
  row.classList.add("hide");
  row.innerHTML = "";
}
function showNext(text, fn) {
  const b = $("nextBtn");
  b.textContent = text;
  b.onclick = () => { b.classList.add("hide"); clearTimeout(autoTimer); fn(); };
  b.classList.remove("hide");
}

/* ---------- 每日时间到 ---------- */
function showTimeUp() {
  stopCd(); stopDayTimer();
  setMask("今天的时间到了", "今天已做 " + Math.round(prof().today.sec / 60) + " 分钟。可以休息，也可以再来 5 分钟。",
          "再来 5 分钟", () => {
            S.bonus += 300;
            timeUp = false;
            save();
            hideMask();
            enterTi();
          });
  // 第二个按钮：返回首页（复用 mask 下方？用 confirm 简化）
}

/* ---------- 错题练习 ---------- */
function practiceWrong(it) {
  const b = DATA[it.lv] && DATA[it.lv].p;
  if (!b || !b[it.idx]) return;
  cur = b[it.idx];
  practiceLine = cur.qa ? cur.qa[0] : (cur.q || []);
  practice = true;
  placed = []; step = 0; answered = false; wrongMarks = [];
  firstMove = true;
  stopCd(); stopDayTimer();
  alive = [practiceLine];
  $("home").classList.add("hide");
  $("play").classList.remove("hide");
  $("whoPanel").classList.add("hide");
  $("result").classList.add("hide");
  $("fb").classList.remove("hide");
  $("dayline").classList.add("hide");
  $("phead").textContent = "错题练习 · 第 " + (it.no || "?") + " 号";
  $("goal").textContent = cur.t || "黑先";
  $("pno").textContent = it.no || "—";
  $("pcount").textContent = 0;
  $("pwrong").textContent = 0;
  $("clock").className = "done";
  $("clock").textContent = "练习";
  $("skipBtn").classList.add("hide");
  hideMask();
  draw(); markGuide();
  fb("跟着编号走一遍，不计分。", "");
  showNext("返回首页", () => goHome());
}

/* ---------- 开始 / 继续 ---------- */
function startRun() {
  const L = slotState();
  const best = L.bestRound, plays = L.plays;
  prof().lv[S.sel] = blankLv();
  prof().lv[S.sel].active = true;
  prof().lv[S.sel].bestRound = best;
  prof().lv[S.sel].plays = plays + 1;
  prof().stat.runs++;
  timeUp = false;
  save();
}
function enterPlay() {
  SFX.unlock();
  $("home").classList.add("hide");
  $("play").classList.remove("hide");
  $("whoPanel").classList.add("hide");
  timeUp = false;
  enterTi();
}
function goHome() {
  clearTimeout(autoTimer); autoTimer = null;
  stopCd(); stopDayTimer();
  SFX.cancel();
  practice = false;
  hideMask();
  hideAnswer();
  $("result").classList.add("hide");
  $("fb").classList.remove("hide");
  $("dayline").classList.add("hide");
  $("play").classList.add("hide");
  $("home").classList.remove("hide");
  renderHome();
}

$("resume").onclick = () => {
  if (!slotState().active) startRun();
  enterPlay();
};
$("newRun").onclick = () => {
  const L = slotState();
  if (L.active && !confirm("从第 1 轮第 1 关重新开始？\n\n本关进度会清空；最佳轮次保留。")) return;
  startRun();
  enterPlay();
};
$("again").onclick = () => {
  const L = slotState();
  L.wrong = 0; L.active = true; L.left = 0;
  save();
  $("result").classList.add("hide");
  $("fb").classList.remove("hide");
  enterPlay();
};
$("toHome").onclick = goHome;
$("quit").onclick = goHome;
$("whoBtn").onclick = () => { $("whoPanel").classList.toggle("hide"); };

$("ansBtn").onclick = () => { showAnswerRow(); };
$("skipBtn").onclick = () => {
  if (answered) return;
  if (!confirm("跳过这题？会记一次错（本关只允许错 1 题）。")) return;
  tiFailed("skip");
};

$("mapSeg").onclick = e => {
  const b = e.target.closest("button[data-v]");
  if (!b) return;
  mapView = b.dataset.v;
  renderCal();
};
$("limitSeg").onclick = e => {
  const b = e.target.closest("button[data-s]");
  if (!b) return;
  S.limit = +b.dataset.s;
  save(); renderHome();
};
$("modeSeg").onclick = e => {
  const b = e.target.closest("button[data-m]");
  if (!b) return;
  S.mode = b.dataset.m;
  save(); renderHome();
};
$("numMin").onchange = e => {
  S.min = Math.max(5, Math.min(60, +e.target.value || 10));
  save(); renderHome();
};
document.querySelectorAll("#rowMin [data-min]").forEach(b => {
  b.onclick = () => { S.min = +b.dataset.min; save(); renderHome(); };
});
$("sfxBtn").onclick = () => {
  S.sfx.on = !S.sfx.on;
  save(); renderHome();
  if (S.sfx.on) SFX.stone();
};
$("sfxVol").oninput = e => { S.sfx.vol = (+e.target.value) / 100; save(); };
$("autoBtn").onclick = () => { S.auto = !S.auto; save(); renderHome(); };

/* ---------- 手动设置进度 ---------- */
function maxRoundOf(lv) { return Math.max(1, Math.ceil(DATA[lv].p.length / ROUND_UNIT)); }
function syncManual() {
  const lv = +$("mSetLv").value || 0;
  const maxR = maxRoundOf(lv);
  $("mSetRound").max = String(maxR);
  let round = Math.max(1, Math.min(maxR, +$("mSetRound").value || 1));
  if (String(round) !== $("mSetRound").value) $("mSetRound").value = round;

  const target = Math.min(round * ROUND_UNIT, DATA[lv].p.length);
  const maxG = Math.max(1, Math.ceil(target / N_TI));
  $("mSetGuan").max = String(maxG);
  let guan = Math.max(1, Math.min(maxG, +$("mSetGuan").value || 1));
  if (String(guan) !== $("mSetGuan").value) $("mSetGuan").value = guan;
  let ti = Math.max(1, Math.min(N_TI, +$("mSetTi").value || 1));
  if (String(ti) !== $("mSetTi").value) $("mSetTi").value = ti;

  const done = (guan - 1) * N_TI + (ti - 1);
  $("mSetHint").textContent = "第 " + round + " 轮共 " + target + " 题（" + maxG +
    " 关）· 从第 " + guan + " 关第 " + ti + " 题开始（已做 " + done + " 题）";
  return { lv, round, guan, ti, done };
}
$("mSetLv").onchange = syncManual;
$("mSetRound").oninput = syncManual;
$("mSetGuan").oninput = syncManual;
$("mSetTi").oninput = syncManual;
$("mSetApply").onclick = () => {
  const m = syncManual();
  if (!confirm("把" + LEVELS[m.lv].nm + "设成第 " + m.round + " 轮、从第 " + m.guan + " 关第 " + m.ti + " 题开始？\n\n会覆盖这个难度原来的进度。")) return;
  const L = prof().lv[m.lv];
  L.round = m.round;
  L.done = m.done;
  L.guanDone = m.ti - 1;
  L.wrong = 0;
  L.active = true;
  L.bestRound = Math.max(L.bestRound, m.round);
  save(); renderHome();
  $("mSetHint").textContent = "已设置：" + LEVELS[m.lv].nm + " · 第 " + m.round + " 轮 · 第 " + m.guan + " 关第 " + m.ti + " 题";
};
syncManual();

/* ---------- 备份：二维码 / 文本码 ---------- */
const MAP_MAX_DAYS = 180;
const RCODE = { "落子错误": 1, "超时": 2, "主动跳过": 3 };
const RNAME = { 1: "落子错误", 2: "超时", 3: "主动跳过" };
function shiftDay(dstr, delta) {
  const p = String(dstr).split("-").map(Number);
  if (p.length !== 3 || p.some(x => !Number.isFinite(x))) return dstr;
  const d = new Date(p[0], p[1] - 1, p[2] + delta);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dayOffset(dstr) {
  const a = String(dstr).split("-").map(Number), b = todayStr().split("-").map(Number);
  if (a.length !== 3 || b.length !== 3) return 0;
  return Math.max(0, Math.round((new Date(b[0], b[1] - 1, b[2]) - new Date(a[0], a[1] - 1, a[2])) / 86400000));
}
/** 活跃地图：最近 180 天，一个字符一天（0-9a-z，最多 35 题），前面空白天不传 */
function packMap(p) {
  const end = todayStr(), days = [];
  for (let i = MAP_MAX_DAYS - 1; i >= 0; i--) {
    const n = (p.hist[shiftDay(end, -i)] && p.hist[shiftDay(end, -i)].n) || 0;
    days.push(Math.min(35, Math.max(0, n)).toString(36));
  }
  let first = 0;
  while (first < days.length && days[first] === "0") first++;
  if (first >= days.length) return null;
  return [end, days.slice(first).join("")];
}
function unpackMap(m) {
  const out = {};
  if (!Array.isArray(m) || m.length < 2) return out;
  const end = m[0], str = String(m[1] || "");
  for (let i = 0; i < str.length && i < MAP_MAX_DAYS; i++) {
    const v = parseInt(str[i], 36);
    if (Number.isFinite(v) && v > 0) out[shiftDay(end, -(str.length - 1 - i))] = v;
  }
  return out;
}
function packPortable(withWrong, withMap) {
  const p = prof();
  const t = (p.today && p.today.d === todayStr()) ? p.today : { n: 0, sec: 0, fo: 0, fa: 0 };
  const o = {
    v: 6, nm: p.name, at: Date.now(),
    lv: p.lv.map(L => [L.round, L.done, L.guanDone, L.wrong, L.active ? 1 : 0, L.plays, L.bestRound]),
    t: [todayStr(), t.n, t.sec, t.fo, t.fa],
    s: p.stat
  };
  if (withMap) { const m = packMap(p); if (m) o.m = m; }
  if (withWrong) o.w = p.wrong.slice(0, 60).map(w => [w.lv, w.idx, RCODE[w.reason] || 1, dayOffset(w.d), w.round || 1]);
  return JSON.stringify(o);
}
function cleanName(s) {
  return Array.from(String(s || "").replace(/[<>]/g, "").replace(/\s+/g, " ")).slice(0, 12).join("").trim();
}
function applyPortable(o) {
  if (!o || o.v !== 6) throw new Error("不是这个应用的进度码");
  const p = prof();
  p.name = cleanName(o.nm || p.name) || p.name;
  if (Array.isArray(o.lv)) {
    p.lv = [0, 1].map(i => {
      const a = o.lv[i] || [];
      return normLv({ round: a[0], done: a[1], guanDone: a[2], wrong: a[3], active: !!a[4], plays: a[5], bestRound: a[6] });
    });
  }
  if (Array.isArray(o.t) && o.t[0] === todayStr()) {
    p.today = { d: o.t[0], n: +o.t[1] || 0, sec: +o.t[2] || 0, fo: +o.t[3] || 0, fa: +o.t[4] || 0 };
  }
  if (o.s) p.stat = Object.assign(blankStat(), o.s);
  if (o.m) {
    const m = unpackMap(o.m);
    Object.keys(m).forEach(d => {
      const cur = p.hist[d] || { n: 0, sec: 0 };
      p.hist[d] = { n: Math.max(cur.n || 0, m[d]), sec: cur.sec || 0 };
    });
  }
  if (Array.isArray(o.w)) {
    p.wrong = o.w.map(a => ({
      lv: a[0] | 0, idx: a[1] | 0, reason: RNAME[a[2]] || "落子错误",
      d: shiftDay(todayStr(), -(a[3] | 0)), round: a[4] | 0 || 1,
      guan: Math.floor((a[1] | 0) / N_TI) + 1, ti: ((a[1] | 0) % N_TI) + 1, no: (a[1] | 0) + 1
    })).slice(0, 100);
  }
}
async function encodeCode(str) {
  const bytes = new TextEncoder().encode(str);
  let out = bytes, tag = "P";
  if (typeof CompressionStream !== "undefined") {
    try {
      const cs = new CompressionStream("gzip");
      const b = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).blob();
      out = new Uint8Array(await b.arrayBuffer());
      tag = "G";
    } catch (e) {}
  }
  let s = "";
  for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
  return "GS6" + tag + ":" + btoa(s);
}
async function decodeCode(code) {
  code = String(code || "").trim().replace(/\s+/g, "");
  const m = /^GS6([GP]):(.+)$/.exec(code);
  if (!m) throw new Error("格式不对，是不是没复制全？");
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (m[1] === "G") {
    const ds = new DecompressionStream("gzip");
    const b = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).blob();
    return await b.text();
  }
  return new TextDecoder().decode(bytes);
}
function showQr(code) {
  const box = $("qrBox"), tip = $("qrHint");
  if (!box) return "no-box";
  if (typeof qrcode !== "function") { box.classList.add("hide"); tip.classList.add("hide"); return "no-lib"; }
  try {
    const qr = qrcode(0, "M");
    qr.addData(code);
    qr.make();
    box.innerHTML = qr.createSvgTag(4, 2);
    box.classList.remove("hide");
    tip.classList.remove("hide");
    return "ok";
  } catch (e) {
    box.classList.add("hide"); tip.classList.add("hide");
    return "fail:" + ((e && e.message) || e);
  }
}
function pickCode(text) {
  const m = /#p=(GS6[GP]:[A-Za-z0-9\-_]+)/.exec(text || "");
  const raw = m ? m[1] : String(text || "").trim();
  const mm = /^(GS6[GP]:)([A-Za-z0-9\-_]+)$/.exec(raw);
  if (!mm) return null;
  let body = mm[2].replace(/-/g, "+").replace(/_/g, "/");
  while (body.length % 4) body += "=";
  return mm[1] + body;
}
async function importCode(code) {
  try {
    const text = await decodeCode(code);
    const o = JSON.parse(text);
    if (!confirm("导入进度码？\n\n会覆盖本机当前档案「" + prof().name + "」的进度（名字、今日、错题、地图）。")) return;
    applyPortable(o);
    save(); renderHome();
    $("codeHint").textContent = "已导入：" + prof().name + " 的进度";
  } catch (e) {
    $("codeHint").textContent = "进度码无效：" + ((e && e.message) || e);
  }
}
$("mkCode").onclick = async () => {
  const code = await encodeCode(packPortable($("withWrong").checked, $("withMap").checked));
  $("codeBox").value = code;
  const r = showQr(code);
  $("codeHint").textContent = r === "ok"
    ? "二维码已生成（进度码 " + code.length + " 字符）· 另一台设备点「扫码导入」对准它"
    : "二维码生成失败（" + r + "），可以复制下面的文本码";
};
$("copyCode").onclick = async () => {
  if (!$("codeBox").value) $("codeBox").value = await encodeCode(packPortable($("withWrong").checked, $("withMap").checked));
  const t = $("codeBox").value;
  const done = () => { $("codeHint").textContent = "已复制，去新设备粘贴后点「从文本进度码恢复」。"; };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done).catch(() => { $("codeBox").select(); $("codeHint").textContent = "已选中，长按/按 Ctrl+C 复制。"; });
  } else {
    $("codeBox").select(); $("codeHint").textContent = "已选中，长按/按 Ctrl+C 复制。";
  }
};
$("useCode").onclick = () => {
  const v = $("codeBox").value.trim();
  if (!v) { $("codeHint").textContent = "先把进度码粘到上面的框里。"; return; }
  importCode(v);
};

/* 扫码 / 相册 */
let scanStream = null, scanRAF = 0, scanSession = 0;
async function openCamera() {
  const tries = [
    { video: { facingMode: { ideal: "environment" } }, audio: false },
    { video: { facingMode: "environment" }, audio: false },
    { video: true, audio: false }
  ];
  let last = null;
  for (const t of tries) {
    try { return await navigator.mediaDevices.getUserMedia(t); }
    catch (e) {
      last = e;
      if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) break;
    }
  }
  throw last || new Error("未知错误");
}
function stopScan() {
  scanSession++;
  if (scanRAF) { cancelAnimationFrame(scanRAF); scanRAF = 0; }
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  const w = $("scanWrap"); if (w) w.classList.add("hide");
}
function scanFail(msg) {
  stopScan();
  $("codeHint").textContent = "扫码失败：" + msg;
}
function scanLoop(my) {
  if (my !== scanSession) return;
  const v = $("scanVideo"), cv = $("scanCanvas");
  if (scanStream && v && cv && v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
    const w = v.videoWidth, h = v.videoHeight;
    const scale = Math.min(1, 640 / Math.max(w, h));
    cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
    const g = cv.getContext("2d");
    g.drawImage(v, 0, 0, cv.width, cv.height);
    const img = g.getImageData(0, 0, cv.width, cv.height);
    const res = jsQR(img.data, cv.width, cv.height, { inversionAttempts: "dontInvert" });
    if (res && res.data) {
      const code = pickCode(res.data);
      stopScan();
      if (!code) { $("codeHint").textContent = "扫到的不是进度码"; return; }
      importCode(code);
      return;
    }
  }
  scanRAF = requestAnimationFrame(() => scanLoop(my));
}
$("scanCode").onclick = async () => {
  if (typeof jsQR !== "function") { $("codeHint").textContent = "扫码功能只在网页版可用；单文件版请用系统相机扫，或复制文本码。"; return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $("codeHint").textContent = "这个浏览器不提供摄像头接口，换 Chrome 试试。"; return; }
  const my = ++scanSession;
  try {
    scanStream = await openCamera();
  } catch (e) {
    $("codeHint").textContent = "打不开相机：" + ((e && e.message) || e) + "（需要 https 或 localhost，并允许相机权限）";
    return;
  }
  const v = $("scanVideo");
  v.srcObject = scanStream;
  $("scanWrap").classList.remove("hide");
  try { await v.play(); } catch (e) {}
  scanLoop(my);
};
$("scanCancel").onclick = () => stopScan();
$("qrFile").onchange = e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const cv = $("scanCanvas");
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    const g = cv.getContext("2d");
    g.drawImage(img, 0, 0, cv.width, cv.height);
    const data = g.getImageData(0, 0, cv.width, cv.height);
    const res = jsQR(data.data, cv.width, cv.height, { inversionAttempts: "attemptBoth" });
    URL.revokeObjectURL(img.src);
    if (res && res.data) {
      const code = pickCode(res.data);
      if (code) importCode(code);
      else $("codeHint").textContent = "图里的二维码不是进度码";
    } else {
      $("codeHint").textContent = "没认出二维码，换一张清楚点的图";
    }
  };
  img.onerror = () => { $("codeHint").textContent = "图片打不开"; };
  img.src = URL.createObjectURL(f);
  e.target.value = "";
};

$("resetAll").onclick = () => {
  if (!confirm("清空全部档案和进度？")) return;
  if (!confirm("再确认一次：清空后不能恢复。")) return;
  S = fresh(); save(); renderHome();
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { pauseCd(); stopDayTimer(); }
  else if (!$("play").classList.contains("hide")) { resumeCd(); if (S.mode === "time") startDayTimer(); }
});

/* ---------- 启动 ---------- */
renderHome();
if (typeof syncManual === "function") syncManual();

/* 自测钩子 */
if (DEV) {
  window.__DBG = {
    st: () => S,
    cur: () => cur,
    next: () => (((alive[0] || [])[step]) || null),
    pick: (sel, done) => {
      S.sel = clamp(sel | 0, 0, 1);
      const L = slotState();
      L.done = Math.max(0, done | 0);
      L.round = Math.floor(L.done / ROUND_UNIT) + 1;
      L.guanDone = L.done % N_TI;
      L.wrong = 0;
      L.active = true;
      save(); renderHome();
    },
    geo: () => ({ cell, ox, oy, c0: $("svg")._c0, r0: $("svg")._r0 }),
    status: () => ({ answered, firstMove, step, placed: placed.length,
                     fb: $("fb").textContent, result: !$("result").classList.contains("hide"),
                     clock: $("clock").textContent, next: !$("nextBtn").classList.contains("hide") }),
    setCd: ms => { cdEnd = Date.now() + ms; cdLeft = ms; },
    cd: () => Math.round(Math.max(0, cdEnd - Date.now()) / 1000),
    wrongPoint: () => {
      const occ = new Set((cur.s || []).concat(placed).map(p => p[0] * 19 + p[1]));
      const mv = (alive[0] || [])[step];
      if (!mv) return null;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        const r = mv[0] + d[0], c = mv[1] + d[1];
        if (r >= 0 && r < 19 && c >= 0 && c < 19 && !occ.has(r * 19 + c)) return [r, c];
      }
      for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) {
        if (!occ.has(r * 19 + c) && !(r === mv[0] && c === mv[1])) return [r, c];
      }
      return null;
    }
  };
}
