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
function blankDay() { return { d: "", n: 0, sec: 0, fo: 0, fa: 0, bonus: 0 }; }   // bonus：当天「再来 5 分钟」加的秒数，换日自然清零
function blankStat() { return { guans: 0, runs: 0, timeout: 0, skip: 0, wrong: 0, ok: 0 }; }
let SEQ = 1;
function newProfile(name) {
  return { id: SEQ++, name: name || "孩子 1", lv: [blankLv(), blankLv()], today: blankDay(), hist: {}, wrong: [], stat: blankStat() };
}
function createProfile(name) {
  const p = newProfile(name);
  do { p.id = Math.floor(Math.random() * 2147483646) + 2; }
  while (S.profiles.some(other => other.id === p.id));
  return p;
}
function fresh() {
  SEQ = 1;
  return {
    v: 7, cur: 0, sel: 0, limit: 60, mode: "time", min: 10,
    profiles: [newProfile("孩子 1")], sfx: { on: true, vol: 0.45 }, auto: false
  };
}
const bankLenOf = gi => DATA[gi].p.length;
const maxRoundOfLen = len => Math.max(1, Math.ceil(len / ROUND_UNIT));
/* 一关 10 题做完后的结算：纯状态更新，和弹窗分开。
   第 10 题一落子就立刻结算并存档，这样结算前退出 / 刷新 / 被系统杀掉都不会留下 guanDone=10 的半截状态。 */
function settleGuan(L, gi, st) {
  const len = bankLenOf(gi);
  const no = Math.ceil(L.done / N_TI);
  const wrong = L.wrong, correct = N_TI - wrong;
  L.guanDone = 0; L.wrong = 0; L.left = 0;
  if (wrong >= 2) {
    L.done = Math.max(0, L.done - N_TI);
    L.active = true;
    return { kind: "fail", no, correct, wrong };
  }
  if (st) st.guans++;
  L.bestRound = Math.max(L.bestRound, L.round);
  const target = Math.min(L.round * ROUND_UNIT, len);
  if (L.done < target) return { kind: "pass", no, correct, wrong };
  const doneRound = L.round;
  if (doneRound < maxRoundOfLen(len)) {
    L.round++;
    L.done = 0;
    return { kind: "round", no, correct, wrong, doneRound };
  }
  L.done = target;
  return { kind: "all", no, correct, wrong, doneRound };
}
/* 修老存档：旧版在「第 10 题做完、还没点结算」时退出，会留下 guanDone=10，
   重载时被 %10 变成 0、错题数却留着，或者 done 不再对齐到关的边界。 */
