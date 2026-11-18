'use strict';

// Older iPhones (before iOS 15.4) don't have Array.at.
if(!Array.prototype.at) Array.prototype.at = function(i){ i = Math.trunc(i) || 0; return this[i < 0 ? i + this.length : i]; };

/* ================= Constants ================= */
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const UNIT = 'lb';
// SHA-256 of the past-workouts password, so the word itself isn't sitting in the source.
const PAST_EDIT_HASH = '3c80353d976990411bc5cce809a682a031da8b1402a223d8688858d6140df730';
const UNLOCK_MINUTES = 10;
const MAX_VIDEO_MB = 300;
// Server for rest alerts, usage counts and the leaderboard (source: APPS/workout-push).
// Previews talk to a local copy (`wrangler dev`) so testing never touches the real board.
const IS_PREVIEW = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const PUSH_URL = IS_PREVIEW ? 'http://127.0.0.1:8787' : 'https://workout-push.marcomorocho11.workers.dev';
const VAPID_PUBLIC_KEY = 'BNV977gDHrz826eNhn7sV_SU9c47u3PUlibbHT3Y9cnPFRh420ZgCfDjYBJikJKdfurHidrhZf8nyOMa3biiZ9w';
// Per-phone keys that never go into a backup file.
const DEVICE_KEYS = ['wt_timer', 'wt_device', 'wt_push', 'wt_lastping', 'wt_lb', 'wt_lbsent', 'wt_unlock'];

const icon = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  check: icon('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
  x: icon('<path d="M7 7l10 10M17 7L7 17"/>', 2.6),
  moon: icon('<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>', 2.2),
  arrow: icon('<path d="M5 12h13M13 7l5 5-5 5"/>', 2.4),
  dot: icon('<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>'),
  dash: icon('<path d="M8 12h8"/>', 2.4),
  chevron: icon('<path d="M9 6l6 6-6 6"/>', 2.2),
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>',
  plus: icon('<path d="M12 5v14M5 12h14"/>', 2.2),
  video: icon('<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/>'),
  lock: icon('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>'),
  unlock: icon('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 6.8-1.2"/>'),
  calCheck: icon('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>'),
  trophy: icon('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"/>'),
  chart: icon('<path d="M4 20h16"/><path d="M5 15.5l4.5-4.5 3.5 3.5L19.5 8"/>'),
};
// Light bulb for every suggestion; its tint still says up, hold, lighter or easing back in.
const BULB = icon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>', 2.2);
const STATUS_ICON = {
  done: ICON.check, partial: ICON.dot, missed: ICON.x, rest: ICON.moon,
  today: ICON.arrow, upcoming: '', none: ICON.dash,
};

