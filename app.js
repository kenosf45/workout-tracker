'use strict';

// Older iPhones (before iOS 15.4) don't have Array.at.
if(!Array.prototype.at) Array.prototype.at = function(i){ i = Math.trunc(i) || 0; return this[i < 0 ? i + this.length : i]; };

/* ================= Constants ================= */
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const UNIT = 'lb';
// SHA-256 of the backfill code word, so the word itself isn't sitting in the source.
const BACKFILL_CODE_HASH = '2d57614242936ea197f8d41de38d10f93e4165bfe265f61f4b785e6cc4b078f8';
const BACKFILL_MONTHS = 2;
const MAX_VIDEO_MB = 300;

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
  flame: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.6 2.3c.4 2.9-.7 4.6-2.1 6.2C9 10.1 7.5 11.7 7.5 14.6A4.5 4.5 0 0 0 12 19.2a4.6 4.6 0 0 0 4.6-4.6c0-1.6-.6-2.8-1.3-3.7-.2 1.3-.9 2.1-1.8 2.4.6-2.9-.1-6.6-.9-11z"/></svg>',
  lock: icon('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>'),
  calCheck: icon('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>'),
  chart: icon('<path d="M4 20h16"/><path d="M5 15.5l4.5-4.5 3.5 3.5L19.5 8"/>'),
};
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

function workoutStats(){
  const worked = allLogs().filter(x => workedOut(x.log)).map(x => x.date);
  const weeks = new Set(worked.map(d => dateKey(startOfWeek(parseKey(d)))));
  // This week only adds to the streak once you've trained; it never breaks it.
  let w = startOfWeek(today0());
  if(!weeks.has(dateKey(w))) w = addDays(w, -7);
  let streak = 0;
  while(weeks.has(dateKey(w))){ streak++; w = addDays(w, -7); }
  const month = dateKey(today0()).slice(0, 7);
  return {streak, month: worked.filter(d => d.startsWith(month)).length, total: worked.length};
}