function repairLv(L, gi, st) {
  const len = bankLenOf(gi);
  L.round = Math.min(L.round, maxRoundOfLen(len));
  L.done = Math.min(L.done, Math.min(L.round * ROUND_UNIT, len));
  L.guanDone = Math.min(L.guanDone, L.done);
  if ((L.done - L.guanDone) % N_TI !== 0) {          // 关边界错位：本关从第 1 题重来
    L.done = Math.floor(L.done / N_TI) * N_TI;
    L.guanDone = 0; L.wrong = 0;
    return L;
  }
  const target = Math.min(L.round * ROUND_UNIT, len);
  const unsettled = L.guanDone === 0 && L.done >= N_TI &&
    (L.wrong > 0 || (L.done >= target && L.round < maxRoundOfLen(len)));
  if (unsettled) L.guanDone = N_TI;
  L.wrong = Math.min(L.wrong, L.guanDone);
  if (L.guanDone >= N_TI) settleGuan(L, gi, st);
  return L;
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
    guanDone: Math.max(0, Math.min(N_TI, x.guanDone != null ? x.guanDone | 0 : ((x.guan | 0) * N_TI + (x.ti | 0)) % N_TI)),
    wrong: Math.max(0, Math.min(N_TI, x.wrong | 0)),
    plays: Math.max(0, x.plays | 0),
    active: !!x.active,
    left: Math.max(0, x.left | 0),
    bestRound: Math.max(0, x.bestRound == null ? round : x.bestRound | 0)
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
      mode: "time", min: 10, profiles: [pr],
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
      mode: "time", min: 10, profiles: [pr],
      sfx: Object.assign({ on: true, vol: 0.45 }, o.sfx), auto: o.auto === true
    };
  }
  if (o.v !== 7 || !Array.isArray(o.profiles) || !o.profiles.length) return fresh();
  const out = {
    v: 7, cur: 0, sel: 0,
    limit: [15, 30, 60].includes(o.limit) ? o.limit : 60,
    mode: o.mode === "free" ? "free" : "time",
    min: Math.max(5, Math.min(60, o.min | 0 || 10)),
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
function repairAll(o) {
  o.profiles.forEach(p => { [0, 1].forEach(gi => repairLv(p.lv[gi], gi, p.stat)); });
  return o;
}
const copyState = value => JSON.parse(JSON.stringify(value));
const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const storageLocks = navigator.locks;
const journalPrefix = KEY + ":save:";
const pageId = window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
let saveSeq = 0, lastSaveTime = 0;
const conflictKey = KEY + ":conflict:";

function readStoredState() {
  const text = localStorage.getItem(KEY);
  let raw, state;
  try { raw = JSON.parse(text); state = normalize(raw); }
  catch (e) { raw = null; state = fresh(); }
  try { repairAll(state); } catch (e) { /* 尽量保留可读取的档案 */ }
  if (raw?.epoch) state.epoch = raw.epoch;
  return { state, token: raw?.commitToken };
}

// 只合入本页实际改动的字段，不把打开页面时的旧档案覆盖回去。
function mergeProfile(base, next, shared) {
  const result = { ...shared, lv: shared.lv.slice() };
  if (base.name !== next.name) result.name = next.name;
  const progress = ({ left, ...value }) => value;
  next.lv.forEach((slot, i) => {
    const previous = base.lv[i], current = shared.lv[i];
    if (sameState(previous, slot)) return;
    if (sameState(progress(previous), progress(current))) result.lv[i] = slot;
    else if (!sameState(progress(previous), progress(slot))) throw new Error("progress conflict");
  });
  const counters = (old, local, current) => Object.fromEntries(Object.keys(local).map(k => [k,
    k === "sec" ? Math.max(local[k], current[k] || 0) : Math.max(0, (current[k] || 0) + local[k] - (old[k] || 0))
  ]));
  if (!sameState(base.stat, next.stat)) result.stat = counters(base.stat, next.stat, shared.stat);
  if (!sameState(base.today, next.today) && next.today.d >= shared.today.d) {
    const old = base.today.d === next.today.d ? base.today : blankDay();
    const current = shared.today.d === next.today.d ? shared.today : blankDay();
    const { d, ...local } = next.today;
    result.today = { d, ...counters(old, local, current) };
  }
  if (!sameState(base.hist, next.hist)) {
    result.hist = { ...shared.hist };
    for (const [date, record] of Object.entries(next.hist)) {
      if (!sameState(base.hist[date], record)) result.hist[date] = counters(base.hist[date] || {}, record, shared.hist[date] || {});
    }
  }
  if (!sameState(base.wrong, next.wrong)) {
    const key = item => `${item.lv}:${item.idx}`;
    const prior = new Map(base.wrong.map(item => [key(item), item]));
    const modified = next.wrong.filter(item => !sameState(item, prior.get(key(item))));
    const retained = new Set(next.wrong.map(key));
    const changed = new Set(modified.map(key));
    result.wrong = modified.concat(shared.wrong.filter(item => !changed.has(key(item)) && (!prior.has(key(item)) || retained.has(key(item))))).slice(0, 100);
  }
  return result;
}

function mergeSave(shared, { base, next, replaceId }) {
  if (base.epoch !== shared.epoch) throw new Error("reset conflict");
  if (base.epoch !== next.epoch || sameState(shared, base)) return next;
  const result = { ...shared };
  for (const k of ["sel", "limit", "mode", "min", "sfx", "auto"]) {
    if (!sameState(base[k], next[k])) result[k] = next[k];
  }
  const previous = new Map(base.profiles.map(p => [p.id, p]));
  const edited = new Map(next.profiles.map(p => [p.id, p]));
  result.profiles = [];
  for (const p of shared.profiles) {
    const old = previous.get(p.id), local = edited.get(p.id);
    if (!old) result.profiles.push(p);
    else if (local) {
      if (p.id === replaceId) {
        if (!sameState(old, p)) throw new Error("replace conflict");
        result.profiles.push(local);
      } else result.profiles.push(mergeProfile(old, local, p));
    }
  }
  for (const p of next.profiles) {
    if (!previous.has(p.id)) result.profiles.push(p);
    else if (!result.profiles.some(q => q.id === p.id) && !sameState(p, previous.get(p.id))) throw new Error("deleted profile conflict");
  }
  if (!result.profiles.length) throw new Error("last profile conflict");
  const selected = next.profiles[next.cur]?.id;
  result.cur = Math.max(0, result.profiles.findIndex(p => p.id === selected));
  return result;
}

// 同源标签页用浏览器锁串行合并。每笔改动先同步写入日志，刷新或关闭仍能恢复。
function processSaveJournal(apply) {
  let { state, token } = readStoredState();
  const logs = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(journalPrefix)) continue;
    const text = localStorage.getItem(key);
    if (text) logs.push({ key, ...JSON.parse(text) });
  }
  logs.sort((a, b) => a.time - b.time || a.seq - b.seq);
  const rejected = new Set();
  for (const log of logs) {
    if (log.key === token) {
      if (apply) localStorage.removeItem(log.key);
      continue;
    }
    if (!rejected.has(log.owner) && !localStorage.getItem(conflictKey + log.owner)) {
      let merged;
      try { merged = mergeSave(state, log); }
      catch (e) {
        rejected.add(log.owner);
        if (apply) localStorage.setItem(conflictKey + log.owner, "1");
      }
      if (merged) {
        if (apply) localStorage.setItem(KEY, JSON.stringify({ ...merged, commitToken: log.key }));
        state = merged;
      }
    }
    if (apply) localStorage.removeItem(log.key);
  }
  return state;
}
function load() {
  try { return processSaveJournal(false); }
  catch (e) {
    try { return readStoredState().state; } catch (ignored) { return fresh(); }
  }
}
let S = load();
let saveBase = copyState(S), saveWarned = false, persistAsked = false, saveBlocked = false;
function warnSave() {
  if (saveWarned) return;
  saveWarned = true;
  alert("进度没能保存到本机。请先用「备份 · 换设备」导出进度码，再检查浏览器存储空间。");
}
function rejectStalePage() {
  if (saveBlocked) return;
  saveBlocked = true;
  alert("另一个页面已更改此档案的进度。此页的冲突改动未保存，页面将重新载入最新进度。");
  location.reload?.();
}
function flushSaves() {
  storageLocks.request(KEY, () => {
    processSaveJournal(true);
    if (localStorage.getItem(conflictKey + pageId)) rejectStalePage();
  }).catch(warnSave);
}
function save(replaceId) {
  if (saveBlocked) return;
  try {
    const next = copyState(S);
    const time = lastSaveTime = Math.max(Date.now(), lastSaveTime);
    const log = { base: saveBase, next, replaceId, owner: pageId, time, seq: ++saveSeq };
    if (storageLocks) {
      const key = journalPrefix + pageId + ":" + log.seq;
      localStorage.setItem(key, JSON.stringify(log));
      flushSaves();
    } else {
      const { state } = readStoredState();
      let merged;
      try { merged = mergeSave(state, log); }
      catch (e) { rejectStalePage(); return; }
      localStorage.setItem(KEY, JSON.stringify(merged));
    }
    saveBase = next;
  } catch (e) { warnSave(); return; }
  if (!persistAsked && navigator.storage?.persist) {
    persistAsked = true;
    navigator.storage.persist().catch(() => {});
  }
}
if (storageLocks) {
  window.addEventListener("storage", event => {
    if (event.key === conflictKey + pageId && event.newValue) rejectStalePage();
  });
  flushSaves();
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
function ensureToday(date = todayStr()) {
  const p = prof();
  if (!p.today || p.today.d !== date) p.today = { ...blankDay(), d: date };
  if (!p.hist[date]) p.hist[date] = { n: 0, sec: 0 };
  return date;
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
    b.setAttribute("aria-pressed", String(S.sel === i));
    b.title = lvSub(L, i) + " · 共 " + totalGuan(i) + " 关";
    b.style.setProperty("--c", lv.c);
    b.style.setProperty("--cd", lv.cd);
    b.style.setProperty("--bg", lv.bg);
    b.innerHTML = (lv.icon === "flower" ? flowerSVG() : leafSVG()) +
      `<b>${lv.nm}</b><span class="lv-check" aria-hidden="true">✓</span>`;
    b.onclick = () => {
      if (S.sel === i) return;
      S.sel = i;
      save(); renderHome();
      box.children[i]?.focus?.({ preventScroll: true });
    };
    box.appendChild(b);
  });
}
const totalGuan = i => Math.ceil(DATA[i].p.length / N_TI);