/* ================= Small helpers ================= */
const $ = (id) => document.getElementById(id);
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function num(v){ const n = parseFloat(v); return isFinite(n) ? n : 0; }
function fmtNum(n){ return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString(); }
function fmtBig(n){ return Math.round(n).toLocaleString('en-US'); }
function fmtVal(n){ return n >= 1000 ? fmtBig(n) : fmtNum(n); }
function plural(n, word){ return `${n} ${word}${n === 1 ? '' : 's'}`; }
function newId(prefix){ return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`; }
function normName(s){ return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function fmtBytes(b){
  if(b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  const mb = b / 1024 / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
function fmtClock(s){ return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function fmtRest(s){
  if(s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}m ${r}s` : `${m} min`;
}
function debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ================= Dates ================= */
function dateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseKey(k){ return new Date(k + 'T00:00:00'); }
function today0(){ const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dayIndex(d){ return (d.getDay() + 6) % 7; } // Monday = 0
function startOfWeek(d){ const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -dayIndex(x)); }
function weekDates(){ const m = startOfWeek(today0()); return DAYS.map((_, i) => addDays(m, i)); }
function fmtShort(d){ return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`; }
function fmtLong(d){ return `${DAYS[dayIndex(d)]}, ${fmtShort(d)}`; }

/* ================= Storage ================= */
function loadJSON(key, fallback){
  try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch(e){ return fallback; }
}
function saveJSON(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch(e){ toast('Phone storage is full. That change wasn\'t saved.', 'error'); return false; }
}
const getPlan = () => loadJSON('wt_plan', {});
const savePlan = (p) => saveJSON('wt_plan', p);
const getRest = () => loadJSON('wt_rest', {});
const saveRest = (r) => saveJSON('wt_rest', r);
const getSettings = () => loadJSON('wt_settings', {});
const saveSettings = (s) => saveJSON('wt_settings', s);
const getVideoMeta = () => loadJSON('wt_videos', {});
const saveVideoMeta = (m) => saveJSON('wt_videos', m);

function getLog(key){ return normalizeLog(loadJSON('wt_log_' + key, null)); }
function saveLog(key, log){ return saveJSON('wt_log_' + key, log); }
function allLogs(){
  const out = [];
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(!k || !k.startsWith('wt_log_')) continue;
    const date = k.slice(7);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const log = getLog(date);
    if(log) out.push({date, log});
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function blankEntry(){ return {w:'', r:'', done:false}; }

// Logs from the first version stored a checkbox per set plus one free-text note.
// Turn those into per-set entries in memory; nothing is rewritten until the day changes.
function normalizeLog(log){
  if(!log || typeof log !== 'object') return null;
  if(typeof log.isRest === 'undefined') log.isRest = false;
  if(!Array.isArray(log.exercises)) log.exercises = [];
  log.exercises.forEach(ex => {
    ex.sets = Math.max(1, parseInt(ex.sets, 10) || 1);
    if(!Array.isArray(ex.entries)){
      const completed = Array.isArray(ex.completed) ? ex.completed : [];
      const note = ex.note || {};
      const w = parseFloat(note.weight);
      const repsList = String(note.reps || '').match(/\d+(\.\d+)?/g) || [];
      ex.entries = [];
      for(let i = 0; i < ex.sets; i++){
        const done = !!completed[i];
        ex.entries.push({
          w: done && isFinite(w) ? fmtNum(w) : '',
          r: done && repsList.length ? repsList[Math.min(i, repsList.length - 1)] : '',
          done,
        });
      }
      delete ex.completed;
    }
    fitEntries(ex, ex.sets);
  });
  return log;
}

// Grow to `target` sets, or shrink by dropping trailing sets that were never done.
function fitEntries(ex, target){
  const e = ex.entries;
  while(e.length < target) e.push(blankEntry());
  while(e.length > target && !e[e.length - 1].done) e.pop();
  ex.sets = e.length;
}

/* ================= Day status ================= */
function setCounts(log){
  let total = 0, done = 0;
  log.exercises.forEach(ex => { total += ex.entries.length; done += ex.entries.filter(e => e.done).length; });
  return {total, done};
}
function logStatus(log){
  if(!log) return null;
  if(log.isRest) return 'rest';
  if(log.backfilled) return 'done';
  const {total, done} = setCounts(log);
  if(total === 0) return null;
  if(done === 0) return 'missed';
  return done >= total ? 'done' : 'partial';
}
function workedOut(log){
  return !!log && !log.isRest && (!!log.backfilled || setCounts(log).done > 0);
}
const STATUS_LABEL = {done:'Done', partial:'Partly done', missed:'Missed', rest:'Rest day'};

// A week keeps the streak going when you did all but one of its planned workouts
// (at least one). This week adds to the streak once it qualifies and never breaks it early.
const weekCounts = (planned, done) => done >= Math.max(1, planned - 1);

function workoutStats(){
  const logs = allLogs();
  const worked = logs.filter(x => workedOut(x.log)).map(x => x.date);
  const weeks = new Map();
  logs.forEach(({date, log}) => {
    const k = dateKey(startOfWeek(parseKey(date)));
    const w = weeks.get(k) || {planned:0, done:0};
    if(workedOut(log)){ w.planned++; w.done++; }
    else if(!log.isRest && log.exercises.length) w.planned++;
    weeks.set(k, w);
  });

  // This week counts every planned day, including the ones still ahead.
  const t = today0(), monday = startOfWeek(t), plan = getPlan(), rest = getRest();
  const byDate = new Map(logs.map(x => [x.date, x.log]));
  let planned = 0, done = 0;
  for(let i = 0; i < 7; i++){
    const log = byDate.get(dateKey(addDays(monday, i)));
    if(workedOut(log)){ planned++; done++; }
    else if(log ? !log.isRest && log.exercises.length : !rest[DAYS[i]] && (plan[DAYS[i]] || []).length) planned++;
  }
  let streak = weekCounts(planned, done) ? 1 : 0;
  for(let w = addDays(monday, -7); ; w = addDays(w, -7)){
    const s = weeks.get(dateKey(w));
    if(!s || !weekCounts(s.planned, s.done)) break;
    streak++;
  }
  const month = dateKey(t).slice(0, 7);
  return {streak, month: worked.filter(d => d.startsWith(month)).length, total: worked.length};
}

/* ================= Screens & dock ================= */
const SCREENS = {
  week:{tab:'week'}, history:{tab:'history'}, progress:{tab:'progress'},
  'progress-detail':{tab:'progress'}, leaders:{tab:'leaders'}, settings:{tab:'settings'},
  day:{action:true}, edit:{action:true}, backfill:{action:true},
};
let currentScreen = 'week';

function showScreen(name){
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  currentScreen = name;
  const cfg = SCREENS[name];
  $('tabbar').hidden = !cfg.tab;
  $('dock-action').hidden = !cfg.action;
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === cfg.tab;
    t.classList.toggle('active', on);
    if(on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  setDockHeight();
  window.scrollTo(0, 0);
}
function setDockButton(label, onClick, disabled = false){
  const b = $('dock-btn');
  b.textContent = label;
  b.onclick = onClick;
  b.disabled = disabled;
}

/* ================= Week ================= */
function goWeek(){ showScreen('week'); renderWeek(); }

function renderWeek(){
  const plan = getPlan(), rest = getRest(), dates = weekDates(), t = today0();
  $('week-date').textContent = `${DAYS[dayIndex(t)].slice(0, 3)}, ${fmtShort(t)}`;
  $('week-range').textContent = `${fmtShort(dates[0])} – ${fmtShort(dates[6])}`;

  const rows = dates.map((d, i) => {
    const dayName = DAYS[i], log = getLog(dateKey(d)), exs = plan[dayName] || [];
    const isPast = d < t, isToday = +d === +t;
    // Past days only count rest that was actually logged; today and later preview the weekly setting.
    const isRest = isPast ? !!(log && log.isRest) : !!rest[dayName];
    let state, sub;
    if(isRest){
      state = 'rest'; sub = 'Rest day';
    } else {
      const c = log ? setCounts(log) : null;
      if(log && log.backfilled && (!c || c.done === 0)){ state = 'done'; sub = 'Worked out'; }
      else if(c && c.done > 0){ state = c.done >= c.total ? 'done' : 'partial'; sub = `${plural(log.exercises.length, 'exercise')} · ${c.done}/${c.total} sets`; }
      else if(!exs.length){ state = 'none'; sub = 'Nothing planned'; }
      else if(isPast){ state = 'missed'; sub = `Missed · ${plural(exs.length, 'exercise')}`; }
      else { state = isToday ? 'today' : 'upcoming'; sub = plural(exs.length, 'exercise'); }
    }
    return `<button class="day-row${isToday ? ' is-today' : ''}" onclick="goDay(${i})">
      <span class="status st-${state}">${STATUS_ICON[state]}</span>
      <span class="day-text">
        <span class="day-name">${dayName}${isToday ? '<span class="today-tag">Today</span>' : ''}</span>
        <span class="day-sub">${fmtShort(d)} · ${esc(sub)}</span>
      </span>
      <span class="chev">${ICON.chevron}</span>
    </button>`;
  });
  $('week-days').innerHTML = rows.join('');
}

/* ================= Day ================= */
const cur = {idx:null, date:null, key:null, log:null, past:false, planIds:new Set(), prev:{}, best:{}};

function goDay(i){ goDayDate(weekDates()[i]); }

// Days before this week are "past": only open while past editing is unlocked, and edits stay on that day.
function goDayDate(d){
  const past = d < startOfWeek(today0());
  if(past && !isUnlocked()){ openPastEditor(); return; }
  Object.assign(cur, {idx:dayIndex(d), date:d, key:dateKey(d), past});
  showScreen('day');
  setDockButton('Done', finishDay);
  renderDay();
}
function finishDay(){
  syncLeaderboard();
  if(cur.past) goPastPicker(); else goWeek();
}

// The day's log. This week's days are merged with the current weekly plan;
// a past day keeps exactly what it had (or starts from the plan if nothing was saved).
function buildDayLog(dayName, key){
  if(cur.past){
    const saved = getLog(key);
    if(saved) return saved;
  }
  const template = getPlan()[dayName] || [];
  const log = getLog(key) || {day:dayName, isRest:false, exercises:[]};
  const byId = new Map(log.exercises.map(e => [e.id, e]));
  const out = [];
  template.forEach(t => {
    const e = byId.get(t.id);
    if(e){
      Object.assign(e, {name:t.name, reps:t.reps, weight:t.weight || 0, time:t.time, restSeconds:t.restSeconds || 0});
      fitEntries(e, t.sets);
      byId.delete(t.id);
      out.push(e);
    } else {
      out.push({id:t.id, name:t.name, sets:t.sets, reps:t.reps, weight:t.weight || 0, time:t.time, restSeconds:t.restSeconds || 0,
                entries:Array.from({length:t.sets}, blankEntry)});
    }
  });
  // An exercise removed from the plan stays on days where sets were already logged.
  byId.forEach(e => { if(e.entries.some(x => x.done)) out.push(e); });
  log.exercises = out;
  return log;
}

// "Previous" numbers, best weights and each exercise's past sessions (oldest first)
// come from every day before this one.
function indexHistory(beforeKey){
  const prev = {}, best = {}, sessions = {};
  allLogs().filter(x => x.date < beforeKey && !x.log.isRest).reverse().forEach(({date, log}) => {
    log.exercises.forEach(ex => {
      const k = normName(ex.name);
      const done = ex.entries.filter(e => e.done);
      if(!done.length) return;
      if(!prev[k]) prev[k] = {date, entries:ex.entries};
      (sessions[k] = sessions[k] || []).unshift({date, sets:done.map(e => ({w:num(e.w), r:num(e.r)}))});
      done.forEach(e => { const w = num(e.w); if(w > 0 && (best[k] == null || w > best[k])) best[k] = w; });
    });
  });
  return {prev, best, sessions};
}

/* Weekly suggestion ("coach"), built from standard lifting rules:
   - Double progression: go up only after hitting the target reps on every set.
   - After a jump to a new weight, stay there until the reps catch up.
   - Time off beats any trend: hold after 2+ weeks, ~10% lighter after 3+, ~20% after 6+.
   - Deload ~10% after two bad sessions at the same weight, or three sessions of falling strength.
   Strength is compared with the estimated one-rep max (Epley): weight × (1 + reps ÷ 30). */
const e1rm = (w, r) => w * (1 + r / 30);

function coach(ex){
  const sessions = cur.sessions[normName(ex.name)];
  if(!sessions || !sessions.length) return null;
  const last = sessions.at(-1), before = sessions.at(-2);
  const n = ex.sets;
  const timed = ex.time > 0;
  const topW = (s) => maxOf(s.sets.map(x => x.w));
  const W = topW(last);
  const weighted = !timed && W > 0;
  const repsAtTop = (s) => s.sets.filter(x => !weighted || x.w === topW(s)).map(x => x.r);
  const reps = repsAtTop(last);
  const target = timed ? ex.time : (ex.reps || maxOf(reps));
  const perSet = (f) => Array.from({length:n}, (_, i) => f(reps[i] ?? reps.at(-1) ?? target));
  const daysOff = Math.round((cur.date - parseKey(last.date)) / 864e5);
  const weeks = Math.floor(daysOff / 7);
  const step = W >= 20 ? 5 : 2.5;
  const roundW = (x) => Math.max(step, Math.round(x / step) * step);
  const got = `${reps.map(fmtNum).join('/')}${timed ? 's' : ''}`;
  const what = timed ? 'seconds' : 'reps';
  const roundCount = (v) => (timed ? Math.max(5, Math.round(v / 5) * 5) : Math.max(1, Math.round(v)));

  // Time off comes first: a good trend before a break doesn't carry through it.
  if(daysOff > 21){
    const f = daysOff > 42 ? 0.8 : 0.9;
    const text = `${weeks} weeks since last time. Ease back in about ${daysOff > 42 ? 20 : 10}% lighter.`;
    if(weighted) return {kind:'back', w:roundW(W * f), reps:perSet(() => target), text};
    return {kind:'back', w:0, reps:perSet(r => roundCount(r * f)), text:`${weeks} weeks since last time. Ease back in with fewer ${what}.`};
  }
  if(daysOff > 14){
    return {kind:'hold', w:weighted ? W : 0, reps:weighted ? perSet(() => target) : perSet(r => r),
      text:`2 weeks since last time. Repeat ${weighted ? fmtNum(W) + ' ' + UNIT : 'last time'} before going up.`};
  }

  const hitAll = reps.length >= n && reps.slice(0, n).every(r => r >= target);
  // Every set done was on target, there just weren't enough of them: finish them before going up.
  const fewerSets = !hitAll && reps.length < n && reps.every(r => r >= target);
  if(!weighted){
    const add = timed ? 5 : 1;
    if(hitAll) return {kind:'up', w:0, reps:perSet(r => r + add),
      text:`${timed ? `You held ${fmtNum(target)}s+` : `You did ${fmtNum(target)}+ reps`} on every set. Add ${timed ? '5 seconds per hold' : '1 rep per set'}.`};
    if(fewerSets) return {kind:'hold', w:0, reps:perSet(() => target), text:`Finish all ${n} sets before adding more (you did ${reps.length} last time).`};
    return {kind:'hold', w:0, reps:perSet(r => Math.min(target, r + add)), text:`Aim for ${timed ? '5 more seconds per hold' : '1 more rep per set'} (${got} last time).`};
  }

  if(hitAll){
    const inc = W < 50 ? 5 : Math.max(5, Math.round(W * 0.025 / 5) * 5);
    return {kind:'up', w:W + inc, reps:perSet(() => target), text:`You hit ${fmtNum(target)} reps on every set at ${fmtNum(W)}.`};
  }
  // "Bad" = more than 2 reps short per set on average at that session's top weight.
  const bad = (s) => { const r = repsAtTop(s); return r.reduce((a, x) => a + Math.max(0, target - x), 0) / r.length > 2; };
  const recent = sessions.slice(-3);
  const falling = recent.length === 3 && Math.round((parseKey(recent[2].date) - parseKey(recent[0].date)) / 864e5) <= 28 &&
    recent.every((s, i) => i === 0 || maxOf(s.sets.map(x => e1rm(x.w, x.r))) < maxOf(recent[i - 1].sets.map(x => e1rm(x.w, x.r))));
  if((bad(last) && before && topW(before) === W && bad(before)) || falling){
    return {kind:'down', w:roundW(W * 0.9), reps:perSet(() => target),
      text:falling ? 'Strength has dipped 3 sessions in a row. Go about 10% lighter and build back up.'
                   : 'Reps dropped two sessions in a row. Go about 10% lighter and build back up.'};
  }
  if(fewerSets){
    return {kind:'hold', w:W, reps:perSet(() => target), text:`Finish all ${n} sets at ${fmtNum(W)} before going up (you did ${reps.length} last time).`};
  }
  const better = perSet(r => Math.min(target, r + 1));
  if(before && topW(before) < W){
    return {kind:'hold', w:W, reps:better, text:`You moved up to ${fmtNum(W)} last time and got ${got}. Stay there and beat those reps.`};
  }
  return {kind:'hold', w:W, reps:better, text:`Stay at ${fmtNum(W)} and aim for 1 more rep per set (${got} last time).`};
}

function coachHeadline(c, timed){
  const same = c.reps.every(r => r === c.reps[0]);
  const reps = same ? fmtNum(c.reps[0]) : c.reps.map(fmtNum).join('/');
  if(c.w) return `Try ${fmtNum(c.w)} × ${reps}`;
  return timed ? `Try ${reps}s holds` : `Try ${reps} reps`;
}

function renderDay(){
  const dayName = DAYS[cur.idx];
  const isToday = +cur.date === +today0();
  $('day-eyebrow').textContent = fmtShort(cur.date) + (isToday ? ' · Today' : '');
  $('day-title').textContent = dayName;
  cur.log = buildDayLog(dayName, cur.key);
  // In a past day every exercise belongs to that day, so all of them can be edited there.
  cur.planIds = new Set((cur.past ? cur.log.exercises : getPlan()[dayName] || []).map(e => e.id));
  cur.baseOrder = new Map(cur.log.exercises.map((e, i) => [e.id, i]));
  sortExercises();
  Object.assign(cur, indexHistory(cur.key));
  cur.coach = {};
  cur.log.exercises.forEach(ex => { cur.coach[ex.id] = coach(ex); });
  $('rest-toggle').checked = !!cur.log.isRest;
  if(cur.past) updateUnlockLabels();
  renderExercises();
}

// Exercises you've started move to the top in the order you started them; the rest keep plan order.
function sortExercises(){
  const order = (e) => cur.baseOrder.get(e.id) ?? 999;
  const started = (e) => e.entries.some(x => x.done);
  cur.log.exercises.sort((a, b) => {
    const sa = started(a), sb = started(b);
    if(sa !== sb) return sa ? -1 : 1;
    if(sa) return (a.startedAt || 0) - (b.startedAt || 0) || order(a) - order(b);
    return order(a) - order(b);
  });
}

function renderExercises(){
  const list = $('exercise-list');
  if(cur.log.isRest){
    $('add-ex-btn').hidden = true;
    list.innerHTML = `<div class="empty"><div class="empty-icon">${ICON.moon}</div><p class="empty-title">Rest day</p></div>`;
    return;
  }
  $('add-ex-btn').hidden = false;
  if(!cur.log.exercises.length){
    list.innerHTML = `<div class="empty"><div class="empty-icon">${ICON.calCheck}</div>
      <p class="empty-title">No exercises yet</p><p>Add what you do every ${DAYS[cur.idx]}. It repeats each week.</p></div>`;
    return;
  }
  list.innerHTML = '';
  cur.log.exercises.forEach(ex => list.appendChild(buildCard(ex)));
}

function findEx(id){ return cur.log.exercises.find(e => e.id === id); }
function saveDay(){
  delete cur.log.auto; // a day someone actually opened and changed is no longer an automatic entry
  saveLog(cur.key, cur.log);
}

// Days that go by without the app being opened still count. Every past day with nothing saved is
// recorded from the plan as it is now: planned exercises with no sets done (missed), or rest if it's
// a weekly rest day. Writing them down keeps history fixed even if the plan changes later.
function closeOutPastDays(){
  const s = getSettings();
  const yesterday = addDays(today0(), -1);
  let start;
  if(s.closedThrough){
    start = addDays(parseKey(s.closedThrough), 1);
  } else {
    // First run: go back to the first day anything was ever logged, but no more than a year.
    const first = allLogs()[0];
    start = first ? parseKey(first.date) : today0();
  }
  const floor = addDays(today0(), -365);
  if(start < floor) start = floor;
  if(start <= yesterday){
    const plan = getPlan(), rest = getRest();
    for(let d = new Date(start); d <= yesterday; d = addDays(d, 1)){
      const key = dateKey(d);
      if(localStorage.getItem('wt_log_' + key) !== null) continue;
      const dayName = DAYS[dayIndex(d)];
      if(rest[dayName]){
        saveLog(key, {day:dayName, isRest:true, auto:true, exercises:[]});
        continue;
      }
      const exs = plan[dayName] || [];
      if(!exs.length) continue;
      saveLog(key, {day:dayName, isRest:false, auto:true, exercises:exs.map(t => ({
        id:t.id, name:t.name, sets:t.sets, reps:t.reps, weight:t.weight || 0, time:t.time,
        restSeconds:t.restSeconds || 0, entries:Array.from({length:t.sets}, blankEntry),
      }))});
    }
  }
  if(s.closedThrough !== dateKey(yesterday)){
    s.closedThrough = dateKey(yesterday);
    saveSettings(s);
  }
}
function replaceCard(exId){
  const old = document.querySelector(`.ex-card[data-ex="${exId}"]`);
  if(old) old.replaceWith(buildCard(findEx(exId)));
}

function fmtSet(e, timed, fallbackReps){
  const w = num(e.w), r = num(e.r) || fallbackReps || 0;
  if(w > 0) return `${fmtNum(w)}×${r ? fmtNum(r) + (timed ? 's' : '') : '?'}`;
  if(r) return timed ? `${fmtNum(r)}s` : `${fmtNum(r)} reps`;
  return '✓';
}

// Grey hint shown in an empty box, and used when a set is ticked without typing.
// Weight: the set above, then this week's suggestion, the planned weight, last time.
// Reps: this week's suggestion for that set, then the set above, the target, last time.
function suggestion(ex, i){
  let w = '', r = '';
  const c = cur.coach && cur.coach[ex.id];
  if(c && c.reps[i] != null) r = fmtNum(c.reps[i]);
  for(let j = i - 1; j >= 0 && (!w || !r); j--){
    const e = ex.entries[j];
    if(!w && num(e.w) > 0) w = fmtNum(num(e.w));
    if(!r && num(e.r) > 0) r = fmtNum(num(e.r));
  }
  if(!w && c && c.w) w = fmtNum(c.w);
  if(!w && num(ex.weight) > 0) w = fmtNum(num(ex.weight));
  if(!r){ const target = ex.time > 0 ? ex.time : ex.reps; if(target > 0) r = String(target); }
  const p = cur.prev[normName(ex.name)];
  const pe = p && p.entries[i] && p.entries[i].done ? p.entries[i] : null;
  if(!w && pe && num(pe.w) > 0) w = fmtNum(num(pe.w));
  if(!r && pe && num(pe.r) > 0) r = fmtNum(num(pe.r));
  return {w, r};
}

function buildCard(ex){
  const timed = ex.time > 0;
  const key = normName(ex.name);
  const prev = cur.prev[key];
  const best = cur.best[key];
  const vids = videosFor(ex.name).length;
  const inPlan = cur.planIds.has(ex.id);
  const meta = [`${ex.sets} × ${timed ? ex.time + 's' : (ex.reps || 0) + ' reps'}`];
  if(num(ex.weight) > 0) meta.push(`${fmtNum(num(ex.weight))} ${UNIT}`);
  if(ex.restSeconds > 0) meta.push(`${fmtRest(ex.restSeconds)} rest`);
  if(!inPlan) meta.push('removed from plan');
  // The suggestion stays up until every set is done.
  const tip = cur.coach && cur.coach[ex.id] && !ex.entries.every(e => e.done) ? cur.coach[ex.id] : null;

  const rows = ex.entries.map((e, i) => {
    const p = prev && prev.entries[i] && prev.entries[i].done ? prev.entries[i] : null;
    const hint = suggestion(ex, i);
    const isPR = e.done && best != null && num(e.w) > best;
    return `<div class="set-row${e.done ? ' is-done' : ''}">
      <span class="set-num">${i + 1}${isPR ? '<span class="pr-tag">PR</span>' : ''}</span>
      <span class="set-prev">${p ? fmtSet(p, timed, timed ? ex.time : ex.reps) : '—'}</span>
      <input class="set-in" data-ex="${ex.id}" data-i="${i}" data-f="w" inputmode="decimal" enterkeyhint="done"
             autocomplete="off" placeholder="${esc(hint.w)}" value="${esc(e.w)}" aria-label="Set ${i + 1} weight in ${UNIT}">
      <input class="set-in" data-ex="${ex.id}" data-i="${i}" data-f="r" inputmode="numeric" enterkeyhint="done"
             autocomplete="off" placeholder="${esc(hint.r)}" value="${esc(e.r)}" aria-label="Set ${i + 1} ${timed ? 'seconds' : 'reps'}">
      <button class="set-check" onclick="toggleSet('${ex.id}',${i})" aria-pressed="${e.done}"
              aria-label="${e.done ? 'Undo' : 'Complete'} set ${i + 1}">${ICON.check}</button>
    </div>`;
  }).join('');

  const card = document.createElement('article');
  card.className = 'ex-card';
  card.dataset.ex = ex.id;
  card.innerHTML = `
    <div class="ex-head">
      <div class="ex-title">
        <h3 class="ex-name">${esc(ex.name)}</h3>
        <p class="ex-meta">${esc(meta.join(' · '))}</p>
      </div>
      <button class="icon-btn${vids ? ' has-video' : ''}" onclick="onVideoButton('${ex.id}')"
              aria-label="${vids ? `Watch form videos (${vids})` : 'Add a form video'}">
        ${vids ? ICON.play : ICON.video}${vids ? `<span class="badge">${vids}</span>` : ''}
      </button>
      ${inPlan ? `<button class="icon-btn" onclick="openEditExercise('${ex.id}')" aria-label="Edit ${esc(ex.name)}">${ICON.more}</button>` : ''}
    </div>
    ${tip ? `<p class="coach coach-${tip.kind}"><span class="coach-icon" aria-hidden="true">${BULB}</span>
      <span><b>${esc(coachHeadline(tip, timed))}.</b> ${esc(tip.text)}</span></p>` : ''}
    <div class="set-row set-head" aria-hidden="true"><span>Set</span><span>Previous</span><span>${UNIT}</span><span>${timed ? 'Sec' : 'Reps'}</span><span></span></div>
    ${rows}`;
  return card;
}

function toggleSet(exId, i){
  ensureAudio();
  const ex = findEx(exId);
  const e = ex.entries[i];
  if(!e.done){
    const hint = suggestion(ex, i);
    if(e.w === '') e.w = hint.w;
    if(e.r === '') e.r = hint.r;
    e.done = true;
    const w = num(e.w), best = cur.best[normName(ex.name)];
    const beatsToday = !ex.entries.some((o, j) => j !== i && o.done && num(o.w) >= w);
    if(w > 0 && best != null && w > best && beatsToday) toast(`${ex.name}: ${fmtNum(w)} ${UNIT}`, 'pr');
    if(!ex.startedAt) ex.startedAt = Date.now();
    if(ex.restSeconds > 0 && !cur.past) startRest(ex.restSeconds, ex.name);
  } else {
    e.done = false;
    if(!ex.entries.some(x => x.done)) delete ex.startedAt;
    if(getTimer()) skipRest(); // an accidental tick shouldn't leave a rest timer running
  }
  saveDay();
  const before = cur.log.exercises.map(x => x.id).join();
  sortExercises();
  if(cur.log.exercises.map(x => x.id).join() === before){ replaceCard(exId); return; }
  renderExercises();
  // A card that just moved up is the one you're working on, so bring it into view.
  if(e.done) document.querySelector(`.ex-card[data-ex="${exId}"]`)?.scrollIntoView({behavior:'smooth', block:'start'});
}

function toggleRest(){
  const on = $('rest-toggle').checked;
  cur.log.isRest = on;
  // On a past day the switch only changes that day, not the weekly rest setting.
  if(!cur.past){
    const r = getRest();
    r[DAYS[cur.idx]] = on;
    saveRest(r);
  }
  saveDay();
  renderExercises();
}

/* ================= Add / edit exercise ================= */
let editing = {id:null, isNew:true, originalName:''};
let editUrls = [];

function fillEditForm(t){
  $('edit-name').value = t.name;
  $('edit-name').classList.remove('shake');
  $('edit-sets').value = t.sets;
  $('edit-reps').value = t.reps || 0;
  $('edit-weight').value = num(t.weight) > 0 ? fmtNum(num(t.weight)) : '';
  $('edit-time').value = t.time || 0;
  $('edit-rest').value = t.restSeconds || 0;
  $('edit-eyebrow').textContent = cur.past ? `${fmtLong(cur.date)} only` : DAYS[cur.idx];
  const names = new Set();
  Object.values(getPlan()).flat().forEach(e => names.add(e.name));
  allLogs().forEach(x => x.log.exercises.forEach(e => names.add(e.name)));
  $('exercise-names').innerHTML = [...names].sort().map(n => `<option value="${esc(n)}">`).join('');
}

function openAddExercise(){
  editing = {id:null, isNew:true, originalName:''};
  fillEditForm({name:'', sets:3, reps:10, weight:0, time:0, restSeconds:60});
  $('edit-title').textContent = 'New exercise';
  $('edit-delete').hidden = true;
  showScreen('edit');
  setDockButton('Add exercise', submitExercise);
  renderEditVideos();
}

function openEditExercise(exId){
  const t = cur.past ? findEx(exId) : (getPlan()[DAYS[cur.idx]] || []).find(e => e.id === exId);
  if(!t) return;
  editing = {id:exId, isNew:false, originalName:t.name};
  fillEditForm(t);
  $('edit-title').textContent = 'Edit exercise';
  $('edit-delete').hidden = false;
  showScreen('edit');
  setDockButton('Save changes', submitExercise);
  renderEditVideos();
}

function closeEdit(){
  revokeEditUrls();
  showScreen('day');
  setDockButton('Done', finishDay);
  renderDay();
}

function step(id, dir){
  const el = $(id);
  const min = +el.dataset.min, max = +el.dataset.max, s = +el.dataset.step;
  let v = (parseFloat(el.value) || 0) + dir * s;
  if(s > 1 && !el.dataset.decimal) v = Math.round(v / s) * s; // weights like 17.5 keep their half
  el.value = fmtNum(Math.min(max, Math.max(min, v)));
}
function readStep(id){
  const el = $(id);
  const v = el.dataset.decimal ? Math.round(parseFloat(el.value) * 10) / 10 : parseInt(el.value, 10);
  return Math.min(+el.dataset.max, Math.max(+el.dataset.min, isFinite(v) ? v : +el.dataset.min));
}

function nameUsedElsewhere(name, exceptId){
  const k = normName(name);
  return Object.values(getPlan()).flat().some(e => e.id !== exceptId && normName(e.name) === k);
}

function submitExercise(){
  const nameEl = $('edit-name');
  const name = nameEl.value.trim().replace(/\s+/g, ' ');
  if(!name){
    nameEl.classList.remove('shake'); void nameEl.offsetWidth; nameEl.classList.add('shake');
    toast('Give the exercise a name first', 'error');
    return;
  }
  const t = {name, sets:readStep('edit-sets'), reps:readStep('edit-reps'), weight:readStep('edit-weight'),
             time:readStep('edit-time'), restSeconds:readStep('edit-rest')};
  // A past day's exercises live only in that day's log; the weekly plan is left alone.
  if(cur.past){
    if(editing.isNew){
      cur.log.exercises.push({id:newId('ex'), ...t, entries:Array.from({length:t.sets}, blankEntry)});
    } else {
      const ex = findEx(editing.id);
      Object.assign(ex, t);
      fitEntries(ex, t.sets);
    }
    saveDay();
    closeEdit();
    return;
  }
  const plan = getPlan();
  const dayName = DAYS[cur.idx];
  plan[dayName] = plan[dayName] || [];
  if(editing.isNew){
    plan[dayName].push({id:newId('ex'), ...t});
  } else {
    const ex = plan[dayName].find(e => e.id === editing.id);
    if(ex) Object.assign(ex, t);
    if(normName(editing.originalName) !== normName(name)){
      relinkVideos(editing.originalName, name, nameUsedElsewhere(editing.originalName, editing.id));
    }
  }
  savePlan(plan);
  closeEdit();
}

async function deleteExercise(){
  const name = editing.originalName;
  if(cur.past){
    const ok = await sheet({
      title:'Remove exercise?',
      body:`${esc(name)} will be removed from ${fmtLong(cur.date)}, along with any sets logged for it that day.`,
      actions:[{label:'Cancel', value:false}, {label:'Remove', kind:'btn-danger', value:true}],
    });
    if(!ok) return;
    cur.log.exercises = cur.log.exercises.filter(e => e.id !== editing.id);
    saveDay();
    closeEdit();
    return;
  }
  const shared = nameUsedElsewhere(name, editing.id);
  const vids = shared ? 0 : videosFor(name).length;
  const ok = await sheet({
    title:'Delete exercise?',
    body:`${esc(name)} will be removed from ${DAYS[cur.idx]}s. Past workouts stay in your history.${vids ? ` Its ${plural(vids, 'form video')} will be deleted too.` : ''}`,
    actions:[{label:'Cancel', value:false}, {label:'Delete', kind:'btn-danger', value:true}],
  });
  if(!ok) return;
  const plan = getPlan();
  const dayName = DAYS[cur.idx];
  plan[dayName] = (plan[dayName] || []).filter(e => e.id !== editing.id);
  savePlan(plan);
  if(!shared) await deleteVideosFor(name);
  closeEdit();
}

/* ================= Rest timer =================
   Stored as an end time, so it shows the right number after the app is reopened. */
let restTick = null;
const getTimer = () => loadJSON('wt_timer', null);

function startRest(seconds, name){
  const t = {endsAt:Date.now() + seconds * 1000, total:seconds, name, pushed:!!getPushSub()};
  saveJSON('wt_timer', t);
  if(t.pushed) schedulePush(t);
  runTimer();
}
function runTimer(){
  clearInterval(restTick);
  if(!getTimer()){ $('rest-bar').hidden = true; setDockHeight(); return; }
  $('rest-bar').hidden = false;
  setDockHeight();
  paintTimer();
  restTick = setInterval(paintTimer, 250);
}
function paintTimer(){
  const t = getTimer();
  if(!t){ stopTimer(); return; }
  const left = Math.ceil((t.endsAt - Date.now()) / 1000);
  // Watching the timer run out in the app: the beep covers it, so call off the lock-screen alert.
  if(left <= 2 && t.pushed && !document.hidden){
    t.pushed = false;
    saveJSON('wt_timer', t);
    cancelPush();
  }
  if(left <= 0){ stopTimer(); restDone(t); return; }
  $('rest-time').textContent = fmtClock(left);
  $('rest-name').textContent = t.name;
  $('rest-fill').style.transform = `scaleX(${Math.min(1, left / t.total)})`;
}
function stopTimer(){
  clearInterval(restTick);
  localStorage.removeItem('wt_timer');
  $('rest-bar').hidden = true;
  setDockHeight();
}
// Adjust the running rest by `sec` (the button takes 15 seconds off). Cutting it to nothing just ends it.
function addRest(sec){
  const t = getTimer();
  if(!t) return;
  t.endsAt += sec * 1000;
  if(sec > 0) t.total += sec;
  if(t.endsAt - Date.now() < 1000){ skipRest(); return; }
  if(getPushSub()){ t.pushed = true; schedulePush(t); }
  saveJSON('wt_timer', t);
  paintTimer();
}
function skipRest(){
  const t = getTimer();
  if(t && t.pushed) cancelPush();
  stopTimer();
}
function resumeTimer(){
  const t = getTimer();
  if(!t) return;
  if(t.endsAt > Date.now()){ runTimer(); return; }
  stopTimer();
  if(Date.now() - t.endsAt < 60000) toast(`Rest's over: ${t.name}`, 'ok');
}
function restDone(t){
  beep();
  if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
  toast(`Rest's over: ${t.name}`, 'ok');
  if(document.hidden && 'Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker){
    navigator.serviceWorker.ready
      .then(reg => reg.showNotification('Rest complete', {body:`${t.name}: back to it`, icon:'logo-192.png', tag:'rest'}))
      .catch(() => {});
  }
}

