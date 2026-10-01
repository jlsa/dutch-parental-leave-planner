import './style.css';
import { addDays, addMonths, diffDays, fmtLong, fmtMonth, fmtShort, format, parse, weekday, type ISODate } from './dates';
import { holidayName } from './holidays';
import { buildPlan, defaultSettings, LABELS, type Block, type LeaveType, type Plan, type Settings, type WeekPattern } from './plan';
import { decodeSettings, encodeSettings, sanitize } from './share';

const STORAGE_KEY = 'verlofplanner:v1';
const DAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const TYPES: LeaveType[] = ['birth', 'extra', 'parental'];

const PAY: Record<LeaveType, string> = {
  birth: '100% doorbetaald door je werkgever',
  extra: 'UWV-uitkering: 70% van je dagloon (tot 70% van het maximumdagloon)',
  parental: 'UWV-uitkering: 70% van je dagloon (tot 70% van het maximumdagloon)',
};

const RULE: Record<LeaveType, string> = {
  birth: '1 werkweek, binnen 4 weken na de geboorte',
  extra: 'max. 5 werkweken, binnen 6 maanden, ná het geboorteverlof',
  parental: '9 betaalde weken, in het eerste levensjaar',
};

// ---------- state ----------

/** Een gedeelde link gaat voor; anders de laatst opgeslagen planning in deze browser. */
function load(): Settings {
  const shared = decodeSettings(location.hash);
  if (shared) return shared;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw && sanitize(JSON.parse(raw));
    if (stored) return stored;
  } catch {
    /* geen opslag beschikbaar */
  }
  return defaultSettings(format(new Date()));
}

function save() {
  // De URL houdt altijd de actuele planning bij, zodat je hem direct kunt delen.
  history.replaceState(null, '', `#${encodeSettings(settings)}`);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* negeren */
  }
}

async function share(button: HTMLButtonElement) {
  save();
  const url = location.href;
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = 'Link gekopieerd ✓';
  } catch {
    window.prompt('Kopieer deze link:', url);
  }
  setTimeout(() => (button.textContent = label), 2000);
}

let settings = load();

// ---------- helpers ----------