function renderWho() {
  $("whoName").textContent = prof().name;
  $("whoBtn").setAttribute("aria-label", "练习档案：" + prof().name);
  $("whoBtn").setAttribute("aria-expanded", String(!$("whoPanel").classList.contains("hide")));
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
    row.innerHTML = `<span class="pn"></span><span class="pm"></span>`;
    row.querySelector(".pn").textContent = p.name;        // 名字是用户输入，别当 HTML 插
    row.querySelector(".pm").textContent = sum;
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
      if (i < S.cur) S.cur--;                 // 删的是前面的档案，当前孩子的下标要跟着前移
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
    S.profiles.push(createProfile(t));
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
  document.querySelectorAll("#rowMin [data-min]").forEach(b => b.classList.toggle("on", +b.dataset.min === S.min));
  const quota = S.min * 60 + (p.today.bonus || 0);
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
  const windowDays = 84;
  const start = new Date(end);
  start.setDate(start.getDate() - (windowDays - 1));
  // 左侧补空以对齐星期列，同时保留完整的 84 个日期。
  const lead = (start.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) {
    const blank = document.createElement("div");
    blank.className = "cell empty";
    cal.appendChild(blank);
  }
  let sum = 0, active = 0;
  for (let i = windowDays - 1; i >= 0; i--) {
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
    if (n > 0) { sum += n; active++; }
  }
  $("calSum").textContent = "近 12 周 " + sum + " 题 · " + active + " 天有做题";
  $("calSumLabel").textContent = "近 12 周累计";
  $("calHint").textContent = "最近 12 周每天做了多少题（每格一天，从周一到周日）";
  $("streakRow").classList.add("hide");
  $("calHead").classList.add("hide");
  $("mapSeg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === mapView));
}
function renderCal() {
  if (mapView === "12w") { renderCal12(); return; }
  $("cal").classList.remove("rolling");
  $("streakRow").classList.remove("hide");
  $("calHead").classList.remove("hide");
  $("calSumLabel").textContent = "本月累计";
  $("calHint").textContent = "本月每天做了多少题";
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
  // 连续天数：今天还没做时从昨天往前数，别让早上一打开就显示「连续 0 天」
  let streak = 0;
  const d0 = new Date();
  const dkey = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const nOf = d => (p.hist[dkey(d)] && p.hist[dkey(d)].n) || 0;
  const todayZero = nOf(d0) === 0;
  if (todayZero) d0.setDate(d0.getDate() - 1);
  while (nOf(d0) > 0) { streak++; d0.setDate(d0.getDate() - 1); }
  $("streak").textContent = "连续 " + streak + " 天" + (todayZero && streak ? "（今天还没做）" : "");
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
  $("wrongMore").textContent = p.wrong.length > 8 ? "（共 " + p.wrong.length + " 条，显示最近 8 条）" : "";
  const box = $("wrongList");
  if (!p.wrong.length) {
    box.innerHTML = '<div class="emptyLine">还没有错题</div>';
    return;
  }
  box.innerHTML = "";
  p.wrong.slice(0, 8).forEach(it => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "wrow";
    const lv = LEVELS[it.lv] ? LEVELS[it.lv].nm : "";
    row.innerHTML = `<span class="wn">${lv} · 第${it.round}轮 第${it.guan}关</span>` +
      `<span class="wr">第 ${it.ti} 题 · ${it.reason}</span><span class="wrong-date">${it.d || ""}</span>`;
    row.onclick = () => practiceWrong(it);
    box.appendChild(row);
  });
}

// 只标已完成和当前题。存档没有逐题的对错顺序，成绩单独显示。
function renderProgress(id, done, current = false) {
  const dots = $(id);
  dots.innerHTML = "";
  for (let i = 0; i < N_TI; i++) {
    const d = document.createElement("i");
    d.className = i < done ? "done" : i === done && current ? "cur" : "";
    dots.appendChild(d);
  }
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
  $("ringtxt").textContent = dDone + " / " + N_TI;
  renderProgress("dots", dDone);

  const target = targetOf(L.round);
  $("roundLine").textContent = "本轮 " + L.done + " / " + target + " 题" +
    (L.done >= target ? " · 已完成" : "");

  const started = L.active || L.done > 0 || L.plays > 0;
  $("resume").classList.toggle("hide", cleared);
  $("resume").textContent = started ? "继续闯关" : "开始闯关";
  $("challengeLabel").textContent = cleared ? "全部通关" : started ? "上次练到" : "准备闯关";
  $("newRun").classList.toggle("hide", !cleared);
  const status = cleared ? lv.nm + " " + totalGuan(S.sel) + " 关全部完成。重刷将从第 1 轮开始。"
    : L.active && L.wrong === 1 ? "已错 1 题，再错 1 题，本关不通过。"
    : L.active && L.wrong >= 2 ? "本关已错 " + L.wrong + " 题，不能通过。" : "";
  $("newHint").textContent = status;
  $("newHint").classList.toggle("hide", !status);

  $("limitSeg").querySelectorAll("button").forEach(b => {
    const selected = +b.dataset.s === S.limit;
    b.classList.toggle("on", selected);
    b.setAttribute("aria-pressed", String(selected));
  });
  $("limitSummary").textContent = "首手 " + S.limit + " 秒";

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
let practice = false, practiceLine = null, ansIdx = 0, peekAns = false;
let wrongReview = null;   // 错题集重做独立于闯关后的跟走练习
let mapView = "month";
let tiStart = 0, dayTimer = null;

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
function hideMask() {
  $("mask").classList.add("hide");
  var acts = $("maskActs"); if (acts) acts.innerHTML = "";
}

/* ---------- 每题倒计时 ---------- */
let cdEnd = 0, cdLeft = null, cdTimer = null;
function expireFirstMove() {
  if (practice || answered || firstMove || !cdTimer || Date.now() < cdEnd) return false;
  tickCd();
  return true;
}
function tickCd() {
  const left = Math.max(0, cdEnd - Date.now());
  cdLeft = left;
  const el = $("clock");
  el.textContent = "首手 " + Math.max(0, Math.ceil(left / 1000)) + " 秒";
  el.classList.toggle("warn", left <= 10000);
  if (left <= 0) { stopCd(); tiFailed("timeout"); }
}
function startCd(ms) {
  stopCd();
  cdLeft = ms; cdEnd = Date.now() + ms;
  const el = $("clock");
  el.className = "";
  cdTimer = setInterval(tickCd, 100);
  tickCd();
}
function stopCd() {
  if (cdTimer) clearInterval(cdTimer);
  cdTimer = null;
  cdLeft = null;
}
function pauseCd() {
  if (!cdTimer || expireFirstMove()) return;
  const remaining = Math.max(0, cdEnd - Date.now());
  stopCd();
  cdLeft = remaining;
}
function resumeCd() {
  if (cdTimer || practice || answered || firstMove || cdLeft === null) return;
  startCd(cdLeft);
}

/* ---------- 每日时间（做题页停留时长） ---------- */
// 口径：今天在做题页待了多久。答题、看答案、过关结算、跟走练习都算；
// 回首页 / 切到后台就停。today.sec 由这段计时器每秒写入，所以「今日剩」是活的。
let dayBaseMs = 0, dayRunAt = 0, dayDate = "";   // dayDate：基准属于哪一天          // 已累计的毫秒 + 本段计时起点（0 = 停着）
function daySpentMs() { return dayBaseMs + (dayRunAt ? Date.now() - dayRunAt : 0); }
function dayPause() {
  if (!dayRunAt) return;
  dayBaseMs = daySpentMs();
  dayRunAt = 0;
}
function dayQuotaSec() { return S.min * 60 + ((prof().today && prof().today.bonus) || 0); }
function syncDayClock() {
  const date = todayStr();
  if (dayDate && dayDate !== date) {
    dayBaseMs = 0;
    if (dayRunAt) dayRunAt = Date.now();
    dayDate = date;
  }
  return ensureToday(date);
}
function dayLeftSec() {
  syncDayClock();
  return Math.max(0, dayQuotaSec() - daySpentMs() / 1000);
}
// 每次现算：切到「自由」、换孩子、过零点都自动失效，不会留一个粘住的标志
function isTimeUp() { return S.mode === "time" && dayLeftSec() <= 0; }
// 进入做题页时，把基准对齐到档案里已存的 today.sec
function dayBind() { ensureToday(); dayBaseMs = prof().today.sec * 1000; dayRunAt = 0; dayDate = todayStr(); }
function startDayTimer() {
  if (dayTimer) { clearInterval(dayTimer); dayTimer = null; }
  dayPause();                              // 上一段先折进 base，再从这儿接着走
  const timed = S.mode === "time";
  $("dayline").classList.toggle("hide", !timed);
  if (!dayRunAt) dayRunAt = Date.now();
  const tick = () => {
    const date = syncDayClock();
    const p = prof(), spent = Math.round(daySpentMs() / 1000);
    if (spent > p.today.sec) {              // 每秒把时长写进档案，顺手刷新地图用的 hist
      p.today.sec = spent;
      p.hist[date].sec = spent;
      if (!(spent % 10)) save();
    }
    if (!timed) return;
    const left = dayLeftSec();
    const total = dayQuotaSec();
    const s = Math.max(0, Math.floor(left % 60));
    $("dayLeft").textContent = "今日剩 " + Math.floor(left / 60) + ":" + String(s).padStart(2, "0");
    $("dayTotal").textContent = "共 " + Math.round(total / 60) + " 分钟";
  };
  tick();
  dayTimer = setInterval(tick, 1000);
}
function stopDayTimer() {
  if (dayTimer) { clearInterval(dayTimer); dayTimer = null; }
  dayPause();
  $("dayline").classList.add("hide");
}

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
  $("boardFrame").style.setProperty("--board-ratio", W / H);
  let g = `<defs><linearGradient id="boardWood" x2=".93" y2="1">
             <stop stop-color="#edca8b"/><stop offset="1" stop-color="#dfb173"/>
           </linearGradient></defs><rect width="${W}" height="${H}" fill="url(#boardWood)" rx="6"/>`;
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
  svg._c1 = c1; svg._r1 = r1;
  return caps;
}