/* ================= Rest alerts (push) =================
   The app sends the rest end time to the push server, which sends a notification
   at that moment even if the app is closed or the phone is locked. */
const getPushSub = () => loadJSON('wt_push', null);
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function deviceId(){
  let id = localStorage.getItem('wt_device');
  if(!id){
    id = crypto.randomUUID ? crypto.randomUUID() : newId('dev').replace(/_/g, '-');
    localStorage.setItem('wt_device', id);
  }
  return id;
}
function pushSupport(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission === 'denied' ? 'denied' : 'ok';
}
function pushRequest(path, extra = {}){
  const subscription = getPushSub();
  if(!subscription) return Promise.resolve(null);
  // text/plain keeps this a "simple" request, so there's no extra CORS round trip.
  return fetch(PUSH_URL + path, {
    method:'POST', keepalive:true, headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({device:deviceId(), subscription, ...extra}),
  }).then(r => (r.ok ? r.json() : null)).catch(() => null);
}
const schedulePush = (t) => pushRequest('/schedule', {endsAt:t.endsAt, title:'Rest\'s over', body:`${t.name}: time for your next set`});
const cancelPush = () => pushRequest('/cancel');

// Anonymous daily check-in so the owner can see how many phones use the app.
// Sends only the random phone id and whether rest alerts are on; at most once a day.
function checkIn(force = false){
  const today = dateKey(today0());
  if(!force && localStorage.getItem('wt_lastping') === today) return;
  if(IS_PREVIEW) return; // previews don't count
  fetch(PUSH_URL + '/ping', {
    method:'POST', keepalive:true, headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({device:deviceId(), alerts:!!getPushSub()}),
  }).then(r => { if(r.ok) localStorage.setItem('wt_lastping', today); }).catch(() => {});
}