const h = (n: number) => `${+n.toFixed(2)}`.replace('.', ',') + ' u';
const weeks = (days: number) => {
  const w = Math.floor(days / 7);
  const d = days % 7;
  return d ? `${w} wk ${d} d` : `${w} weken`;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function patternInput(key: 'work' | 'extraPattern' | 'parentalPattern', max = 24) {
  return `<div class="pattern" data-pattern="${key}">
    ${DAYS.map(
      (d, i) => `<label><span>${d}</span><input type="number" min="0" max="${max}" step="0.5" data-i="${i}" value="${settings[key][i]}" inputmode="decimal"></label>`,
    ).join('')}
  </div>`;
}

// ---------- form ----------

function renderForm() {
  const form = document.querySelector<HTMLElement>('#form')!;
  form.innerHTML = `
    <section class="panel">
      <h2>Basis</h2>
      <label class="field">
        <span>Geboortedatum</span>
        <input type="date" id="birthDate" value="${settings.birthDate}" required>
      </label>
      <div class="field">
        <span>Werkuren per dag <em id="workTotal"></em></span>
        ${patternInput('work')}
      </div>
      <label class="check">
        <input type="checkbox" id="skipHolidays" ${settings.skipHolidays ? 'checked' : ''}>
        <span>Feestdagen overslaan (daar werk je toch niet)</span>
      </label>
    </section>

    <section class="panel" style="--c: var(--birth)">
      <h2><i></i>Geboorteverlof</h2>
      <label class="field">
        <span>Startdatum <em>leeg = geboortedag</em></span>
        <input type="date" id="birthStart" value="${settings.birthStart}">
      </label>
    </section>

    <section class="panel" style="--c: var(--extra)">
      <h2><i></i>Aanvullend geboorteverlof</h2>
      <label class="field">
        <span>Aantal weken <em id="extraWeeksOut">${settings.extraWeeks}</em></span>
        <input type="range" id="extraWeeks" min="0" max="5" step="1" value="${settings.extraWeeks}">
      </label>
      <label class="field">
        <span>Startdatum <em>leeg = direct na geboorteverlof</em></span>
        <input type="date" id="extraStart" value="${settings.extraStart}">
      </label>
      <div class="field">
        <span>Verlofuren per dag <em id="extraTotal"></em></span>
        ${patternInput('extraPattern')}
        <button type="button" class="link" data-copy="extraPattern">Gelijk aan werkuren (volledig vrij)</button>
      </div>
    </section>

    <section class="panel" style="--c: var(--parental)">
      <h2><i></i>Betaald ouderschapsverlof</h2>
      <label class="field">
        <span>Aantal betaalde weken <em id="parentalWeeksOut">${settings.parentalWeeks}</em></span>
        <input type="range" id="parentalWeeks" min="0" max="9" step="1" value="${settings.parentalWeeks}">
      </label>
      <label class="field">
        <span>Startdatum <em>leeg = direct na aanvullend verlof</em></span>
        <input type="date" id="parentalStart" value="${settings.parentalStart}">
      </label>
      <div class="field">
        <span>Uren per dag minder werken <em id="parentalTotal"></em></span>
        ${patternInput('parentalPattern')}
        <div class="quick">
          Snel: elke werkdag
          ${[1, 2, 3, 4].map((n) => `<button type="button" data-quick="${n}">${n} u</button>`).join('')}
        </div>
      </div>
    </section>

    <section class="panel" style="--c: var(--vacation)">
      <h2><i></i>Vakantie</h2>
      <p class="note">Op vakantiedagen wordt geen verlof verbruikt; het verlof schuift door.</p>
      <div class="vac-add">
        <label class="field"><span>Van</span><input type="date" id="vacFrom"></label>
        <label class="field"><span>Tot en met <em>optioneel</em></span><input type="date" id="vacTo"></label>
        <button type="button" class="add" id="vacAdd">Toevoegen</button>
      </div>
      <ul class="vac-list" id="vacList"></ul>
    </section>

    <button type="button" class="link reset" id="reset">Alles terugzetten naar standaard</button>
  `;
}

function onInput(e: Event) {
  const t = e.target as HTMLInputElement;
  const patternEl = t.closest<HTMLElement>('[data-pattern]');
  if (patternEl) {
    const key = patternEl.dataset.pattern as 'work' | 'extraPattern' | 'parentalPattern';
    const next = [...settings[key]] as WeekPattern;
    next[Number(t.dataset.i)] = Math.max(0, Number(t.value) || 0);
    settings = { ...settings, [key]: next };
  } else if (t.id === 'skipHolidays') {
    settings.skipHolidays = t.checked;
  } else if (t.id === 'extraWeeks' || t.id === 'parentalWeeks') {
    settings[t.id] = Number(t.value);
    document.querySelector(`#${t.id}Out`)!.textContent = t.value;
  } else if (t.id === 'birthDate') {
    if (!t.value) return;
    settings.birthDate = t.value;
  } else if (t.id === 'vacFrom') {
    const to = document.querySelector<HTMLInputElement>('#vacTo')!;
    to.min = t.value;
    return;
  } else if (t.id === 'birthStart' || t.id === 'extraStart' || t.id === 'parentalStart') {
    settings[t.id] = t.value;
  } else return;
  update();
}

function onClick(e: Event) {
  const t = e.target as HTMLElement;
  if (t.dataset.copy) {
    settings.extraPattern = [...settings.work] as WeekPattern;
    syncPattern('extraPattern');
  } else if (t.dataset.quick) {
    const n = Number(t.dataset.quick);
    settings.parentalPattern = settings.work.map((w) => Math.min(w, w > 0 ? n : 0)) as WeekPattern;
    syncPattern('parentalPattern');
  } else if (t.id === 'vacAdd') {
    const from = document.querySelector<HTMLInputElement>('#vacFrom')!;
    const to = document.querySelector<HTMLInputElement>('#vacTo')!;
    if (!from.value) {
      from.focus();
      return;
    }
    const [start, end] = [from.value, to.value || from.value].sort();
    settings.vacations = [...settings.vacations, { start, end }].sort((a, b) => a.start.localeCompare(b.start));
    from.value = to.value = '';
  } else if (t.dataset.removeVac) {
    settings.vacations = settings.vacations.filter((_, i) => i !== Number(t.dataset.removeVac));
  } else if (t.id === 'reset') {
    settings = defaultSettings(settings.birthDate);
    renderForm();
  } else return;
  update();
}

function syncPattern(key: 'work' | 'extraPattern' | 'parentalPattern') {
  document.querySelectorAll<HTMLInputElement>(`[data-pattern="${key}"] input`).forEach((el, i) => {
    el.value = String(settings[key][i]);
  });
}

// ---------- results ----------

function renderSummary(plan: Plan) {
  const birth = plan.birthDate;
  const done = plan.allDone;
  const problems = TYPES.flatMap((t) => plan.blocks[t].checks.filter((c) => !c.ok));
  const p = plan.blocks.parental;
  const reducedWeek = plan.weekHours - p.hoursPerWeek;
  const vacWorkdays = [...plan.vacationDays.values()].filter((v) => v > 0).length;

  return `
    <div class="hero">
      <div>
        <p class="eyebrow">Geboren op ${fmtLong(birth)}</p>
        <h1>${done ? `Alles opgenomen op <mark>${fmtShort(done)}</mark>` : 'Nog niets ingepland'}</h1>
        ${done ? `<p class="lead">Dat is ${weeks(diffDays(birth, done) + 1)} na de geboorte. Je eerste verjaardag samen: ${fmtShort(addMonths(birth, 12))}.</p>` : ''}
      </div>
      <div class="status ${problems.length ? 'bad' : 'good'}">
        ${problems.length ? `⚠︎ ${problems.length} aandachtspunt${problems.length > 1 ? 'en' : ''}` : '✓ Alles past binnen de regels'}
      </div>
    </div>

    <div class="stats">
      <div><b>${h(plan.weekHours)}</b><span>contract per week</span></div>
      <div><b>${h(TYPES.reduce((a, t) => a + plan.blocks[t].totalHours, 0))}</b><span>verlof in totaal</span></div>
      <div><b>${p.totalHours ? h(reducedWeek) : '—'}</b><span>werken per week tijdens ouderschapsverlof</span></div>
      <div><b>${p.days.length ? weeks(diffDays(p.start!, p.end!) + 1) : '—'}</b><span>duur ouderschapsverlof</span></div>
      <div><b>${plan.vacationHours ? h(plan.vacationHours) : '—'}</b><span>vakantie${vacWorkdays ? ` (${vacWorkdays} werkdag${vacWorkdays === 1 ? '' : 'en'})` : ''}</span></div>
    </div>

    <div class="cards">${TYPES.map((t) => card(plan.blocks[t])).join('')}</div>
  `;
}

function card(b: Block) {
  const pct = b.totalHours ? Math.min(100, (b.usedHours / b.totalHours) * 100) : 0;
  return `
    <article class="card" style="--c: var(--${b.type})">
      <header>
        <h3>${LABELS[b.type]}</h3>
        <p>${RULE[b.type]}</p>
      </header>
      ${
        b.totalHours === 0
          ? '<p class="muted">Niet ingepland.</p>'
          : `
      <div class="big">${h(b.totalHours)} <small>${b.days.length} dagen</small></div>
      <div class="meter"><span style="width:${pct}%"></span></div>
      <dl>
        <dt>Van</dt><dd>${b.start ? fmtLong(b.start) : '—'}</dd>
        <dt>Tot en met</dt><dd>${b.end ? fmtLong(b.end) : '—'}</dd>
        <dt>Uiterlijk</dt><dd>${fmtLong(b.deadline)}</dd>
        <dt>Per week</dt><dd>${h(b.hoursPerWeek)} verlof</dd>
      </dl>
      <ul class="checks">${b.checks.map((c) => `<li class="${c.ok ? 'ok' : 'bad'}">${esc(c.text)}</li>`).join('')}</ul>`
      }
      <footer>${PAY[b.type]}</footer>
    </article>`;
}

function renderTimeline(plan: Plan) {
  const birth = plan.birthDate;
  const end = addMonths(birth, 12);
  const span = Math.max(diffDays(birth, end), ...TYPES.map((t) => (plan.blocks[t].end ? diffDays(birth, plan.blocks[t].end!) + 1 : 0)));
  const pos = (d: ISODate) => (diffDays(birth, d) / span) * 100;

  const months: string[] = [];
  for (let m = 0; m <= 12; m++) {
    const d = addMonths(birth, m);
    if (diffDays(birth, d) > span) break;
    months.push(`<span style="left:${pos(d)}%">${m === 0 ? 'geboorte' : m === 12 ? '1 jaar' : `${m} mnd`}</span>`);
  }

  const rows = TYPES.filter((t) => plan.blocks[t].start).map((t) => {
    const b = plan.blocks[t];
    const left = pos(b.start!);
    const width = Math.max(0.6, pos(addDays(b.end!, 1)) - left);
    const late = b.end! > b.deadline;
    return `<div class="row" style="--c: var(--${t})">
      <div class="lane">
        <div class="deadline" style="left:${pos(addDays(b.deadline, 1))}%" title="Deadline ${fmtShort(b.deadline)}"></div>
        <div class="seg ${late ? 'late' : ''}" style="left:${left}%;width:${width}%" title="${LABELS[t]}: ${fmtShort(b.start!)} – ${fmtShort(b.end!)}"></div>
      </div>
      <span class="rowlabel">${LABELS[t]}</span>
    </div>`;
  });

  const vacs = settings.vacations.filter((v) => v.end >= birth && diffDays(birth, v.start) <= span);
  if (vacs.length) {
    rows.push(`<div class="row" style="--c: var(--vacation)">
      <div class="lane">
        ${vacs
          .map((v) => {
            const left = Math.max(0, pos(v.start));
            const width = Math.max(0.6, Math.min(100, pos(addDays(v.end, 1))) - left);
            return `<div class="seg" style="left:${left}%;width:${width}%" title="Vakantie: ${fmtShort(v.start)} – ${fmtShort(v.end)}"></div>`;
          })
          .join('')}
      </div>
      <span class="rowlabel">Vakantie</span>
    </div>`);
  }

  return `
    <section class="block">
      <h2>Tijdlijn eerste levensjaar</h2>
      <div class="timeline">
        <div class="axis">${months.join('')}</div>
        ${rows.join('') || '<p class="muted">Nog geen verlof ingepland.</p>'}
      </div>
      <p class="hint">Het streepje per rij is de deadline voor dat verlof.</p>
    </section>`;
}

function renderCalendar(plan: Plan) {
  const birth = plan.birthDate;
  const last = [addMonths(birth, 12), plan.allDone ?? birth].sort().at(-1)!;
  const deadlines = new Map(TYPES.filter((t) => plan.blocks[t].totalHours).map((t) => [plan.blocks[t].deadline, t]));
  const todayIso = format(new Date());

  const months: string[] = [];
  let cursor = `${birth.slice(0, 7)}-01`;
  while (cursor <= last) {
    const lead = weekday(cursor);
    const daysInMonth = new Date(Date.UTC(parse(cursor).getUTCFullYear(), parse(cursor).getUTCMonth() + 1, 0)).getUTCDate();
    const cells: string[] = Array.from({ length: lead }, () => '<div></div>');
    let monthHours = 0;

    for (let d = 0; d < daysInMonth; d++) {
      const date = addDays(cursor, d);
      const wd = weekday(date);
      const work = settings.work[wd];
      const entry = plan.byDate.get(date) ?? {};
      const types = TYPES.filter((t) => entry[t]);
      const hours = types.reduce((a, t) => a + entry[t]!, 0);
      monthHours += hours;
      const holiday = holidayName(date);
      const vacation = plan.vacationDays.get(date);
      const dl = deadlines.get(date);
      const cls = [
        'day',
        work === 0 ? 'off' : '',
        types[0] ? `t-${types[0]}` : '',
        vacation ? 't-vacation' : vacation === 0 ? 'vac-off' : '',
        holiday ? 'holiday' : '',
        date === birth ? 'birth' : '',
        date === todayIso ? 'today' : '',
        dl ? `dl dl-${dl}` : '',
        date < birth ? 'before' : '',
      ].filter(Boolean).join(' ');
      const tip = [
        fmtLong(date),
        date === birth ? 'Geboortedag 🎉' : '',
        holiday ?? '',
        vacation ? `Vakantie: ${h(vacation)}` : '',
        ...types.map((t) => `${LABELS[t]}: ${h(entry[t]!)}`),
        types.length && work ? `Werken: ${h(Math.max(0, work - hours))}` : '',
        dl ? `Deadline ${LABELS[dl].toLowerCase()}` : '',
      ].filter(Boolean).join('\n');
      const fill = vacation ? 1 : work ? Math.min(1, hours / work) : 0;
      cells.push(`<div class="${cls}" style="--fill:${fill}" title="${esc(tip)}"><span>${d + 1}</span></div>`);
    }

    months.push(`
      <div class="month">
        <h3>${fmtMonth(cursor)}${monthHours ? `<small>${h(monthHours)}</small>` : ''}</h3>
        <div class="grid">${DAYS.map((d) => `<b>${d[0]}</b>`).join('')}${cells.join('')}</div>
      </div>`);
    cursor = addMonths(cursor, 1);
  }

  return `
    <section class="block">
      <div class="block-head">
        <h2>Jaarkalender</h2>
        <div class="legend">
          ${TYPES.map((t) => `<span style="--c: var(--${t})"><i></i>${LABELS[t]}</span>`).join('')}
          <span style="--c: var(--vacation)"><i></i>Vakantie</span>
          <span class="lg-partial"><i></i>Deel van de dag</span>
          <span class="lg-dl"><i></i>Deadline</span>
        </div>
      </div>
      <div class="months">${months.join('')}</div>
    </section>`;
}

function update() {
  save();
  const plan = buildPlan(settings);
  document.querySelector('#workTotal')!.textContent = `${h(plan.weekHours)} per week`;
  document.querySelector('#extraTotal')!.textContent = `${h(Math.min(plan.weekHours, settings.extraPattern.reduce((a, b) => a + b, 0)))} per week`;
  document.querySelector('#parentalTotal')!.textContent = `${h(plan.blocks.parental.hoursPerWeek)} per week`;
  document.querySelector('#vacList')!.innerHTML = settings.vacations
    .map((v, i) => {
      let hours = 0;
      let workdays = 0;
      for (let d = v.start; d <= v.end; d = addDays(d, 1)) {
        const vh = plan.vacationDays.get(d) ?? 0;
        hours += vh;
        if (vh > 0) workdays++;
      }
      const range = v.start === v.end ? fmtLong(v.start) : `${fmtShort(v.start)} – ${fmtShort(v.end)}`;
      return `<li>
        <div><b>${range}</b><span>${workdays} werkdag${workdays === 1 ? '' : 'en'} · ${h(hours)}</span></div>
        <button type="button" data-remove-vac="${i}" aria-label="Verwijderen" title="Verwijderen">×</button>
      </li>`;
    })
    .join('');
  document.querySelector('#result')!.innerHTML = renderSummary(plan) + renderTimeline(plan) + renderCalendar(plan);
}

document.querySelector('#app')!.innerHTML = `
  <header class="top">
    <div class="brand"><span class="logo">◐</span> Verlofplanner <em>voor de partner</em></div>
    <div class="actions">
      <button type="button" class="ghost" onclick="window.print()">Afdrukken</button>
      <button type="button" class="primary" id="share">Deel link</button>
    </div>
  </header>
  <main class="layout">
    <aside id="form"></aside>
    <div id="result"></div>
  </main>
  <footer class="foot">
    Rekenhulp, geen juridisch advies. Check de actuele regels bij UWV en Rijksoverheid en stem je planning af met je werkgever.
  </footer>
`;
const formEl = document.querySelector<HTMLElement>('#form')!;
formEl.addEventListener('input', onInput);
formEl.addEventListener('click', onClick);
document.querySelector<HTMLButtonElement>('#share')!.addEventListener('click', (e) => share(e.currentTarget as HTMLButtonElement));
// Plak je een andere gedeelde link in hetzelfde tabblad, laad die planning dan.
window.addEventListener('hashchange', () => {
  const shared = decodeSettings(location.hash);
  if (!shared) return;
  settings = shared;
  renderForm();
  update();
});
renderForm();
update();