/* ---------- 判题 ---------- */
function branchStep(lines, st, r, c, question) {
  let aliveOK = lines.filter(b => { const p = b[st]; return p && p[0] === r && p[1] === c; });
  if (!aliveOK.length) return { alive: aliveOK, hit: false, white: null, step: st, done: false };
  // 一题有多解时，若题目自带一条"首选解" q，走到该线路上的点时优先沿用这条线路，
  // 避免共享前缀的另一条短解把题目提前判完（如级位 541 题）。
  const preferred = (question && question.qa && question.qa.length) ? question.q : null;
  if (preferred && preferred[st] && preferred[st][0] === r && preferred[st][1] === c) {
    const exact = aliveOK.filter(b => b[st] && b[st][0] === r && b[st][1] === c &&
      b.length === preferred.length &&
      b.every((p, i) => p[0] === preferred[i][0] && p[1] === preferred[i][1]));
    if (exact.length) aliveOK = exact;
  }
  const line = aliveOK[0];
  let s = st + 1;
  const white = s < line.length ? line[s] : null;
  if (white) {
    s++;
    // 白棋只能应一手：和这手应法不一致的线路要剔掉，否则下一手可能按「白棋没这么应」的线路判对，
    // 再把那条线路的白子摆到别处（多解题里有十几处这种分叉，如级位 172、段位 35 题）。
    // 在黑这手就结束的线路保留，维持原来「有一条走完就算解出」的判法。
    aliveOK = aliveOK.filter(b => b.length <= st + 1 || (b[st + 1][0] === white[0] && b[st + 1][1] === white[1]));
  }
  return { alive: aliveOK, hit: true, white, step: s, done: aliveOK.some(b => s >= b.length) };
}
// 把 SVG 视图坐标换算为棋盘交叉点；棋盘外（含木质边框）返回 null，不再 clamp 到边缘
function tapPoint(e) {
  const el = e.currentTarget, rect = el.getBoundingClientRect(), vb = el.viewBox.baseVal;
  const px = (e.clientX - rect.left) / rect.width * vb.width;
  const py = (e.clientY - rect.top) / rect.height * vb.height;
  const c = Math.round((px - ox) / cell) + el._c0;
  const r = Math.round((py - oy) / cell) + el._r0;
  if (r < el._r0 || r > el._r1 || c < el._c0 || c > el._c1) return null;
  if (Math.abs(px - (ox + (c - el._c0) * cell)) > cell * 0.45 ||
      Math.abs(py - (oy + (r - el._r0) * cell)) > cell * 0.45) return null;
  return [r, c];
}

function onTap(e) {
  if (practice) { onPracticeTap(e); return; }
  if (answered || expireFirstMove()) return;
  const pt = tapPoint(e);
  if (!pt) { fb("请点在棋盘交叉点上（边框不算落子）。", ""); return; }
  const r = pt[0], c = pt[1];

  const bad = illegalReason(r, c);
  if (bad) { fb("此处不可落子：" + bad + "（不算错，换个点）", ""); return; }

  const j = branchStep(alive, step, r, c, cur);
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
      el2.textContent = "首手已通过";
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
  const date = syncDayClock();
  const p = prof(), L = slotState();
  p.stat.ok++;
  p.today.fo++;
  p.today.n++;
  p.hist[date].n = p.today.n;
  L.done++;
  L.guanDone++;
  L.bestRound = Math.max(L.bestRound, L.round);
  L.left = 0;
  const okN = correctOf(L);
  if (L.guanDone >= N_TI) pendingResult = settleGuan(L, S.sel, p.stat);   // 第 10 题：当场结算并存档
  save();
  SFX.ok();
  draw();
  $("pcount").textContent = okN;
  renderProgress("playDots", pendingResult ? N_TI : L.guanDone);
  fb("解题成功！本关已对 " + okN + " 题。", "ok");
  if (S.auto) { clearTimeout(autoTimer); autoTimer = setTimeout(afterTi, 800); }
  else showNext("下一题", afterTi);
}
function tiFailed(reason, r, c) {
  if (answered) return;
  answered = true;
  stopCd();
  $("skipBtn").classList.add("hide");
  const date = syncDayClock();
  const p = prof(), L = slotState();
  const failedTi = tiNo(L), failedGuan = guanNo(L);
  L.wrong++;
  L.done++;
  L.guanDone++;
  L.left = 0;
  if (reason === "wrong") { p.stat.wrong++; wrongMarks.push([r, c]); draw(); SFX.wrong(); }
  else {
    if (reason === "skip") p.stat.skip = (p.stat.skip | 0) + 1;   // 主动跳过单独计，不混进「超时次数」
    else p.stat.timeout++;
    SFX.timeup();
  }
  p.today.fa++;
  p.today.n++;
  p.hist[date].n = p.today.n;
  // 错题集
  const item = {
    lv: S.sel, idx: Math.min(L.done - 1, bankLen() - 1), no: cur.no || 0,
    reason: reason === "wrong" ? "落子错误" : (reason === "skip" ? "主动跳过" : "超时"),
    d: date, round: L.round, guan: failedGuan, ti: failedTi
  };
  p.wrong = [item].concat(p.wrong.filter(w => !(w.lv === item.lv && w.idx === item.idx))).slice(0, 100);
  const wrongN = L.wrong, okN = correctOf(L), restN = N_TI - L.guanDone;
  const guanEnd = L.guanDone >= N_TI;
  if (guanEnd) pendingResult = settleGuan(L, S.sel, p.stat);   // 第 10 题：当场结算并存档
  save();
  $("pwrong").textContent = wrongN;
  $("pcount").textContent = okN;
  renderProgress("playDots", guanEnd ? N_TI : L.guanDone);
  $("clock").className = "stopped";
  $("clock").textContent = reason === "timeout" ? "首手超时" : "计时已停";
  const why = reason === "skip" ? "已跳过，记 1 错。"
    : reason === "timeout" ? "首手时间到，记 1 错。" : "这手没走对。";
  fb(why + (wrongN >= 2 && restN > 0
    ? " 本关不能通过，可做完剩下 " + restN + " 题，或重新开始。"
    : guanEnd ? " 本关已做完。" : " 可以先看看正解。"), "no");
  syncRestart();
  $("ansBtn").classList.remove("hide");
  // 原盘规矩：错几题都不中止，一律把 10 题走完，第 10 题做完再弹结算。
  if (guanEnd) {
    $("nextBtn").classList.add("hide");
    $("restartGuan").classList.add("hide");
    clearTimeout(autoTimer);
    autoTimer = setTimeout(afterTi, 900);     // 让最后一手的反馈露一下，再自动结算
  } else {
    showNext("下一题", afterTi);
  }
}