function vapidKeyBytes(){
  const s = atob(VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

function onPushToggle(el){ if(el.checked) enablePush(); else disablePush(); }

async function enablePush(){
  if(pushSupport() === 'unsupported'){
    toast(isIOS && !isStandalone() ? 'Add the app to your Home Screen first, then open it from there' : 'This browser can\'t send rest alerts', 'error');
    renderSettings();
    return;
  }
  // Must be the first thing that waits: iPhone only shows the prompt straight after a tap.
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if(permission !== 'granted'){
    toast('Notifications weren\'t allowed', 'error');
    renderSettings();
    return;
  }
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() ||
      await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:vapidKeyBytes()});
    saveJSON('wt_push', sub.toJSON());
    const ok = await pushRequest('/schedule', {endsAt:Date.now() + 4000, title:'Rest alerts are on',
      body:'You\'ll get one of these when rest is over, even with your phone locked.'});
    toast(ok ? 'Rest alerts are on' : 'Alerts are on, but the server didn\'t answer. Check your connection.', ok ? 'ok' : 'error');
    checkIn(true);
  }catch(e){
    localStorage.removeItem('wt_push');
    toast('Couldn\'t turn on rest alerts. Try again.', 'error');
  }
  renderSettings();
}

async function disablePush(){
  await cancelPush();
  try{
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if(sub) await sub.unsubscribe();
  }catch(e){}
  localStorage.removeItem('wt_push');
  checkIn(true);
  toast('Rest alerts are off');
  renderSettings();
}

// If notifications were switched off in the phone's settings, or the push address changed, catch up.
async function syncPush(){
  if(!getPushSub() || pushSupport() === 'unsupported') return;
  try{
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if(sub && Notification.permission === 'granted') saveJSON('wt_push', sub.toJSON());
    else localStorage.removeItem('wt_push');
  }catch(e){}
}

// iPhone only lets a page make sound after a tap, so the audio is unlocked on each set tick.
let audioCtx = null;
function ensureAudio(){
  try{
    if(!audioCtx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return;
      audioCtx = new AC();
      const g = audioCtx.createGain(); g.gain.value = 0;
      const o = audioCtx.createOscillator(); o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.01);
    }
    if(audioCtx.state === 'suspended') audioCtx.resume();
  }catch(e){}
}
function beep(){
  if(!audioCtx) return;
  try{
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [0, 0.2, 0.4].forEach((delay, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t0 + delay);
      g.gain.exponentialRampToValueAtTime(0.2, t0 + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.16);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0 + delay); o.stop(t0 + delay + 0.18);
    });
  }catch(e){}
}

/* ================= History ================= */
let histMonth = null, histSelected = null;

function goHistory(){
  showScreen('history');
  const t = today0();
  if(!histMonth) histMonth = new Date(t.getFullYear(), t.getMonth(), 1);
  renderHistory();
}

function monthGrid(year, month, cellFn){
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  let cells = '<span class="cal-cell is-blank"></span>'.repeat(dayIndex(first));
  for(let d = 1; d <= days; d++) cells += cellFn(new Date(year, month, d));
  return `<div class="cal-dow">${['M','T','W','T','F','S','S'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>`;
}

function renderHistory(){
  const logs = allLogs();
  const byDate = new Map(logs.map(x => [x.date, x.log]));
  const t = today0();
  const st = workoutStats();
  $('hist-stats').innerHTML = `
    <div class="stat"><div class="stat-num">${st.streak}</div><div class="stat-label">Week streak</div></div>
    <div class="stat"><div class="stat-num">${st.month}</div><div class="stat-label">This month</div></div>
    <div class="stat"><div class="stat-num">${st.total}</div><div class="stat-label">All time</div></div>`;

  if(!histSelected){
    const last = [...logs].reverse().find(x => logStatus(x.log));
    histSelected = last ? last.date : dateKey(t);
  }

  const y = histMonth.getFullYear(), m = histMonth.getMonth();
  $('cal-title').textContent = `${MONTHS[m]} ${y}`;
  const firstLog = logs.find(x => logStatus(x.log));
  const earliest = firstLog ? parseKey(firstLog.date) : t;
  $('cal-prev').disabled = histMonth <= new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  $('cal-next').disabled = histMonth >= new Date(t.getFullYear(), t.getMonth(), 1);

  $('cal-body').innerHTML = monthGrid(y, m, d => {
    const k = dateKey(d);
    const s = logStatus(byDate.get(k));
    const cls = ['cal-cell'];
    if(s) cls.push('st-' + s);
    if(+d === +t) cls.push('is-today');
    if(k === histSelected) cls.push('is-selected');
    if(d > t) return `<span class="${cls.join(' ')} is-future">${d.getDate()}</span>`;
    return `<button class="${cls.join(' ')}" onclick="selectHistDay('${k}')"
      aria-label="${fmtLong(d)}: ${s ? STATUS_LABEL[s] : 'nothing logged'}">${d.getDate()}</button>`;
  });
  renderHistDetail();
}

function shiftMonth(dir){
  histMonth = new Date(histMonth.getFullYear(), histMonth.getMonth() + dir, 1);
  renderHistory();
}
function selectHistDay(k){ histSelected = k; renderHistory(); }

function renderHistDetail(){
  const d = parseKey(histSelected);
  const log = getLog(histSelected);
  const s = logStatus(log);
  const ws = weekDates();
  // This week's days can always be opened; earlier days only while past editing is unlocked.
  const editable = (d >= ws[0] || isUnlocked()) && d <= today0();
  let body = '';
  if(!log || !s){
    body = '<p class="detail-note">Nothing logged this day.</p>';
  } else if(s === 'rest'){
    body = '<p class="detail-note">Rest day.</p>';
  } else {
    const shown = log.exercises.filter(ex => ex.entries.some(e => e.done) || !log.backfilled);
    if(log.backfilled && !shown.length) body = '<p class="detail-note">Worked out. Added from the calendar.</p>';
    if(log.auto && s === 'missed') body = '<p class="detail-note">The app wasn\'t opened this day.</p>';
    shown.forEach(ex => {
      const timed = ex.time > 0;
      const done = ex.entries.filter(e => e.done);
      body += `<div class="detail-ex">
        <div class="detail-ex-top"><span>${esc(ex.name)}</span><span class="detail-ex-count">${done.length}/${ex.entries.length} sets</span></div>
        ${done.length ? `<div class="chips">${done.map(e => `<span class="chip">${esc(fmtSet(e, timed, timed ? ex.time : ex.reps))}</span>`).join('')}</div>` : ''}
      </div>`;
    });
  }
  $('hist-detail').innerHTML = `<div class="detail">
    <div class="detail-head">
      <h2 class="detail-title">${fmtLong(d)}</h2>
      ${s ? `<span class="pill pill-${s}">${STATUS_LABEL[s]}</span>` : ''}
    </div>
    ${body}
    ${editable ? `<button class="btn" onclick="goDayDate(parseKey('${histSelected}'))">${d >= ws[0] ? 'Open' : 'Edit'} ${DAYS[dayIndex(d)]}</button>` : ''}
  </div>`;
}