/* ================= Screens & dock ================= */
const SCREENS = {
  week:{tab:'week'}, history:{tab:'history'}, progress:{tab:'progress'},
  'progress-detail':{tab:'progress'}, settings:{tab:'settings'},
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
  $('week-eyebrow').textContent = fmtLong(t);
  $('week-range').textContent = `${fmtShort(dates[0])} – ${fmtShort(dates[6])}`;

  let planned = 0, worked = 0;
  const rows = dates.map((d, i) => {
    const dayName = DAYS[i], log = getLog(dateKey(d)), exs = plan[dayName] || [];
    const isPast = d < t, isToday = +d === +t;
    // Past days only count rest that was actually logged; today and later preview the weekly setting.
    const isRest = isPast ? !!(log && log.isRest) : !!rest[dayName];
    let state, sub;
    if(isRest){
      state = 'rest'; sub = 'Rest day';
    } else {
      if(exs.length || workedOut(log)) planned++;
      if(workedOut(log)) worked++;
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

  const {streak} = workoutStats();
  const pct = planned ? Math.min(100, Math.round(worked / planned * 100)) : 0;
  $('week-summary').innerHTML = `<div class="summary">
    <div class="summary-top">
      <div>
        <span class="summary-num">${worked}<span class="summary-of">/${planned}</span></span>
        <span class="summary-label">${planned ? 'workouts done this week' : 'Tap a day to plan your workouts'}</span>
      </div>
      <span class="streak">${ICON.flame}${streak ? `${streak}-week streak` : 'No streak yet'}</span>
    </div>
    <div class="meter"><span style="width:${pct}%"></span></div>
  </div>`;
}

/* ================= Day ================= */
const cur = {idx:null, date:null, key:null, log:null, planIds:new Set(), prev:{}, best:{}};

function goDay(i){
  const d = weekDates()[i];
  Object.assign(cur, {idx:i, date:d, key:dateKey(d)});
  showScreen('day');
  setDockButton('Done', goWeek);
  renderDay();
}

// Today's log, merged with the current weekly plan.
function buildDayLog(dayName, key){
  const template = getPlan()[dayName] || [];
  const log = getLog(key) || {day:dayName, isRest:false, exercises:[]};
  const byId = new Map(log.exercises.map(e => [e.id, e]));
  const out = [];
  template.forEach(t => {
    const e = byId.get(t.id);
    if(e){
      Object.assign(e, {name:t.name, reps:t.reps, time:t.time, restSeconds:t.restSeconds || 0});
      fitEntries(e, t.sets);
      byId.delete(t.id);
      out.push(e);
    } else {
      out.push({id:t.id, name:t.name, sets:t.sets, reps:t.reps, time:t.time, restSeconds:t.restSeconds || 0,
                entries:Array.from({length:t.sets}, blankEntry)});
    }
  });
  // An exercise removed from the plan stays on days where sets were already logged.
  byId.forEach(e => { if(e.entries.some(x => x.done)) out.push(e); });
  log.exercises = out;
  return log;
}

// "Previous" numbers and best weights come from every day before this one.
function indexHistory(beforeKey){
  const prev = {}, best = {};
  allLogs().filter(x => x.date < beforeKey && !x.log.isRest).reverse().forEach(({date, log}) => {
    log.exercises.forEach(ex => {
      const k = normName(ex.name);
      const done = ex.entries.filter(e => e.done);
      if(!done.length) return;
      if(!prev[k]) prev[k] = {date, entries:ex.entries};
      done.forEach(e => { const w = num(e.w); if(w > 0 && (best[k] == null || w > best[k])) best[k] = w; });
    });
  });
  return {prev, best};
}

function renderDay(){
  const dayName = DAYS[cur.idx];
  const isToday = +cur.date === +today0();
  $('day-eyebrow').textContent = fmtShort(cur.date) + (isToday ? ' · Today' : '');
  $('day-title').textContent = dayName;
  $('rest-sub').textContent = `Repeats every ${dayName}`;
  cur.log = buildDayLog(dayName, cur.key);
  cur.planIds = new Set((getPlan()[dayName] || []).map(e => e.id));
  Object.assign(cur, indexHistory(cur.key));
  $('rest-toggle').checked = !!cur.log.isRest;
  renderExercises();
}

function renderExercises(){
  const list = $('exercise-list');
  if(cur.log.isRest){
    $('add-ex-btn').hidden = true;
    list.innerHTML = `<div class="empty"><div class="empty-icon">${ICON.moon}</div>
      <p class="empty-title">Rest day</p><p>Recovery is part of the plan. Turn off rest day to log a workout.</p></div>`;
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
function saveDay(){ saveLog(cur.key, cur.log); }
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
function suggestion(ex, i){
  const p = cur.prev[normName(ex.name)];
  const pe = p && p.entries[i] && p.entries[i].done ? p.entries[i] : null;
  let w = pe && num(pe.w) > 0 ? fmtNum(num(pe.w)) : '';
  let r = pe && num(pe.r) > 0 ? fmtNum(num(pe.r)) : '';
  for(let j = i - 1; j >= 0 && (!w || !r); j--){
    const e = ex.entries[j];
    if(!w && num(e.w) > 0) w = fmtNum(num(e.w));
    if(!r && num(e.r) > 0) r = fmtNum(num(e.r));
  }
  if(!r){ const target = ex.time > 0 ? ex.time : ex.reps; if(target > 0) r = String(target); }
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
  if(ex.restSeconds > 0) meta.push(`${fmtRest(ex.restSeconds)} rest`);
  if(!inPlan) meta.push('removed from plan');

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
    if(ex.restSeconds > 0) startRest(ex.restSeconds, ex.name);
  } else {
    e.done = false;
  }
  saveDay();
  replaceCard(exId);
}

function toggleRest(){
  const on = $('rest-toggle').checked;
  cur.log.isRest = on;
  const r = getRest();
  r[DAYS[cur.idx]] = on;
  saveRest(r);
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
  $('edit-time').value = t.time || 0;
  $('edit-rest').value = t.restSeconds || 0;
  $('edit-eyebrow').textContent = DAYS[cur.idx];
  const names = new Set();
  Object.values(getPlan()).flat().forEach(e => names.add(e.name));
  allLogs().forEach(x => x.log.exercises.forEach(e => names.add(e.name)));
  $('exercise-names').innerHTML = [...names].sort().map(n => `<option value="${esc(n)}">`).join('');
}

function openAddExercise(){
  editing = {id:null, isNew:true, originalName:''};
  fillEditForm({name:'', sets:3, reps:10, time:0, restSeconds:60});
  $('edit-title').textContent = 'New exercise';
  $('edit-delete').hidden = true;
  showScreen('edit');
  setDockButton('Add exercise', submitExercise);
  renderEditVideos();
}

function openEditExercise(exId){
  const t = (getPlan()[DAYS[cur.idx]] || []).find(e => e.id === exId);
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
  setDockButton('Done', goWeek);
  renderDay();
}

function step(id, dir){
  const el = $(id);
  const min = +el.dataset.min, max = +el.dataset.max, s = +el.dataset.step;
  let v = (parseInt(el.value, 10) || 0) + dir * s;
  if(s > 1) v = Math.round(v / s) * s;
  el.value = Math.min(max, Math.max(min, v));
}
function readStep(id){
  const el = $(id);
  const v = parseInt(el.value, 10);
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
  const t = {name, sets:readStep('edit-sets'), reps:readStep('edit-reps'), time:readStep('edit-time'), restSeconds:readStep('edit-rest')};
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
  saveJSON('wt_timer', {endsAt:Date.now() + seconds * 1000, total:seconds, name});
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
function addRest(sec){
  const t = getTimer();
  if(!t) return;
  t.endsAt += sec * 1000;
  t.total += sec;
  saveJSON('wt_timer', t);
  paintTimer();
}
function skipRest(){ stopTimer(); }
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
      .then(reg => reg.showNotification('Rest complete', {body:`${t.name}: back to it`, icon:'icon-192.png', tag:'rest'}))
      .catch(() => {});
  }
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
  const editable = d >= ws[0] && d <= today0();
  let body = '';
  if(!log || !s){
    body = '<p class="detail-note">Nothing logged this day.</p>';
  } else if(s === 'rest'){
    body = '<p class="detail-note">Rest day.</p>';
  } else {
    const shown = log.exercises.filter(ex => ex.entries.some(e => e.done) || !log.backfilled);
    if(log.backfilled && !shown.length) body = '<p class="detail-note">Worked out. Added from the calendar.</p>';
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
    ${editable ? `<button class="btn" onclick="goDay(${dayIndex(d)})">Open ${DAYS[dayIndex(d)]}</button>` : ''}
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
  $('prog-list').innerHTML = progressItems.map((item, i) => {
    const m = metricDefs(item)[0];
    const values = item.sessions.map(m.calc).filter(v => v > 0);
    const best = maxOf(values);
    return `<button class="prog-row" onclick="openProgress(${i})">
      <span class="prog-text">
        <span class="prog-name">${esc(item.name)}</span>
        <span class="prog-sub">Best ${fmtVal(best)} ${m.unit} · ${plural(item.sessions.length, 'workout')}</span>
      </span>
      ${sparkline(values.slice(-12))}
      <span class="chev">${ICON.chevron}</span>
    </button>`;
  }).join('');
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

/* ================= Settings ================= */
function goSettings(){ showScreen('settings'); renderSettings(); }

function renderSettings(){
  const s = getSettings();
  const row = $('bf-row');
  if(s.backfillUsedAt){
    row.classList.add('is-used');
    $('bf-icon').innerHTML = ICON.check;
    $('bf-sub').textContent = `Already used on ${fmtShort(parseKey(s.backfillUsedAt))}`;
  } else {
    row.classList.remove('is-used');
    $('bf-icon').innerHTML = ICON.lock;
    $('bf-sub').textContent = `Mark days from the last ${BACKFILL_MONTHS} months. Needs a code`;
  }
  const all = Object.values(getVideoMeta()).flat();
  const bytes = all.reduce((t, v) => t + (v.size || 0), 0);
  $('video-usage').textContent = all.length ? `${plural(all.length, 'video')} · ${fmtBytes(bytes)} on this phone` : 'No form videos yet';
  $('backup-videos-sub').textContent = all.length ? `Adds ${fmtBytes(bytes)} to the file` : 'No videos to include yet';
}

/* ================= Backfill (code word, one time only) ================= */
let backfillSel = new Set();

async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function openBackfill(){
  const s = getSettings();
  if(s.backfillUsedAt){ toast('Past workouts were already added. This only works once.'); return; }
  if(!window.crypto || !crypto.subtle){ toast('Open the app from its normal web address to use this', 'error'); return; }
  const check = async (wrap, close) => {
    const inp = wrap.querySelector('#code-in');
    if(await sha256(inp.value.trim().toUpperCase()) === BACKFILL_CODE_HASH){ close(true); return; }
    wrap.querySelector('#code-err').hidden = false;
    inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
    inp.select();
  };
  const unlocked = await sheet({
    title:'Enter code',
    body:'Adding past workouts is locked. Enter the code to continue.',
    html:`<input class="text-in code-in" id="code-in" autocomplete="off" autocapitalize="characters" autocorrect="off"
            spellcheck="false" enterkeyhint="go" aria-label="Code">
          <p class="sheet-error" id="code-err" hidden>That code isn't right.</p>`,
    dialog:true,
    actions:[{label:'Cancel', value:false}, {label:'Unlock', kind:'btn-primary', onClick:(wrap, close) => { check(wrap, close); return false; }}],
    onMount:(wrap, close) => {
      const inp = wrap.querySelector('#code-in');
      inp.focus();
      inp.addEventListener('keydown', e => { if(e.key === 'Enter') check(wrap, close); });
    },
  });
  if(!unlocked) return;
  backfillSel = new Set();
  showScreen('backfill');
  renderBackfill();
}

function backfillRange(){
  const start = today0();
  start.setMonth(start.getMonth() - BACKFILL_MONTHS);
  return {start, end:addDays(today0(), -1)};
}

function renderBackfill(){
  const {start, end} = backfillRange();
  let html = '';
  for(let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)){
    const y = cursor.getFullYear(), m = cursor.getMonth();
    html += `<div class="bf-month"><div class="bf-month-title">${MONTHS[m]} ${y}</div>${monthGrid(y, m, d => {
      const k = dateKey(d);
      if(d < start || d > end) return `<span class="cal-cell is-off">${d.getDate()}</span>`;
      const log = getLog(k);
      if(workedOut(log)) return `<span class="cal-cell bf-logged" aria-label="${fmtLong(d)}: already logged">${d.getDate()}</span>`;
      if(log && log.isRest) return `<span class="cal-cell bf-rest" aria-label="${fmtLong(d)}: rest day">${d.getDate()}</span>`;
      const on = backfillSel.has(k);
      return `<button class="cal-cell bf-pick${on ? ' is-selected' : ''}" data-day="${k}" aria-pressed="${on}"
        aria-label="${fmtLong(d)}" onclick="toggleBackfillDay('${k}')">${d.getDate()}</button>`;
    })}</div>`;
  }
  $('bf-months').innerHTML = html;
  updateBackfillButton();
}

function toggleBackfillDay(k){
  if(backfillSel.has(k)) backfillSel.delete(k); else backfillSel.add(k);
  const el = document.querySelector(`[data-day="${k}"]`);
  if(el){
    el.classList.toggle('is-selected', backfillSel.has(k));
    el.setAttribute('aria-pressed', backfillSel.has(k));
  }
  updateBackfillButton();
}
function updateBackfillButton(){
  const n = backfillSel.size;
  setDockButton(n ? `Save ${plural(n, 'day')}` : 'Tap the days you worked out', saveBackfill, !n);
}

async function saveBackfill(){
  const n = backfillSel.size;
  if(!n) return;
  const ok = await sheet({
    title:`Save ${plural(n, 'workout')}?`,
    body:'They\'ll show in your history and count toward your streak. You can only do this once, so check the days first.',
    actions:[{label:'Go back', value:false}, {label:'Save', kind:'btn-primary', value:true}],
  });
  if(!ok) return;
  backfillSel.forEach(k => {
    const log = getLog(k) || {day:DAYS[dayIndex(parseKey(k))], isRest:false, exercises:[]};
    log.backfilled = true;
    log.isRest = false;
    saveLog(k, log);
  });
  const s = getSettings();
  s.backfillUsedAt = dateKey(today0());
  s.backfillCount = n;
  saveSettings(s);
  toast(`Added ${plural(n, 'workout')}`, 'ok');
  histSelected = null;
  goHistory();
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
    if(k && k.startsWith('wt_') && k !== 'wt_timer') data[k] = localStorage.getItem(k);
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
    Object.keys(localStorage).filter(k => k.startsWith('wt_')).forEach(k => localStorage.removeItem(k));
    Object.entries(header.data).forEach(([k, v]) => { if(k.startsWith('wt_')) localStorage.setItem(k, v); });
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

  const list = $('exercise-list');
  list.addEventListener('input', e => {
    const t = e.target;
    if(!t.classList.contains('set-in')) return;
    const clean = t.value.replace(',', '.').replace(/[^\d.]/g, '');
    if(clean !== t.value) t.value = clean;
    const ex = findEx(t.dataset.ex);
    if(!ex) return;
    ex.entries[+t.dataset.i][t.dataset.f] = clean;
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
    resumeTimer();
    if(currentScreen === 'week') renderWeek();
  });
  window.addEventListener('resize', debounce(() => { if(currentScreen === 'progress-detail') renderProgressDetail(); }, 150));
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && viewer.open) closeViewer(); });

  goWeek();
  resumeTimer();

  if('serviceWorker' in navigator){
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    // When a new version takes over, reload once so the screen matches it. Everything is already saved.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(hadController && !reloading){ reloading = true; location.reload(); }
    });
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
  }
}

init();