let pendingResult = null;       // 第 10 题做完时 settleGuan 的结果；状态已经存好，这里只等着弹窗
function afterTi() {
  hideAnswer();
  if (pendingResult) { const r = pendingResult; pendingResult = null; showGuanResult(r); return; }
  if (isTimeUp()) { showTimeUp(); return; }
  enterTi();
}
// 结算弹窗上的「继续」：时间到了就先弹时间到
function nextAfterMask() {
  if (isTimeUp()) { showTimeUp(); return; }
  hideMask(); enterTi();
}
function showGuanResult(r) {
  $("nextBtn").classList.add("hide");
  $("restartGuan").classList.add("hide");
  $("pcount").textContent = r.correct;
  $("pwrong").textContent = r.wrong;
  if (r.kind === "fail") { showGuanFailed(r); return; }
  SFX.done();
  if (r.kind === "pass") {
    fb("第 " + r.no + " 关通过 · 对 " + r.correct + " 题 错 " + r.wrong + " 题", "ok");
    setMask("恭喜您过了上关", "对 " + r.correct + " 题 · 错 " + r.wrong + " 题。准备好了吗？",
            "开始第 " + (r.no + 1) + " 关", nextAfterMask);
  } else if (r.kind === "round") {
    setMask("第 " + r.doneRound + " 轮完成", "对 " + r.correct + " 题 · 错 " + r.wrong + " 题。下一轮 " +
            Math.min((r.doneRound + 1) * ROUND_UNIT, bankLen()) + " 题，从第 1 关重新开始。",
            "开始第 " + (r.doneRound + 1) + " 轮", nextAfterMask);
  } else {
    setMask("全部通过！", LEVELS[S.sel].nm + "的 " + totalGuan(S.sel) + " 关全部走完了。回首页点「重刷」可以从第 1 轮再来。",
            "回首页", () => { hideMask(); goHome(); });
  }
}
function showGuanFailed(r) {
  $("fb").classList.add("hide");
  $("ansBtn").classList.add("hide");
  $("skipBtn").classList.add("hide");
  // 和原盘一样：10 题走完直接弹「本关不通过」，点一下就回本关第 1 题
  setMask("本关不通过",
          "第 " + r.no + " 关 · 对 " + r.correct + " 题 错 " + r.wrong + " 题。只允许错 1 题，从第 1 题再来一次。",
          "重新开始本关", nextAfterMask);
}