/* ================= Progress ================= */
let progressItems = [], progressSel = null, progressMetric = null;

function collectProgress(){
  const map = new Map();
  allLogs().forEach(({date, log}) => {
    if(log.isRest) return;
    log.exercises.forEach(ex => {
      const sets = ex.entries.filter(e => e.done).map(e => ({w:num(e.w), r:num(e.r)})).filter(s => s.w > 0 || s.r > 0);
      if(!sets.length) return;
      const k = normName(ex.name);
      if(!map.has(k)) map.set(k, {key:k, name:ex.name, timed:false, sessions:[]});
      const item = map.get(k);
      item.name = ex.name;
      if(ex.time > 0) item.timed = true;
      item.sessions.push({date, sets});
    });
  });
  return [...map.values()].sort((a, b) => (a.sessions.at(-1).date > b.sessions.at(-1).date ? -1 : 1));
}

const maxOf = (arr) => arr.reduce((m, v) => Math.max(m, v), 0);
function metricDefs(item){
  const repUnit = item.timed ? 's' : 'reps';
  const weighted = !item.timed && item.sessions.some(s => s.sets.some(x => x.w > 0));
  if(weighted){
    return [
      {key:'heaviest', label:'Heaviest', title:'Heaviest set per workout', unit:UNIT, calc:s => maxOf(s.sets.map(x => x.w))},
      {key:'e1rm', label:'Est. 1RM', title:'Estimated one-rep max per workout', unit:UNIT,
       calc:s => Math.round(maxOf(s.sets.filter(x => x.w > 0 && x.r > 0).map(x => x.w * (1 + x.r / 30))))},
      {key:'volume', label:'Volume', title:'Total weight lifted per workout, weight × reps', unit:UNIT, calc:s => s.sets.reduce((t, x) => t + x.w * x.r, 0)},
    ];
  }
  return [
    {key:'best', label:item.timed ? 'Longest' : 'Best set', title:item.timed ? 'Longest hold per workout' : 'Most reps in one set per workout', unit:repUnit, calc:s => maxOf(s.sets.map(x => x.r))},
    {key:'total', label:'Total', title:`Total ${item.timed ? 'seconds' : 'reps'} per workout`, unit:repUnit, calc:s => s.sets.reduce((t, x) => t + x.r, 0)},
  ];
}

function goProgress(){ showScreen('progress'); renderProgress(); }

function sparkline(values){
  if(values.length < 2) return '';
  const W = 72, H = 32, p = 4;
  const lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => [
    p + i / (values.length - 1) * (W - p * 2),
    hi === lo ? H / 2 : p + (1 - (v - lo) / (hi - lo)) * (H - p * 2),
  ]);
  const last = pts.at(-1);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <polyline points="${pts.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="currentColor"/></svg>`;
}

function renderProgress(){
  progressItems = collectProgress();
  if(!progressItems.length){
    $('prog-list').innerHTML = `<div class="empty"><div class="empty-icon">${ICON.chart}</div>
      <p class="empty-title">Nothing to chart yet</p><p>Type your weight and reps on each set while you work out. Your progress shows up here.</p></div>`;
    return;
  }
  const row = (item, i) => {
    const m = metricDefs(item)[0];
    const values = item.sessions.map(m.calc).filter(v => v > 0);
    const best = maxOf(values);
    return `<div class="swipe">
      <button class="swipe-del" onclick="deleteProgressItem(${i})">Delete</button>
      <button class="prog-row swipe-front" data-i="${i}">
        <span class="prog-text">
          <span class="prog-name">${esc(item.name)}</span>
          <span class="prog-sub">Best ${fmtVal(best)} ${m.unit} · ${plural(item.sessions.length, 'workout')}</span>
        </span>
        ${sparkline(values.slice(-12))}
        <span class="chev">${ICON.chevron}</span>
      </button>
    </div>`;
  };
  // Grouped by the weekday each exercise is done on (an exercise done on two days shows under both).
  $('prog-list').innerHTML = DAYS.map((day, d) => {
    const items = progressItems.map((item, i) => ({item, i}))
      .filter(({item}) => item.sessions.some(s => dayIndex(parseKey(s.date)) === d));
    return items.length ? `<p class="section-label">${day}</p>${items.map(({item, i}) => row(item, i)).join('')}` : '';
  }).join('');
}