/* ---------- 进入一题 ---------- */
function enterTi() {
  const L = slotState();
  ensureToday();
  const b = bank();
  cur = b[Math.min(L.done, b.length - 1)];
  placed = []; step = 0; answered = false; firstMove = false;
  pendingResult = null;                    // 结算前退出过的话，旧弹窗不再补弹（状态早已存好）
  wrongMarks = [];
  practice = false; practiceLine = null;
  alive = cur.qa && cur.qa.length ? cur.qa.slice() : [cur.q || []];
  hideMask();
  $("fb").classList.remove("hide");
  hideAnswer();
  clearTimeout(autoTimer);
  $("phead").textContent = LEVELS[S.sel].nm + " · 第 " + L.round + " 轮 · 第 " + guanNo(L) + " 关 · 第 " + tiNo(L) + " / " + N_TI + " 题";
  $("playScore").classList.remove("hide");
  $("playDots").classList.remove("hide");
  renderProgress("playDots", L.guanDone, true);
  $("goal").textContent = cur.t || "黑先";
  $("pno").textContent = cur.no || "—";
  $("pbest").textContent = L.bestRound || 0;
  $("pcount").textContent = correctOf(L);
  $("pwrong").textContent = L.wrong;
  $("skipBtn").classList.remove("hide");
  $("skipBtn").disabled = true;
  setTimeout(() => { if (!answered && !practice) $("skipBtn").disabled = false; }, 700);
  syncRestart();
  fb(L.wrong === 0 ? "请在棋盘交叉点落子。第一手走对后不再计时。"
     : (L.wrong === 1 ? "本关已错 1 题，再错 1 题，本关不通过。"
        : "本关不能通过，可做完剩余题目或重新开始。"), "");
  draw();
  const left = L.left > 0 ? Math.min(L.left, S.limit * 1000) : S.limit * 1000;
  L.left = 0;
  save();
  tiStart = Date.now();
  startCd(left);
  startDayTimer();                         // 确保计时在跑（不重置基准）
}
// 错满 2 题本关已经判死，给一个"重开本关"的显式出口
function syncRestart() {
  const L = slotState();
  $("restartGuan").classList.toggle("hide", !(L.active && !practice && L.wrong >= 2));
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
  $("ansRow").querySelectorAll(".answer-choice").forEach((b, i) => {
    b.classList.toggle("on", i === idx);
    b.setAttribute("aria-pressed", String(i === idx));
  });
  const total = lines.length;
  fb((total > 1 ? "正解 " + (idx + 1) + " / " + total + "：" : "看正解：") +
     "红圈标出第一手，数字标出手顺。", "");
}
function showAnswerRow() {
  // 第 10 题挂着 900ms 的自动结算定时器；先看答案就先把它取消，
  // 否则答案刚显示就被 afterTi() 连带结算弹窗一起冲掉。
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  const row = $("ansRow");
  const lines = aliveLines();
  row.innerHTML = "";
  if (lines.length > 1) {
    const choices = document.createElement("div");
    choices.className = "answer-choices";
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "切换正解");
    lines.forEach((_, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip answer-choice"; b.textContent = "正解 " + (i + 1);
      b.onclick = () => markLine(i);
      choices.appendChild(b);
    });
    row.appendChild(choices);
  }
  const wb = document.createElement("button");
  wb.type = "button"; wb.className = "btn walk"; wb.id = "walkBtn"; wb.textContent = "自己再走一次";
  wb.onclick = () => startPractice();
  row.appendChild(wb);
  // 第 10 题看完答案后要给一条继续结算的路；定时器已取消，不能干等着。
  if (pendingResult) {
    const cb = document.createElement("button");
    cb.type = "button"; cb.className = "btn"; cb.id = "answerDoneBtn"; cb.textContent = "看好了，继续";
    cb.onclick = () => { clearTimeout(autoTimer); autoTimer = null; afterTi(); };
    row.appendChild(cb);
  }
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
  peekAns = false;                 // 先不给答案码，凭记忆走
  placed = []; step = 0; answered = false; wrongMarks = [];
  firstMove = true;
  stopCd();                        // 只停每题倒计时；今日时长照走（这也是做题页）
  $("clock").className = "done";
  $("clock").textContent = "练习 · 不计时";        // 跟走不计时，别留一个像还在倒计时的秒数
  alive = [practiceLine];
  showNext("下一题", afterTi);
  $("restartGuan").classList.add("hide");
  $("ansBtn").textContent = "看答案";
  $("ansBtn").classList.remove("hide");  // 记不住可以临时调出来
  draw(); markGuide();                    // markGuide 按 peekAns 决定要不要标答案
  fb(practiceTip(), "");
}
// 跟走默认一手都不标（凭记忆走），点「看答案」才把整条手顺调出来
function practiceTip() {
  if (peekAns) return "整条手顺在这里（1、2、3…）。看完点「收起答案」，再自己走。";
  return "凭记忆走一遍：走对了白棋会自动应。记不住就点「看答案」，不算错。";
}
function toggleGuide() {
  peekAns = !peekAns;
  draw();
  if (peekAns) {
    if (wrongReview) {
      wrongReview.independent = false;
      practiceLine = aliveLines()[0]?.line || [];
      $("reviewRetry").classList.remove("hide");
    }
    markGuide();
  }
  $("ansBtn").textContent = peekAns ? "收起答案" : "看答案";
  fb(wrongReview ? wrongReviewTip() : practiceTip(), "");
}
function markGuide() {
  const svg = $("svg"), marks = $("marks");
  if (!marks) return;
  if (!practiceLine || !peekAns) { marks.innerHTML = ""; return; }   // 不看答案就一手都不标
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
  const pt = tapPoint(e);
  if (!pt) { fb("请点在棋盘交叉点上（边框不算落子）。", ""); return; }
  const r = pt[0], c = pt[1];
  const bad = wrongReview ? illegalReason(r, c) : (playBoard().board[r][c] !== 0 ? "已经有子" : null);
  if (bad) { fb("此处不可落子：" + bad + "（不算错，换个点）", ""); return; }
  const j = branchStep(alive, step, r, c, cur);
  if (!j.hit) {
    if (wrongReview) {
      wrongReview.independent = false;
      $("reviewRetry").classList.remove("hide");
      fb("这手不对，本次会保留错题。可以继续学，或点「重新挑战」。", "no");
    } else fb(peekAns ? "这手不对，照编号走。" : "这手不对。记不住就点「看答案」偷看一眼。", "no");
    return;
  }
  alive = j.alive;
  placed.push([r, c, 1]);
  SFX.stone();
  if (j.white) { placed.push([j.white[0], j.white[1], 2]); setTimeout(() => SFX.white(), 130); }
  step = j.step;
  draw();
  if (j.done) {
    answered = true;
    if (wrongReview) finishWrongReview();
    else { fb("整条走完了！这题算你会了。", "ok"); $("nextBtn").classList.remove("hide"); }
  } else {
    if (peekAns) {
      if (wrongReview) practiceLine = aliveLines()[0]?.line || [];
      markGuide();
    }
    fb("对，继续。", "ok");
  }
}
function hideAnswer() {
  wrongReview = null;
  $("reviewRetry").classList.add("hide");
  $("ansBtn").classList.add("hide");
  $("ansBtn").textContent = "看正解";
  $("nextBtn").classList.add("hide");
  $("skipBtn").classList.add("hide");
  practice = false;
  peekAns = false;
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
            ensureToday();
            prof().today.bonus = (prof().today.bonus || 0) + 300;   // 只加今天、只加这个孩子
            save();
            hideMask();
            enterTi();
          });
  var acts = $("maskActs");
  if (!acts) {
    acts = document.createElement("div");
    acts.id = "maskActs";
    acts.className = "racts";
    $("mask").appendChild(acts);
  }
  acts.innerHTML = "";
  var quitBtn = document.createElement("button");
  quitBtn.type = "button";
  quitBtn.className = "btn quiet";
  quitBtn.textContent = "今天不做了，回首页";
  quitBtn.onclick = () => { acts.innerHTML = ""; goHome(); };
  acts.appendChild(quitBtn);
}

/* ---------- 错题练习 ---------- */
function wrongReviewTip() {
  if (peekAns) return "可以跟着编号走。本次会保留错题；学完可点「重新挑战」。";
  if (!wrongReview.independent) return "本次会保留错题，点「重新挑战」可以从头独立再做。";
  return "不看答案、整题一次走对，就会移出错题集。不计分、不限时。";
}
function finishWrongReview() {
  $("ansBtn").classList.add("hide");
  if (!wrongReview.independent) {
    fb("整条走完了！这题仍在错题集，可以再独立挑战一次。", "ok");
    return;
  }
  const { item, profileId } = wrongReview;
  const p = S.profiles.find(profile => profile.id === profileId);
  if (p && p.wrong.includes(item)) {
    p.wrong = p.wrong.filter(w => w !== item);
    save();
  }
  $("reviewRetry").classList.add("hide");
  fb("已掌握，已移出错题集！", "ok");
}
function practiceWrong(it) {
  const q = DATA[it.lv]?.p[it.idx];
  if (!q) return;
  const retrying = wrongReview?.item === it;
  hideAnswer();
  cur = q;
  practiceLine = null;
  practice = true;
  wrongReview = { item: it, profileId: prof().id, independent: true };
  placed = []; step = 0; answered = false; wrongMarks = [];
  firstMove = true;
  stopCd();
  alive = cur.qa?.length ? cur.qa.slice() : [cur.q || []];
  $("home").classList.add("hide");
  $("play").classList.remove("hide");
  $("whoPanel").classList.add("hide");
  $("whoBtn").setAttribute("aria-expanded", "false");
  window.scrollTo?.(0, 0);
  $("fb").classList.remove("hide");
  if (!retrying) { dayBind(); startDayTimer(); }   // 重新挑战不重置当天累计时长
  $("phead").textContent = "错题练习 · " + LEVELS[it.lv].nm + "第 " + (cur.no || "?") + " 号";
  $("playScore").classList.add("hide");
  $("playDots").classList.add("hide");
  $("goal").textContent = cur.t || "黑先";
  $("pno").textContent = cur.no || "—";
  $("pbest").textContent = prof().lv[it.lv].bestRound || 0;
  $("pcount").textContent = 0;
  $("pwrong").textContent = 0;
  $("clock").className = "done";
  $("clock").textContent = "练习 · 不计时";
  $("restartGuan").classList.add("hide");
  $("ansBtn").textContent = "看答案";
  $("ansBtn").classList.remove("hide");
  $("reviewRetry").onclick = () => practiceWrong(it);
  hideMask();
  draw();
  fb(wrongReviewTip(), "");
  showNext("返回首页", goHome);
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
  save();
}
function enterPlay() {
  SFX.unlock();
  $("home").classList.add("hide");
  $("play").classList.remove("hide");
  $("whoPanel").classList.add("hide");
  $("whoBtn").setAttribute("aria-expanded", "false");
  window.scrollTo?.(0, 0);
  dayBind();                 // 这一段从档案里已存的时长接着算
  startDayTimer();
  if (isTimeUp()) { showTimeUp(); return; }  // 时间到不能被回首页/结算弹窗绕过
  enterTi();
}
// 本题第一手还没走时离开（回首页 / 切后台 / 被系统杀掉），把剩余秒数记下来，回来接着倒数，
// 不然「返回 → 继续」就能把倒计时刷回满格。
function stashLeft() {
  if (!cdTimer || answered || firstMove || practice || expireFirstMove()) return;
  const L = slotState();
  L.left = Math.max(1, cdEnd - Date.now());
  save();
}
function goHome() {
  stashLeft();
  clearTimeout(autoTimer); autoTimer = null;
  stopCd(); stopDayTimer();
  SFX.cancel();
  practice = false;
  hideMask();
  hideAnswer();
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
  if (L.active && !confirm("从第 1 轮第 1 关重新开始？\n\n本难度全部进度会清空；最佳轮次保留。")) return;
  startRun();
  enterPlay();
};
$("quit").onclick = goHome;
$("whoBtn").onclick = () => {
  const closed = $("whoPanel").classList.toggle("hide");
  $("whoBtn").setAttribute("aria-expanded", String(!closed));
};