// Swipe a row left to show Delete; a tap on a row that didn't move opens it.
function initProgressSwipe(){
  const list = $('prog-list');
  const OPEN = -88;
  let drag = null, moved = false;
  const setX = (el, x, animate) => {
    el.style.transition = animate ? '' : 'none';
    el.style.transform = x ? `translateX(${x}px)` : '';
    el.dataset.x = x;
  };
  const closeAll = (except) => list.querySelectorAll('.swipe-front').forEach(f => { if(f !== except && +f.dataset.x) setX(f, 0, true); });
  list.addEventListener('pointerdown', e => {
    const front = e.target.closest('.swipe-front');
    if(!front) return;
    drag = {front, x0:e.clientX, y0:e.clientY, base:+front.dataset.x || 0, active:false, id:e.pointerId};
    moved = false;
  });
  list.addEventListener('pointermove', e => {
    if(!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if(!drag.active){
      if(Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      drag.active = true;
      moved = true;
      closeAll(drag.front);
      try{ drag.front.setPointerCapture(e.pointerId); }catch(err){} // keeps the drag if the finger leaves the row
    }
    setX(drag.front, Math.max(OPEN - 24, Math.min(0, drag.base + dx)), false);
  });
  const end = () => {
    if(!drag) return;
    if(drag.active) setX(drag.front, +drag.front.dataset.x < OPEN / 2 ? OPEN : 0, true);
    drag = null;
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
  list.addEventListener('click', e => {
    const front = e.target.closest('.swipe-front');
    if(!front) return;
    if(moved){ moved = false; return; }
    if(+front.dataset.x){ setX(front, 0, true); return; }
    closeAll();
    openProgress(+front.dataset.i);
  });
}

// Deletes every logged set of that exercise from history (after an "are you sure").
async function deleteProgressItem(i){
  const item = progressItems[i];
  if(!item) return;
  const ok = await sheet({
    title:`Delete ${esc(item.name)}?`,
    body:`Are you sure you want to delete this workout? All ${plural(item.sessions.length, 'logged workout')} of ${esc(item.name)} will be removed from your history. This can't be undone.`,
    actions:[{label:'Cancel', value:false}, {label:'Delete', kind:'btn-danger', value:true}],
  });
  if(!ok){ renderProgress(); return; }
  allLogs().forEach(({date, log}) => {
    const kept = log.exercises.filter(ex => normName(ex.name) !== item.key);
    if(kept.length !== log.exercises.length){ log.exercises = kept; saveLog(date, log); }
  });
  toast(`${item.name} deleted`);
  renderProgress();
  syncLeaderboard();
}

function openProgress(i){
  progressSel = progressItems[i];
  progressMetric = metricDefs(progressSel)[0].key;
  showScreen('progress-detail');
  renderProgressDetail();
}
function setMetric(key){ progressMetric = key; renderProgressDetail(); }

function renderProgressDetail(){
  const item = progressSel;
  const defs = metricDefs(item);
  const m = defs.find(d => d.key === progressMetric) || defs[0];
  $('pd-title').textContent = item.name;
  $('pd-sub').textContent = `${plural(item.sessions.length, 'workout')} since ${fmtShort(parseKey(item.sessions[0].date))}`;
  $('pd-seg').innerHTML = defs.map(d =>
    `<button class="${d.key === m.key ? 'active' : ''}" aria-pressed="${d.key === m.key}" onclick="setMetric('${d.key}')">${d.label}</button>`).join('');
  $('pd-chart-title').textContent = `${m.title} (${m.unit})`;
  const points = item.sessions.map(s => ({date:s.date, value:m.calc(s)})).filter(p => p.value > 0);
  drawChart($('pd-chart'), points, m.unit);

  // Personal records
  const sets = item.sessions.flatMap(s => s.sets.map(x => ({...x, date:s.date})));
  const top = (arr, f) => arr.reduce((b, x) => (b == null || f(x) > f(b) ? x : b), null);
  const tiles = [];
  const repLabel = item.timed ? 'Longest hold' : 'Most reps';
  const repUnit = item.timed ? 's' : 'reps';
  if(m.unit === UNIT){
    const h = top(sets.filter(x => x.w > 0), x => x.w);
    if(h) tiles.push({label:'Heaviest', value:fmtNum(h.w), unit:UNIT, date:h.date});
    const e = top(sets.filter(x => x.w > 0 && x.r > 0), x => x.w * (1 + x.r / 30));
    if(e) tiles.push({label:'Best est. 1RM', value:fmtNum(Math.round(e.w * (1 + e.r / 30))), unit:UNIT, date:e.date});
    const r = top(sets.filter(x => x.r > 0), x => x.r);
    if(r) tiles.push({label:repLabel, value:fmtNum(r.r), unit:repUnit, date:r.date});
    const vol = defs.find(d => d.key === 'volume');
    const v = top(item.sessions, vol.calc);
    if(v && vol.calc(v) > 0) tiles.push({label:'Best volume', value:fmtBig(vol.calc(v)), unit:UNIT, date:v.date});
  } else {
    const r = top(sets.filter(x => x.r > 0), x => x.r);
    if(r) tiles.push({label:repLabel, value:fmtNum(r.r), unit:repUnit, date:r.date});
    const tot = defs.find(d => d.key === 'total');
    const s = top(item.sessions, tot.calc);
    if(s) tiles.push({label:'Best workout', value:fmtNum(tot.calc(s)), unit:repUnit, date:s.date});
  }
  $('pd-prs').innerHTML = tiles.map(t => `<div class="pr-tile">
      <div class="pr-label">${t.label}</div>
      <div class="pr-value">${t.value} <span class="pr-unit">${t.unit}</span></div>
      <div class="pr-date">${fmtShort(parseKey(t.date))}</div>
    </div>`).join('');

  $('pd-sessions').innerHTML = [...item.sessions].reverse().slice(0, 30).map(s => `<div class="session">
      <div class="session-date">${fmtLong(parseKey(s.date))}</div>
      <div class="chips">${s.sets.map(x => `<span class="chip">${esc(fmtSet(x, item.timed))}</span>`).join('')}</div>
    </div>`).join('');
}

function niceStep(range, count){
  const raw = range / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}
function fmtAxis(v){ return v >= 10000 ? `${fmtNum(v / 1000)}k` : fmtNum(v); }

function drawChart(box, points, unit){
  if(!points.length){
    box.innerHTML = '<p class="chart-empty">No numbers logged for this yet.</p>';
    return;
  }
  const W = Math.max(260, box.clientWidth), H = 210;
  const m = {t:28, r:18, b:26, l:42};
  const xs = points.map(p => parseKey(p.date).getTime());
  const vs = points.map(p => p.value);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if(x0 === x1){ x0 -= 3 * 864e5; x1 += 3 * 864e5; }
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if(lo === hi){ lo -= Math.max(1, lo * 0.1); hi += Math.max(1, hi * 0.1); }
  const stepV = niceStep(hi - lo, 3);
  const y0 = Math.max(0, Math.floor(lo / stepV) * stepV);
  const y1 = Math.ceil(hi / stepV) * stepV;
  const X = (t) => m.l + (t - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);

  let grid = '';
  for(let v = y0; v <= y1 + stepV / 1000; v += stepV){
    const y = Y(v).toFixed(1);
    grid += `<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>
      <text class="axis-label" x="${m.l - 8}" y="${(+y + 4).toFixed(1)}" text-anchor="end">${fmtAxis(v)}</text>`;
  }
  const pts = points.map((p, i) => [X(xs[i]), Y(vs[i])]);
  const line = 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
  const base = Y(y0).toFixed(1);
  const area = `${line} L${pts.at(-1)[0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`;
  const showDots = pts.length <= 24;
  const dots = (showDots ? pts : [pts.at(-1)]).map(p => `<circle class="dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4"/>`).join('');
  const last = pts.at(-1);
  const lastAnchor = last[0] > W - 60 ? 'end' : last[0] < m.l + 30 ? 'start' : 'middle';
  const lastLabel = `<text class="last-label" x="${last[0].toFixed(1)}" y="${(last[1] - 12).toFixed(1)}" text-anchor="${lastAnchor}">${fmtVal(vs.at(-1))}</text>`;
  const firstDate = fmtShort(parseKey(points[0].date));
  const lastDate = fmtShort(parseKey(points.at(-1).date));
  const xLabels = `<text class="axis-label" x="${m.l}" y="${H - 6}" text-anchor="start">${firstDate}</text>` +
    (points.length > 1 && firstDate !== lastDate ? `<text class="axis-label" x="${W - m.r}" y="${H - 6}" text-anchor="end">${lastDate}</text>` : '');

  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Line chart, ${points.length} workouts, latest ${fmtVal(vs.at(-1))} ${unit}">
      ${grid}
      <path class="series-area" d="${area}"/>
      <path class="series-line" d="${line}"/>
      ${dots}${lastLabel}${xLabels}
      <line class="crosshair" y1="${m.t - 6}" y2="${H - m.b}" style="display:none"/>
      <circle class="focus-dot" r="5.5" style="display:none"/>
    </svg>
    <div class="chart-tip" hidden></div>`;

  // Tap or drag across the chart to read any workout's value.
  const svgEl = box.querySelector('svg');
  const tip = box.querySelector('.chart-tip');
  const cross = svgEl.querySelector('.crosshair');
  const focus = svgEl.querySelector('.focus-dot');
  const show = (clientX) => {
    const r = svgEl.getBoundingClientRect();
    const x = (clientX - r.left) * (W / r.width);
    let bi = 0;
    pts.forEach((p, i) => { if(Math.abs(p[0] - x) < Math.abs(pts[bi][0] - x)) bi = i; });
    const [px, py] = pts[bi];
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.style.display = '';
    focus.setAttribute('cx', px); focus.setAttribute('cy', py); focus.style.display = '';
    tip.textContent = `${fmtShort(parseKey(points[bi].date))} · ${fmtVal(vs[bi])} ${unit}`;
    tip.hidden = false;
    tip.style.left = `${Math.min(W - 60, Math.max(60, px))}px`;
  };
  const hide = () => { cross.style.display = 'none'; focus.style.display = 'none'; tip.hidden = true; };
  svgEl.addEventListener('pointerdown', e => show(e.clientX));
  svgEl.addEventListener('pointermove', e => { if(e.pointerType === 'mouse' || e.buttons) show(e.clientX); });
  svgEl.addEventListener('pointerleave', e => { if(e.pointerType === 'mouse') hide(); });
}

/* ================= Leaderboard =================
   Opt-in. The phone works out its own totals and sends only a nickname plus those numbers. */
const getLb = () => loadJSON('wt_lb', null); // {name, on, pendingLeave?}
const lbOn = () => { const lb = getLb(); return !!(lb && lb.on); };
let lbTab = 'streak', lbData = null, lbState = 'idle';

function lbRequest(path, extra = {}){
  return fetch(PUSH_URL + path, {
    method:'POST', keepalive:true, headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({device:deviceId(), ...extra}),
  }).then(r => (r.ok ? r.json() : null)).catch(() => null);
}

// Streak: weeks in a row with a workout. Lifted: weight × reps this week (Mon–Sun).
// Improvement: for each exercise done in the last 7 days and in the 4 weeks before, this week's
// best (estimated one-rep max, or most reps / longest hold without weight) vs. their usual weekly best.
function leaderboardStats(){
  const t = today0();
  const week = dateKey(startOfWeek(t));
  let lifted = 0, sets = 0;
  const best = {};
  allLogs().forEach(({date, log}) => {
    if(log.isRest) return;
    const daysAgo = Math.round((t - parseKey(date)) / 864e5);
    log.exercises.forEach(ex => {
      const timed = ex.time > 0;
      const done = ex.entries.filter(e => e.done);
      if(!done.length) return;
      if(date >= week){
        sets += done.length;
        if(!timed) done.forEach(e => { lifted += num(e.w) * num(e.r); });
      }
      if(daysAgo < 0 || daysAgo > 34) return;
      const weighted = !timed && done.some(e => num(e.w) > 0);
      const score = maxOf(done.map(e => (weighted ? num(e.w) * (1 + num(e.r) / 30) : num(e.r))));
      if(!score) return;
      const k = normName(ex.name) + (weighted ? '|w' : '|n'); // only compare like with like
      const b = best[k] || (best[k] = {name:ex.name, recent:0, weeks:[0, 0, 0, 0]});
      if(daysAgo <= 6) b.recent = Math.max(b.recent, score);
      else b.weeks[Math.floor((daysAgo - 7) / 7)] = Math.max(b.weeks[Math.floor((daysAgo - 7) / 7)], score);
    });
  });
  const changes = Object.values(best).filter(b => b.recent > 0 && b.weeks.some(v => v > 0)).map(b => {
    const prior = b.weeks.filter(v => v > 0);
    const usual = prior.reduce((a, v) => a + v, 0) / prior.length;
    return {name:b.name, pct:(b.recent - usual) / usual * 100};
  });
  const improvement = changes.length ? Math.round(changes.reduce((a, c) => a + c.pct, 0) / changes.length * 10) / 10 : null;
  const top = changes.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
  const impTop = top ? `${top.name} ${top.pct >= 0 ? '+' : '−'}${Math.abs(Math.round(top.pct))}%` : '';
  return {streak:workoutStats().streak, improvement, impTop, lifted:Math.round(lifted), sets, week};
}

// Sends this phone's numbers when they've changed, and at least once a day so the row stays current.
async function syncLeaderboard(force = false){
  const lb = getLb();
  if(lb && lb.pendingLeave){
    if(await lbRequest('/lb/leave')) saveJSON('wt_lb', {name:lb.name, on:false});
    return;
  }
  if(!lbOn()) return;
  const payload = {name:lb.name, ...leaderboardStats()};
  const stamp = JSON.stringify(payload) + dateKey(today0());
  if(!force && localStorage.getItem('wt_lbsent') === stamp) return;
  if(await lbRequest('/lb/update', payload)) localStorage.setItem('wt_lbsent', stamp);
}

function goLeaders(){
  showScreen('leaders');
  if(lbState !== 'ready') lbState = 'loading';
  renderLeaders();
  refreshLeaders();
}
async function refreshLeaders(){
  await syncLeaderboard();
  const data = await lbRequest('/lb/board');
  if(data){ lbData = data; lbState = 'ready'; }
  else if(!lbData) lbState = 'error';
  if(currentScreen === 'leaders') renderLeaders();
}
function setLbTab(k){ lbTab = k; renderLeaders(); }

const LB_TABS = {
  streak:{label:'Streak', about:'Weeks in a row with a workout',
    value:p => p.streak, show:p => String(p.streak), unit:p => (p.streak === 1 ? 'week' : 'weeks'),
    sub:p => (p.lifted ? `${fmtBig(p.lifted)} ${UNIT} this week` : 'Nothing lifted yet this week'),
    gap:d => `${d} ${d === 1 ? 'week' : 'weeks'}`},
  improvement:{label:'Improvement', about:'Stronger or weaker than their last 4 weeks',
    value:p => p.improvement, show:p => (p.improvement == null ? '—' : `${p.improvement > 0 ? '+' : p.improvement < 0 ? '−' : ''}${Math.abs(p.improvement).toFixed(1)}%`),
    unit:p => (p.improvement == null ? '' : 'vs. usual'),
    sub:p => (p.improvement == null ? 'Not enough history yet' : ''),
    gap:d => `${d.toFixed(1)} points`},
  lifted:{label:'Lifted', about:'Weight × reps this week. Resets Monday',
    value:p => p.lifted, show:p => fmtBig(p.lifted), unit:() => UNIT,
    sub:p => (p.sets ? plural(p.sets, 'set') + ' this week' : 'Nothing lifted yet this week'),
    gap:d => `${fmtBig(d)} ${UNIT}`},
};
const MEDALS = ['🥇', '🥈', '🥉'];

function initials(name){
  const words = name.trim().split(/\s+/);
  const chars = words.length > 1 ? [Array.from(words[0])[0], Array.from(words[1])[0]] : Array.from(words[0]).slice(0, 2);
  return chars.join('').toUpperCase();
}

function renderLeaders(){
  const tab = LB_TABS[lbTab];
  $('lb-about').textContent = tab.about;
  $('lb-seg').innerHTML = Object.entries(LB_TABS).map(([k, v]) =>
    `<button class="${k === lbTab ? 'active' : ''}" aria-pressed="${k === lbTab}" onclick="setLbTab('${k}')">${v.label}</button>`).join('');
  $('lb-join').hidden = lbOn();
  const box = $('lb-list');
  if(lbState === 'loading' && !lbData){ box.innerHTML = '<p class="lb-note">Loading the leaderboard…</p>'; $('lb-gap').textContent = ''; return; }
  if(lbState === 'error' && !lbData){
    box.innerHTML = `<div class="empty"><p class="empty-title">Couldn't load the leaderboard</p><p>Check your connection, then try again.</p></div>
      <button class="btn btn-secondary" onclick="goLeaders()">Try again</button>`;
    $('lb-gap').textContent = '';
    return;
  }
  const players = (lbData && lbData.players) || [];
  if(!players.length){
    box.innerHTML = `<div class="empty"><div class="empty-icon">${ICON.trophy}</div>
      <p class="empty-title">No one's on the board yet</p><p>Join with a nickname and be the first.</p></div>`;
    $('lb-gap').textContent = '';
    return;
  }

  const ranked = players.filter(p => tab.value(p) != null).sort((a, b) => tab.value(b) - tab.value(a));
  const unranked = players.filter(p => tab.value(p) == null);
  let rank = 0, prev = null;
  const row = (p, r) => {
    const v = tab.value(p);
    const medal = r && r <= 3 && v > 0 ? MEDALS[r - 1] : '';
    const tone = lbTab === 'improvement' && v != null ? (v > 0 ? ' lb-up' : v < 0 ? ' lb-down' : '') : '';
    return `<div class="lb-row${p.me ? ' is-me' : ''}">
      <span class="lb-rank${medal ? ' lb-medal' : ''}" aria-label="${r ? 'Rank ' + r : 'Not ranked'}">${medal || (r || '–')}</span>
      <span class="lb-av" aria-hidden="true">${esc(initials(p.name))}</span>
      <span class="lb-text">
        <span class="lb-name"><span class="lb-name-text">${esc(p.name)}</span>${p.me ? '<span class="today-tag">You</span>' : ''}</span>
        ${tab.sub(p) ? `<span class="lb-sub">${esc(tab.sub(p))}</span>` : ""}
      </span>
      <span class="lb-val"><span class="lb-num${tone}">${tab.show(p)}</span><span class="lb-unit">${tab.unit(p)}</span></span>
    </div>`;
  };
  box.innerHTML = ranked.map((p, i) => {
    if(tab.value(p) !== prev){ rank = i + 1; prev = tab.value(p); }
    return row(p, rank);
  }).join('') + unranked.map(p => row(p, 0)).join('');

  const me = players.find(p => p.me);
  const gap = $('lb-gap');
  if(!me || tab.value(me) == null){ gap.textContent = ''; return; }
  const ahead = ranked.filter(p => tab.value(p) > tab.value(me));
  gap.textContent = ahead.length ? `You're ${tab.gap(tab.value(ahead.at(-1)) - tab.value(me))} behind ${ahead.at(-1).name}` : 'You\'re in first place';
}

function askNickname(current){
  const check = (wrap, close) => {
    const name = wrap.querySelector('#nick-in').value.replace(/\s+/g, ' ').trim();
    if(Array.from(name).length < 2 || Array.from(name).length > 20){ wrap.querySelector('#nick-err').hidden = false; return; }
    close(name);
  };
  return sheet({
    title:current ? 'Change nickname' : 'Pick a nickname',
    body:'Others see this nickname and your totals, nothing else.',
    html:`<input class="text-in" id="nick-in" maxlength="20" autocomplete="nickname" autocapitalize="words"
            enterkeyhint="done" placeholder="Nickname" value="${esc(current || '')}" aria-label="Nickname">
          <p class="sheet-error" id="nick-err" hidden>Use 2 to 20 characters.</p>`,
    dialog:true,
    actions:[{label:'Cancel', value:null}, {label:'Save', kind:'btn-primary', onClick:(wrap, close) => { check(wrap, close); return false; }}],
    onMount:(wrap, close) => {
      const inp = wrap.querySelector('#nick-in');
      inp.focus();
      inp.addEventListener('input', () => { wrap.querySelector('#nick-err').hidden = true; });
      inp.addEventListener('keydown', e => { if(e.key === 'Enter') check(wrap, close); });
    },
  });
}

async function joinLeaderboard(){
  const prev = getLb();
  const name = await askNickname(prev && prev.name);
  if(!name){ if(currentScreen === 'settings') renderSettings(); return; }
  saveJSON('wt_lb', {name, on:true});
  localStorage.removeItem('wt_lbsent');
  toast(`You're on the leaderboard as ${name}`, 'ok');
  if(currentScreen === 'settings') renderSettings();
  await syncLeaderboard(true);
  if(currentScreen === 'leaders') refreshLeaders();
}

async function editNickname(){
  const lb = getLb();
  const name = await askNickname(lb && lb.name);
  if(!name) return;
  saveJSON('wt_lb', {name, on:true});
  renderSettings();
  await syncLeaderboard(true);
  toast('Nickname updated', 'ok');
}

async function leaveLeaderboard(){
  const lb = getLb() || {};
  const ok = await lbRequest('/lb/leave');
  // If the phone is offline, remember to finish leaving next time it's online.
  saveJSON('wt_lb', {name:lb.name, on:false, pendingLeave:!ok});
  localStorage.removeItem('wt_lbsent');
  lbData = null;
  lbState = 'idle';
  toast('You\'re off the leaderboard');
  renderSettings();
}

function onLbToggle(el){ if(el.checked) joinLeaderboard(); else leaveLeaderboard(); }

/* ================= Settings ================= */
function goSettings(){ showScreen('settings'); renderSettings(); }

function renderSettings(){
  const support = pushSupport();
  const pushOn = !!getPushSub() && support === 'ok' && Notification.permission === 'granted';
  $('push-toggle').checked = pushOn;
  $('push-toggle').disabled = support !== 'ok';
  $('push-row').classList.toggle('is-used', support !== 'ok');
  $('push-sub').textContent =
    pushOn ? '' :
    support === 'denied' ? 'Blocked. Allow notifications for Workouts in your phone\'s Settings' :
    support === 'unsupported' && isIOS && !isStandalone() ? 'Add this app to your Home Screen first (Share, then Add to Home Screen), then open it from there' :
    support === 'unsupported' ? 'Not available in this browser' :
    'Get an alert when rest is over, even with your phone locked';

  const lb = getLb();
  $('lb-toggle').checked = lbOn();
  $('lb-sub').textContent = lbOn() ? '' : 'Off. Only a nickname and your totals are shared';
  $('lb-name-row').hidden = !lbOn();
  $('lb-name').textContent = lbOn() ? lb.name : '';

  $('bf-icon').innerHTML = isUnlocked() ? ICON.unlock : ICON.lock;
  updateUnlockLabels();
  const all = Object.values(getVideoMeta()).flat();
  const bytes = all.reduce((t, v) => t + (v.size || 0), 0);
  $('video-usage').textContent = all.length ? `${plural(all.length, 'video')} · ${fmtBytes(bytes)} on this phone` : 'No form videos yet';
  $('backup-videos-sub').textContent = all.length ? `Adds ${fmtBytes(bytes)} to the file` : 'No videos to include yet';
}

/* ================= Past workouts (password, 10 minutes) =================
   The password unlocks any past day for 10 minutes: add or edit its workout in the normal
   day screen. It can be unlocked again any time. */
const unlockedUntil = () => Number(localStorage.getItem('wt_unlock')) || 0;
const isUnlocked = () => unlockedUntil() > Date.now();
let unlockTick = null;

async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function openPastEditor(){
  if(isUnlocked()){ goPastPicker(); return; }
  if(!window.crypto || !crypto.subtle){ toast('Open the app from its normal web address to use this', 'error'); return; }
  const check = async (wrap, close) => {
    const inp = wrap.querySelector('#code-in');
    if(await sha256(inp.value.trim().toUpperCase()) === PAST_EDIT_HASH){ close(true); return; }
    wrap.querySelector('#code-err').hidden = false;
    inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
    inp.select();
  };
  const unlocked = await sheet({
    title:'Enter password',
    body:'Editing past workouts is locked. The password unlocks it for 10 minutes.',
    html:`<input class="text-in code-in" id="code-in" type="password" autocomplete="off" autocapitalize="none"
            autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Password">
          <p class="sheet-error" id="code-err" hidden>That password isn't right.</p>`,
    dialog:true,
    actions:[{label:'Cancel', value:false}, {label:'Unlock', kind:'btn-primary', onClick:(wrap, close) => { check(wrap, close); return false; }}],
    onMount:(wrap, close) => {
      const inp = wrap.querySelector('#code-in');
      inp.focus();
      inp.addEventListener('keydown', e => { if(e.key === 'Enter') check(wrap, close); });
    },
  });
  if(!unlocked) return;
  localStorage.setItem('wt_unlock', String(Date.now() + UNLOCK_MINUTES * 60000));
  startUnlockTick();
  goPastPicker();
}

// Counts down the unlocked time; when it runs out, anyone still editing a past day is sent back.
function startUnlockTick(){
  clearInterval(unlockTick);
  unlockTick = setInterval(() => {
    if(isUnlocked()){ updateUnlockLabels(); return; }
    clearInterval(unlockTick);
    localStorage.removeItem('wt_unlock');
    const editingPast = currentScreen === 'backfill' || ((currentScreen === 'day' || currentScreen === 'edit') && cur.past);
    if(editingPast){
      revokeEditUrls();
      toast('Editing time is up');
      goSettings();
    } else if(currentScreen === 'settings') renderSettings();
  }, 1000);
}

function updateUnlockLabels(){
  const left = fmtClock(Math.max(0, Math.ceil((unlockedUntil() - Date.now()) / 1000)));
  const on = isUnlocked();
  if(currentScreen === 'settings'){
    $('bf-sub').textContent = on ? `Unlocked · ${left} left` : 'Add or edit any past day. Needs a password';
  }
  if(currentScreen === 'backfill') $('past-left').textContent = on ? `${left} left` : '';
  if(currentScreen === 'day' && cur.past && on){
    $('day-eyebrow').textContent = `${fmtShort(cur.date)}, ${cur.date.getFullYear()} · ${left} left`;
  }
}

function goPastPicker(){
  if(!isUnlocked()){ openPastEditor(); return; }
  showScreen('backfill');
  setDockButton('Done', goSettings);
  renderPastPicker();
}

// Every month back to the first logged day (at least 2 months, at most a year), newest first.
function renderPastPicker(){
  const t = today0();
  const logs = allLogs();
  const byDate = new Map(logs.map(x => [x.date, x.log]));
  const twoMonths = new Date(t.getFullYear(), t.getMonth() - 2, 1);
  const first = logs.length ? parseKey(logs[0].date) : twoMonths;
  let start = first < twoMonths ? first : twoMonths;
  const yearAgo = new Date(t.getFullYear() - 1, t.getMonth(), 1);
  if(start < yearAgo) start = yearAgo;
  let html = '';
  for(let m = new Date(t.getFullYear(), t.getMonth(), 1); m >= new Date(start.getFullYear(), start.getMonth(), 1);
      m = new Date(m.getFullYear(), m.getMonth() - 1, 1)){
    html += `<div class="bf-month"><div class="bf-month-title">${MONTHS[m.getMonth()]} ${m.getFullYear()}</div>${monthGrid(m.getFullYear(), m.getMonth(), d => {
      const k = dateKey(d);
      const s = logStatus(byDate.get(k));
      const cls = ['cal-cell'];
      if(s) cls.push('st-' + s);
      if(+d === +t) cls.push('is-today');
      if(d > t) return `<span class="${cls.join(' ')} is-future">${d.getDate()}</span>`;
      return `<button class="${cls.join(' ')}" onclick="goDayDate(parseKey('${k}'))"
        aria-label="Edit ${fmtLong(d)}${s ? ': ' + STATUS_LABEL[s] : ''}">${d.getDate()}</button>`;
    })}</div>`;
  }
  $('bf-months').innerHTML = html;
  updateUnlockLabels();
}

/* ================= Form videos =================
   Videos are stored on the phone (IndexedDB), filed under the exercise name,
   so a squat video shows up on every day that has squats. */
let dbPromise = null;
function db(){
  if(!dbPromise){
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('workout-tracker', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('videos', {keyPath:'id'});
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
function idb(mode, fn){
  return db().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction('videos', mode);
    const req = fn(tx.objectStore('videos'));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}
const idbPut = (rec) => idb('readwrite', s => s.put(rec));
const idbGet = (id) => idb('readonly', s => s.get(id));
const idbDelete = (id) => idb('readwrite', s => s.delete(id));
const idbClear = () => idb('readwrite', s => s.clear());

function videosFor(name){ return getVideoMeta()[normName(name)] || []; }
function videoReferenced(id, meta){ return Object.values(meta).some(list => list.some(v => v.id === id)); }

// Renaming an exercise takes its videos along (or shares them if the old name is still in use).
function relinkVideos(oldName, newName, keepOld){
  const meta = getVideoMeta();
  const from = normName(oldName), to = normName(newName);
  if(!meta[from] || !meta[from].length) return;
  const ids = new Set((meta[to] || []).map(v => v.id));
  meta[to] = (meta[to] || []).concat(meta[from].filter(v => !ids.has(v.id)));
  if(!keepOld) delete meta[from];
  saveVideoMeta(meta);
}

async function deleteVideosFor(name){
  const meta = getVideoMeta();
  const list = meta[normName(name)] || [];
  delete meta[normName(name)];
  saveVideoMeta(meta);
  for(const v of list){ if(!videoReferenced(v.id, meta)) await idbDelete(v.id).catch(() => {}); }
}

let pendingVideoName = null;
function pickVideoFor(name){
  pendingVideoName = name;
  const inp = $('video-input');
  inp.value = '';
  inp.click();
}

function onVideoButton(exId){
  const ex = findEx(exId);
  if(!ex) return;
  if(videosFor(ex.name).length) openViewer(ex.name, 0);
  else pickVideoFor(ex.name);
}

async function addVideoFiles(files){
  const name = pendingVideoName;
  if(!name || !files.length) return;
  const key = normName(name);
  toast(files.length > 1 ? 'Adding videos…' : 'Adding video…');
  let added = 0;
  for(const f of files){
    if(f.size > MAX_VIDEO_MB * 1024 * 1024){ toast(`That video is over ${MAX_VIDEO_MB} MB. Try a shorter clip.`, 'error'); continue; }
    try{
      const data = await f.arrayBuffer();
      const id = newId('vid');
      const type = f.type || 'video/mp4';
      await idbPut({id, type, data});
      const meta = getVideoMeta();
      (meta[key] = meta[key] || []).push({id, type, size:f.size, added:Date.now()});
      saveVideoMeta(meta);
      added++;
    }catch(err){
      toast(err && err.name === 'QuotaExceededError' ? 'Not enough space on this phone for that video' : 'Couldn\'t add that video', 'error');
    }
  }
  if(!added) return;
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  toast(added > 1 ? `${added} videos added` : 'Video added', 'ok');
  if(currentScreen === 'day') renderExercises();
  if(currentScreen === 'edit') renderEditVideos();
  if(viewer.open) renderViewerClips();
}

async function removeVideo(id){
  const ok = await sheet({
    title:'Remove this video?',
    body:'It will be deleted from this phone.',
    actions:[{label:'Cancel', value:false}, {label:'Remove', kind:'btn-danger', value:true}],
  });
  if(!ok) return;
  const meta = getVideoMeta();
  const key = normName(editing.originalName);
  meta[key] = (meta[key] || []).filter(v => v.id !== id);
  if(!meta[key].length) delete meta[key];
  saveVideoMeta(meta);
  if(!videoReferenced(id, meta)) await idbDelete(id).catch(() => {});
  renderEditVideos();
}

function revokeEditUrls(){ editUrls.forEach(u => URL.revokeObjectURL(u)); editUrls = []; }

async function renderEditVideos(){
  const box = $('edit-videos');
  revokeEditUrls();
  if(editing.isNew){
    box.innerHTML = '<div class="section-head">Form videos</div><p class="hint">Save the exercise first. Then add videos with the video button on its card.</p>';
    return;
  }
  const vids = videosFor(editing.originalName);
  box.innerHTML = `<div class="section-head">Form videos</div>
    <div class="thumbs">
      ${vids.map((v, i) => `<div class="thumb">
        <button class="thumb-play" onclick="openViewer(editing.originalName, ${i})" aria-label="Play video ${i + 1}">
          <video muted playsinline preload="metadata" data-vid="${v.id}"></video>${ICON.play}
        </button>
        <button class="thumb-del" onclick="removeVideo('${v.id}')" aria-label="Remove video ${i + 1}">${ICON.x}</button>
      </div>`).join('')}
      <button class="thumb add" onclick="pickVideoFor(editing.originalName)">${ICON.plus}<span>Add video</span></button>
    </div>
    <p class="hint">Short clips from your camera roll. Save a TikTok to your phone first, then add it here.</p>`;
  for(const el of box.querySelectorAll('video[data-vid]')){
    const rec = await idbGet(el.dataset.vid).catch(() => null);
    if(!rec || !el.isConnected) continue;
    const url = URL.createObjectURL(new Blob([rec.data], {type:rec.type}));
    editUrls.push(url);
    el.src = url + '#t=0.1';
  }
}

const viewer = {open:false, name:'', index:0, url:null};

async function openViewer(name, index){
  if(!videosFor(name).length) return;
  Object.assign(viewer, {open:true, name, index});
  $('viewer-title').textContent = name;
  $('viewer').hidden = false;
  document.body.classList.add('no-scroll');
  renderViewerClips();
  await loadViewerClip();
}
function renderViewerClips(){
  const vids = videosFor(viewer.name);
  $('viewer-clips').innerHTML = vids.map((v, i) =>
    `<button class="clip-pill${i === viewer.index ? ' active' : ''}" onclick="showClip(${i})">Clip ${i + 1}</button>`).join('') +
    `<button class="clip-pill" onclick="pickVideoFor(viewer.name)">+ Add</button>`;
}
async function showClip(i){ viewer.index = i; renderViewerClips(); await loadViewerClip(); }
async function loadViewerClip(){
  const v = videosFor(viewer.name)[viewer.index];
  const video = $('viewer-video');
  if(viewer.url){ URL.revokeObjectURL(viewer.url); viewer.url = null; }
  if(!v) return;
  const rec = await idbGet(v.id).catch(() => null);
  if(!rec){ toast('This video is missing on this phone', 'error'); return; }
  viewer.url = URL.createObjectURL(new Blob([rec.data], {type:rec.type}));
  video.src = viewer.url;
  video.muted = false;
  try{ await video.play(); }
  catch(e){ video.muted = true; video.play().catch(() => {}); }
}
function closeViewer(){
  const video = $('viewer-video');
  video.pause();
  video.removeAttribute('src');
  video.load();
  if(viewer.url){ URL.revokeObjectURL(viewer.url); viewer.url = null; }
  viewer.open = false;
  $('viewer').hidden = true;
  document.body.classList.remove('no-scroll');
}

/* ================= Backup & restore =================
   File layout: "WTB1" + 12-digit header length + JSON header + raw video bytes.
   Videos are appended as-is so big files never have to be turned into text. */
async function buildBackup(includeVideos){
  const data = {};
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith('wt_') && !DEVICE_KEYS.includes(k)) data[k] = localStorage.getItem(k);
  }
  const videos = [], parts = [];
  let offset = 0;
  if(includeVideos){
    for(const v of Object.values(getVideoMeta()).flat()){
      if(videos.some(x => x.id === v.id)) continue;
      const rec = await idbGet(v.id).catch(() => null);
      if(!rec) continue;
      videos.push({id:v.id, type:rec.type, size:rec.data.byteLength, offset});
      parts.push(rec.data);
      offset += rec.data.byteLength;
    }
  }
  const header = new TextEncoder().encode(JSON.stringify({
    app:'workout-tracker', version:2, exportedAt:new Date().toISOString(), data, videos,
  }));
  const prefix = 'WTB1' + String(header.length).padStart(12, '0');
  const days = Object.keys(data).filter(k => k.startsWith('wt_log_')).length;
  const name = `workouts-backup-${dateKey(today0())}.wtb`;
  return {file:new File([prefix, header, ...parts], name, {type:'application/octet-stream'}), days, videoCount:videos.length};
}

function downloadFile(file){
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function exportBackup(){
  const include = $('backup-videos').checked;
  let built;
  try{
    toast('Getting your backup ready…');
    built = await buildBackup(include);
  }catch(e){
    toast('Couldn\'t create the backup', 'error');
    return;
  }
  const {file, days, videoCount} = built;
  // Sharing has to start from a tap, so the file is built first and saved from this sheet.
  await sheet({
    title:'Backup ready',
    body:`${fmtBytes(file.size)} · ${plural(days, 'logged day')}${include ? ` · ${plural(videoCount, 'video')}` : ''}.<br>Save it to Files or iCloud Drive, or send it to yourself.`,
    actions:[{label:'Cancel', value:false}, {label:'Save backup', kind:'btn-primary', onClick:(wrap, close) => {
      if(navigator.canShare && navigator.canShare({files:[file]})){
        navigator.share({files:[file], title:'Workout backup'}).catch(err => { if(err.name !== 'AbortError') downloadFile(file); });
      } else {
        downloadFile(file);
      }
      close(true);
      return false;
    }}],
  });
}

async function importBackup(file){
  let header, base;
  try{
    const head = await file.slice(0, 16).text();
    if(!head.startsWith('WTB1')) throw new Error('format');
    const len = parseInt(head.slice(4), 10);
    header = JSON.parse(await file.slice(16, 16 + len).text());
    base = 16 + len;
    if(header.app !== 'workout-tracker' || !header.data) throw new Error('format');
  }catch(e){
    toast('That file isn\'t a workout backup', 'error');
    return;
  }
  const days = Object.keys(header.data).filter(k => k.startsWith('wt_log_')).length;
  const when = fmtShort(new Date(header.exportedAt));
  const ok = await sheet({
    title:'Restore this backup?',
    body:`Everything on this phone will be replaced with the backup from ${esc(when)}: ${plural(days, 'logged day')}${header.videos.length ? ` and ${plural(header.videos.length, 'video')}` : ''}.`,
    actions:[{label:'Cancel', value:false}, {label:'Restore', kind:'btn-danger', value:true}],
  });
  if(!ok) return;
  try{
    toast('Restoring…');
    const keepVideos = !header.videos.length;
    const currentVideos = localStorage.getItem('wt_videos');
    Object.keys(localStorage).filter(k => k.startsWith('wt_') && !DEVICE_KEYS.includes(k)).forEach(k => localStorage.removeItem(k));
    Object.entries(header.data).forEach(([k, v]) => { if(k.startsWith('wt_') && !DEVICE_KEYS.includes(k)) localStorage.setItem(k, v); });
    if(keepVideos){
      // A backup without videos leaves the videos already on this phone alone.
      if(currentVideos) localStorage.setItem('wt_videos', currentVideos); else localStorage.removeItem('wt_videos');
    } else {
      await idbClear();
      for(const v of header.videos){
        const data = await file.slice(base + v.offset, base + v.offset + v.size).arrayBuffer();
        await idbPut({id:v.id, type:v.type, data});
      }
    }
    toast('Backup restored', 'ok');
    setTimeout(() => location.reload(), 700);
  }catch(e){
    toast('Restore failed. Try again with the same file.', 'error');
  }
}

/* ================= Toast & sheets ================= */
function toast(msg, kind = ''){
  const el = $('toast');
  el.className = 'toast' + (kind ? ' toast-' + kind : '');
  el.textContent = msg;
  if(kind === 'pr') el.insertAdjacentHTML('afterbegin', '<span class="pr-tag">NEW PR</span>');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), kind === 'pr' ? 3600 : 2800);
}

// A bottom sheet (or a top dialog when it holds a text field). Resolves with the tapped action's value.
function sheet({title, body = '', html = '', actions = [], dialog = false, onMount}){
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-backdrop' + (dialog ? ' is-dialog' : '');
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grabber"></div>
      <h2 class="sheet-title">${esc(title)}</h2>
      ${body ? `<p class="sheet-body">${body}</p>` : ''}
      ${html}
      <div class="sheet-actions">${actions.map((a, i) =>
        `<button class="btn ${a.kind || 'btn-secondary'}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
    </div>`;
    let closed = false;
    const close = (value) => {
      if(closed) return;
      closed = true;
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 320);
      resolve(value);
    };
    wrap.addEventListener('click', e => {
      if(e.target === wrap){ close(null); return; }
      const b = e.target.closest('[data-i]');
      if(!b) return;
      const a = actions[+b.dataset.i];
      if(a.onClick && a.onClick(wrap, close) === false) return;
      close(a.value);
    });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    if(onMount) onMount(wrap, close);
  });
}

/* ================= Start up ================= */
// Screens leave room at the bottom for whatever the dock is showing.
function setDockHeight(){
  const h = $('dock').offsetHeight;
  if(h) document.documentElement.style.setProperty('--dock-h', h + 'px'); // 0 while hidden for typing
}

function init(){
  if('ResizeObserver' in window) new ResizeObserver(setDockHeight).observe($('dock'));
  setDockHeight();
  initProgressSwipe();

  const list = $('exercise-list');
  list.addEventListener('input', e => {
    const t = e.target;
    if(!t.classList.contains('set-in')) return;
    const clean = t.value.replace(',', '.').replace(/[^\d.]/g, '');
    if(clean !== t.value) t.value = clean;
    const ex = findEx(t.dataset.ex);
    if(!ex) return;
    const i = +t.dataset.i, f = t.dataset.f;
    ex.entries[i][f] = clean;
    // Typing in a set copies the number down to every later set that isn't ticked yet.
    for(let j = i + 1; j < ex.entries.length; j++){
      if(ex.entries[j].done) continue;
      ex.entries[j][f] = clean;
      const box = list.querySelector(`.set-in[data-ex="${ex.id}"][data-i="${j}"][data-f="${f}"]`);
      if(box) box.value = clean;
    }
    saveDay();
  });
  list.addEventListener('keydown', e => {
    if(e.key === 'Enter' && e.target.classList.contains('set-in')) e.target.blur();
  });
  // The bottom bar hides while typing so the keyboard doesn't push it over the sets.
  document.addEventListener('focusin', e => { if(e.target.matches('.set-in, .field-in, .stepper input')) document.body.classList.add('typing'); });
  document.addEventListener('focusout', () => document.body.classList.remove('typing'));
  $('edit-name').addEventListener('keydown', e => { if(e.key === 'Enter') e.target.blur(); });

  $('video-input').addEventListener('change', e => addVideoFiles([...e.target.files]));
  $('restore-input').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if(f) importBackup(f); });

  document.addEventListener('visibilitychange', () => {
    if(document.hidden) return;
    closeOutPastDays(); // the app may have sat in the background past midnight
    resumeTimer();
    checkIn();
    syncLeaderboard();
    if(currentScreen === 'week') renderWeek();
    if(currentScreen === 'leaders') refreshLeaders();
  });
  window.addEventListener('resize', debounce(() => { if(currentScreen === 'progress-detail') renderProgressDetail(); }, 150));
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && viewer.open) closeViewer(); });

  closeOutPastDays();
  goWeek();
  resumeTimer();
  if(isUnlocked()) startUnlockTick();
  checkIn();
  syncLeaderboard();

  if('serviceWorker' in navigator){
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    // When a new version takes over, reload once so the screen matches it. Everything is already saved.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(hadController && !reloading){ reloading = true; location.reload(); }
    });
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').then(syncPush).catch(() => {}));
  }
}

init();