$("ansBtn").onclick = () => { if (practice) toggleGuide(); else showAnswerRow(); };
$("skipBtn").onclick = () => {
  if (answered || expireFirstMove()) return;
  if ($("skipBtn").disabled || Date.now() - tiStart < 700) return;   // 刚翻到这一题，挡掉连点/布局上移带来的误触
  if (!confirm("跳过这题？会记一次错（本关只允许错 1 题）。")) return;
  if (!expireFirstMove()) tiFailed("skip");
};
// 错满 2 题后重开本关：本关做过的题清零，从本关第 1 题重来
$("restartGuan").onclick = () => {
  const L = slotState();
  if (!confirm("重新开始第 " + guanNo(L) + " 关？\n\n本关做过的题会清零，从第 1 题重来；今天的做题数和错题集都保留。")) return;
  L.done = Math.max(0, L.done - L.guanDone);
  L.guanDone = 0;
  L.wrong = 0;
  L.left = 0;
  L.active = true;
  save();
  $("ansRow").classList.add("hide");
  enterTi();
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
  const readInt = (id, max) => {
    const n = Number($(id).value);
    return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
  };
  const round = readInt("mSetRound", maxR);
  const target = Math.min((round || 1) * ROUND_UNIT, DATA[lv].p.length);
  const maxG = Math.max(1, Math.ceil(target / N_TI));
  $("mSetGuan").max = String(maxG);
  const guan = readInt("mSetGuan", maxG), ti = readInt("mSetTi", N_TI);
  if (round === null || guan === null || ti === null) {
    $("mSetHint").textContent = "请输入整数：轮次 1–" + maxR + "，关号 1–" + maxG + "，题号 1–" + N_TI + "。";
    return null;
  }

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
  if (!m) return;
  if (!confirm("把" + LEVELS[m.lv].nm + "设成第 " + m.round + " 轮、从第 " + m.guan + " 关第 " + m.ti + " 题开始？\n\n会覆盖这个难度原来的进度。")) return;
  const L = prof().lv[m.lv];
  L.round = m.round;
  L.done = m.done;
  L.guanDone = m.ti - 1;
  L.wrong = 0;
  L.active = true;
  L.left = 0;
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
function dayOffset(dstr, end = todayStr()) {
  const a = String(dstr).split("-").map(Number), b = end.split("-").map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some(n => !Number.isFinite(n))) return 0;
  return Math.max(0, (Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
/** 保留旧版可读的字符图，另外记录超过 35 题的日期和精确数量。 */
function packMap(p, end = todayStr()) {
  const days = [], extra = [];
  for (let i = MAP_MAX_DAYS - 1; i >= 0; i--) {
    const n = p.hist[shiftDay(end, -i)]?.n || 0;
    days.push(Math.min(35, Math.max(0, n)).toString(36));
    if (n > 35) extra.push([i, n]);
  }
  const str = days.join("").replace(/^0+/, "");
  if (!str) return null;
  return extra.length ? [end, str, extra] : [end, str];
}
function unpackMap(m) {
  const out = {};
  if (!Array.isArray(m) || m.length < 2) return out;
  const [end, str, extra = []] = m;
  for (let i = 0; i < str.length; i++) {
    const n = parseInt(str[i], 36);
    if (n > 0) out[shiftDay(end, i - str.length + 1)] = n;
  }
  for (const [offset, n] of extra) out[shiftDay(end, -offset)] = n;
  return out;
}
function packPortable(withWrong, withMap) {
  const p = prof();
  const date = todayStr();
  const t = p.today?.d === date ? p.today : blankDay();
  const o = {
    v: 6, nm: p.name, at: Date.now(),
    lv: p.lv.map(L => [L.round, L.done, L.guanDone, L.wrong, L.active ? 1 : 0, L.plays, L.bestRound]),
    t: [date, t.n, t.sec, t.fo, t.fa],
    s: p.stat
  };
  if (withMap) { const m = packMap(p, date); if (m) o.m = m; }
  if (withWrong) o.w = p.wrong.slice(0, 60).map(w => [w.lv, w.idx, RCODE[w.reason] || 1, dayOffset(w.d, date), w.round || 1]);
  return JSON.stringify(o);
}
function cleanName(s) {
  return Array.from(String(s || "").replace(/[<>]/g, "").replace(/\s+/g, " ")).slice(0, 12).join("").trim();
}
const validBackupDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && shiftDay(d, 0) === d;
const backupInt = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
function validatePortable(o) {
  if (!o || o.v !== 6) throw new Error("不是这个应用的进度码");
  const valid = (ok, field) => { if (!ok) throw new Error(field + "记录不完整或格式不正确"); };
  valid(Array.isArray(o.lv) && o.lv.length === 2 && o.lv.every(a =>
    Array.isArray(a) && a.length >= 7 && a.slice(0, 7).every(backupInt)), "闯关");
  if (o.t !== undefined) valid(Array.isArray(o.t) && o.t.length >= 5 && validBackupDate(o.t[0]) && o.t.slice(1, 5).every(backupInt), "今日");
  if (o.s !== undefined) valid(o.s && typeof o.s === "object" && !Array.isArray(o.s) &&
    Object.keys(blankStat()).every(k => o.s[k] === undefined || backupInt(o.s[k])), "战绩");
  if (o.w !== undefined) valid(Array.isArray(o.w) && o.w.length <= 100 && o.w.every(a =>
    Array.isArray(a) && a.length >= 4 && a.slice(0, 5).every(backupInt) &&
    a[0] <= 1 && a[1] < bankLenOf(a[0]) && a[3] <= 365250), "错题");
  if (o.m !== undefined && o.m !== null) {
    const m = o.m;
    valid(Array.isArray(m) && validBackupDate(m[0]) && typeof m[1] === "string" &&
      m[1].length <= MAP_MAX_DAYS && /^[0-9a-z]*$/.test(m[1]) &&
      (m[2] === undefined || (Array.isArray(m[2]) && m[2].length <= MAP_MAX_DAYS && m[2].every(a =>
        Array.isArray(a) && a.length === 2 && a.every(backupInt) && a[0] < MAP_MAX_DAYS && a[1] > 35))), "活跃地图");
  }
}
function applyPortable(o, p) {
  validatePortable(o);
  p = p || prof();
  p.name = cleanName(o.nm || p.name) || p.name;
  if (Array.isArray(o.lv)) {
    p.lv = [0, 1].map(i => {
      const a = o.lv[i] || [];
      return repairLv(normLv({ round: a[0], done: a[1], guanDone: a[2], wrong: a[3], active: !!a[4], plays: a[5], bestRound: a[6] }), i, null);
    });
  }
  if (Array.isArray(o.t) && o.t[0] === todayStr()) {
    p.today = { d: o.t[0], n: +o.t[1] || 0, sec: +o.t[2] || 0, fo: +o.t[3] || 0, fa: +o.t[4] || 0, bonus: 0 };
  }
  if (o.s) {
    p.stat = blankStat();
    for (const k of Object.keys(p.stat)) if (o.s[k] !== undefined) p.stat[k] = o.s[k];
  }
  if (o.m) {
    const m = unpackMap(o.m);
    Object.keys(m).forEach(d => {
      const cur = p.hist[d] || { n: 0, sec: 0 };
      p.hist[d] = { n: Math.max(cur.n || 0, m[d]), sec: cur.sec || 0 };
    });
  }
  if (Array.isArray(o.w)) {
    const backupDay = o.t?.[0] || o.m?.[0] || todayStr();
    p.wrong = o.w.map(([lv, idx, reason, offset, round]) => ({
      lv, idx, reason: RNAME[reason] || "落子错误",
      d: shiftDay(backupDay, -offset), round: round || 1,
      guan: Math.floor(idx / N_TI) + 1, ti: (idx % N_TI) + 1, no: DATA[lv].p[idx].no
    }));
  }
}
const PLAIN_MAX = 1200;     // 不压缩也不超过这个长度就直接出明文码：iOS 16.4 以下的旧设备解不了 gzip
const toB64url = bytes => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // 进度码要放进 URL / 二维码，统一使用 base64url（不含 + / =）
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function encodeCode(str) {
  const bytes = new TextEncoder().encode(str);
  const plain = "GS6P:" + toB64url(bytes);
  if (plain.length <= PLAIN_MAX || typeof CompressionStream === "undefined") return plain;
  try {
    const cs = new CompressionStream("gzip");
    const b = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).blob();
    return "GS6G:" + toB64url(new Uint8Array(await b.arrayBuffer()));
  } catch (e) {
    return plain;
  }
}
async function decodeCode(code) {
  code = String(code || "").trim().replace(/\s+/g, "");
  const m = /^GS6([GP]):(.+)$/.exec(code);
  if (!m) throw new Error("格式不对，是不是没复制全？");
  let body = m[2].replace(/-/g, "+").replace(/_/g, "/");
  while (body.length % 4) body += "=";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (m[1] === "G") {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("这台设备的系统太旧，解不开压缩的进度码（需要 iOS / iPadOS 16.4 以上）。请在原设备取消勾选「错题」「地图」后重新生成，会得到不压缩的码。");
    }
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
  // 兼容旧版 base64（+ / =）和新的 base64url（- _），也兼容 #p= 链接格式
  const m = /#p=(GS6[GP]:[A-Za-z0-9\-_+/=]+)/.exec(text || "");
  const raw = m ? m[1] : String(text || "").trim();
  const mm = /^(GS6[GP]:)([A-Za-z0-9\-_+/=]+)$/.exec(raw);
  if (!mm) return null;
  let body = mm[2].replace(/-/g, "+").replace(/_/g, "/");
  while (body.length % 4) body += "=";
  return mm[1] + body;
}
const hasProgress = p => p.lv.some(L => L.done > 0 || L.plays > 0) || p.wrong.length > 0 ||
  Object.keys(p.hist).some(d => p.hist[d] && (p.hist[d].n > 0 || p.hist[d].sec > 0)) ||
  (p.today && (p.today.n > 0 || p.today.sec > 0)) ||
  (p.stat && Object.keys(p.stat).some(k => p.stat[k] > 0));
async function importCode(code) {
  try {
    const text = await decodeCode(code);
    const o = JSON.parse(text);
    const from = cleanName(o.nm) || "孩子";
    validatePortable(o);
    if ($("asNew") && $("asNew").checked) {
      // 导入为新档案：另起一个孩子，本机已有的档案一个都不动
      if (!confirm("把进度码里「" + from + "」的进度导入为一个新档案？\n\n本机已有的档案都不会被改动。")) return;
      const p = createProfile(from);
      applyPortable(o, p);
      S.profiles.push(p);
      S.cur = S.profiles.length - 1;
      save(); renderHome();
      $("codeHint").textContent = "已新建档案：" + p.name + "（现在是当前孩子）";
      return;
    }
    const cur = prof();
    // 码里的名字和当前档案对不上、当前档案又有进度时，多提醒一句，免得盖掉另一个孩子
    const warn = (from !== cur.name && hasProgress(cur))
      ? "\n\n注意：进度码是「" + from + "」的，当前档案是「" + cur.name + "」，它已有的进度会被盖掉。不想覆盖的话，取消后勾选「导入为新档案」。"
      : "";
    if (!confirm("导入进度码？\n\n会覆盖本机当前档案「" + cur.name + "」的进度（名字、今日、错题、地图）。" + warn)) return;
    const staged = JSON.parse(JSON.stringify(cur));
    applyPortable(o, staged);
    S.profiles[S.cur] = staged;
    save(staged.id); renderHome();
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
  const t = await encodeCode(packPortable($("withWrong").checked, $("withMap").checked));
  $("codeBox").value = t;
  $("qrBox").classList.add("hide");
  $("qrHint").classList.add("hide");
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
  S = { ...fresh(), epoch: pageId + ":" + (saveSeq + 1) }; save(); renderHome();
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { stashLeft(); pauseCd(); stopDayTimer(); save(); }   // 切后台可能就被系统杀掉，先存
  else if (!$("play").classList.contains("hide")) { resumeCd(); startDayTimer(); }
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
                     fb: $("fb").textContent,
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
