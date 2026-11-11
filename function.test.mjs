// Automated tests for the Garant server function. Run: node tests/function.test.mjs
// External services (Supabase, OpenStreetMap, the AI provider) are replaced by local fakes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'));
const CITIES = read('fixtures_cities.json'), NOTICES = read('fixtures_notices.json'), PROJECTS = read('fixtures_projects.json');

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', GROQ_API_KEY: 'k' };
globalThis.Deno = { env: { get: (k) => ENV[k] } };
const tmp = path.join(os.tmpdir(), 'garant-fn-' + process.pid + '.mjs');
fs.copyFileSync(path.join(here, '../supabase/functions/garant/index.ts'), tmp);
const fn = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

/* ---------- fake world ---------- */
const world = { reverse: null, osm: [], osmFail: false, llm: null, llmStatus: 200, models404: false, state: null };
const reset = () => { world.state = { plots: [], reports: [], saved: [], notifications: [], ai: [], seq: 1 }; world.osmFail = false; world.llmStatus = 200; world.models404 = false; };
const uuid = () => `00000000-0000-4000-8000-${String(world.state.seq++).padStart(12, '0')}`;
const R = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); const st = world.state; const method = opts.method || 'GET';
  const body = opts.body && !String(opts.body).startsWith('data=') ? JSON.parse(opts.body) : null;
  if (url.includes('/auth/v1/user')) return opts.headers.Authorization === 'Bearer good' ? R({ id: 'u1', email: 'a@b.kz' }) : R({ msg: 'no' }, 401);
  if (url.includes('nominatim.openstreetmap.org/reverse')) return world.reverse ? R(world.reverse) : R({ error: 'x' }, 500);
  if (url.includes('/api/interpreter')) return world.osmFail ? R('busy', 504) : R({ osm3s: { timestamp_osm_base: '2026-11-10T00:00:00Z' }, elements: world.osm });
  if (url.includes('/chat/completions')) {
    if (world.models404 && body.model === 'llama-3.3-70b-versatile') return R({ error: 'model_not_found' }, 404);
    if (world.llmStatus !== 200) return R({}, world.llmStatus);
    world.lastLlm = body;
    return R({ choices: [{ message: { content: typeof world.llm === 'string' ? world.llm : JSON.stringify(world.llm) } }] });
  }
  if (url.endsWith('/models')) return R({ data: [{ id: 'whisper-large' }, { id: 'llama-4-70b-new' }] });
  const m = url.match(/\/rest\/v1\/([a-z_]+)\??(.*)$/);
  if (!m) throw new Error('unexpected fetch ' + url);
  const [, table, qs] = m; const q = new URLSearchParams(qs);
  if (table === 'cities') return R(CITIES);
  if (table === 'profiles') return R([world.profile || { notify_risk: true, notify_docs: true, notify_digest: true }]);
  if (table === 'seizure_notices') return R(NOTICES.filter((n) => 'eq.' + n.city_code === q.get('city_code')));
  if (table === 'seizure_projects') return R(PROJECTS.filter((n) => 'eq.' + n.city_code === q.get('city_code')));
  if (table === 'plots') {
    if (method === 'POST') { const row = { id: uuid(), user_id: 'u1', created_at: new Date().toISOString(), ...body }; st.plots.push(row); return R([row], 201); }
    if (q.get('id')) return R(st.plots.filter((p) => 'eq.' + p.id === q.get('id')));
    const lats = q.getAll('lat').map((x) => +x.split('.').slice(1).join('.'));
    return R(st.plots.filter((p) => p.lat >= lats[0] && p.lat <= lats[1]));
  }
  if (table === 'reports') {
    if (method === 'POST') { const row = { id: uuid(), user_id: 'u1', created_at: new Date(Date.now() + st.reports.length).toISOString(), ai_summary: null, ...body }; st.reports.push(row); return R([row], 201); }
    if (method === 'PATCH') { const r = st.reports.find((x) => 'eq.' + x.id === q.get('id')); Object.assign(r, body); return R('', 204); }
    if (q.get('id')) return R(st.reports.filter((r) => 'eq.' + r.id === q.get('id')).map((r) => ({ ...r, plot: st.plots.find((p) => p.id === r.plot_id) })));
    return R(st.reports.filter((r) => 'eq.' + r.plot_id === q.get('plot_id')).slice(-1));
  }
  if (table === 'saved_plots') { if (method === 'PATCH') { st.saved.forEach((s) => Object.assign(s, body)); return R('', 204); } return R(st.saved); }
  if (table === 'notifications') { st.notifications.push(...body); return R('', 201); }
  if (table === 'ai_messages') {
    if (method === 'POST') { const keys = body.map((b) => Object.keys(b).sort().join()); assert.equal(new Set(keys).size, 1, 'bulk insert rows must share keys'); st.ai.push(...body); return R('', 201); }
    if (q.get('role')) return R(st.ai.filter((a) => a.role === 'user').map(() => ({ id: 1 })));
    return R(st.ai.slice(-6).reverse());
  }
  throw new Error('unexpected table ' + table);
};
const call = async (body, auth = 'Bearer good') => (await fn.handler(new Request('https://x/functions/v1/garant', { method: 'POST', headers: { authorization: auth, apikey: 'anon', 'content-type': 'application/json' }, body: JSON.stringify(body) }))).json();
const rev = (road, house, display) => ({ display_name: display || `${house ? house + ', ' : ''}${road}, Астана, Казахстан`, address: { road, house_number: house, city: 'Астана' } });
const addrOf = (r, cad = '') => ({ cadastral: cad, house: fn.normHouse(r.address.house_number || ''), roadWords: fn.words(r.address.road), allWords: fn.words(r.display_name) });
const astana = NOTICES.filter((n) => n.city_code === 'astana'), almaty = NOTICES.filter((n) => n.city_code === 'almaty');
const best = (list, a) => { const m = fn.matchRegistry(list, a); return m.length ? m[0].best + ':' + m[0].project.id : 'none'; };

let n = 0; const t = async (name, f) => { reset(); await f(); n++; console.log('ok  ' + name); };

/* ---------- registry matching on real registry rows ---------- */
await t('exact: Kazakh spelling in the decree vs Russian street name on the map', () => {
  assert.equal(best(astana, addrOf(rev('улица Мухамеджана Тынышпаева', '11'))), 'exact:ast-2026-10-02-skver');
  assert.equal(best(astana, addrOf(rev('улица Нажимеденова', '31/2'))), 'exact:ast-2026-10-02-skver');
  assert.equal(best(astana, addrOf(rev('улица Кенесары', '21'))), 'exact:ast-2026-08-27-renovation');
  assert.equal(best(astana, addrOf(rev('улица Алии Молдагуловой', '24'))), 'exact:ast-2026-08-27-renovation');
});
await t('street: same street, another house', () => {
  assert.equal(best(astana, addrOf(rev('улица Кенесары', '40'))), 'street:ast-2026-08-27-renovation');
});
await t('no match for an unrelated address', () => {
  assert.equal(best(astana, addrOf(rev('улица Достык', '5'))), 'none');
  assert.equal(best(astana, addrOf(rev('проспект Мангилик Ел', '55'))), 'none');
});
await t('garden societies: generic street names match only inside the named society', () => {
  const inside = rev('Центральная улица', '76', '76, Центральная улица, садоводческое товарищество Журавушка, Астана');
  assert.equal(best(astana, addrOf(inside)), 'exact:ast-2026-10-19-a56');
  const other = rev('Лесная улица', '5', '5, Лесная улица, СТ Журавушка, Астана');
  assert.equal(best(astana, addrOf(other)).split(':')[0], 'locality');
  assert.equal(best(astana, addrOf(rev('Центральная улица', '76', '76, Центральная улица, Косшы'))), 'none');
});
await t('cadastral number match wins', () => {
  assert.equal(best(astana, addrOf(rev('улица Достык', '5'), '21-320-112-426')), 'cadastral:ast-2026-09-02-kns52');
});
await t('Almaty: microdistrict + street + house', () => {
  const r = rev('улица Смайылова', '56', '56, улица Смайылова, микрорайон Достык, Наурызбайский район, Алматы');
  assert.equal(best(almaty, addrOf(r)), 'exact:alm-2026-10-21-zhubanov');
  assert.equal(best(almaty, addrOf(rev('проспект Абая', '10', '10, проспект Абая, Алматы'))), 'none');
});

/* ---------- full check ---------- */
const LAT = 51.1600, LON = 71.4300;
const way = (id, tags, pts) => ({ type: 'way', id, tags, geometry: pts.map(([dn, de]) => ({ lat: LAT + dn / 111320, lon: LON + de / (111320 * Math.cos(LAT * Math.PI / 180)) })) });
const plotBody = { action: 'check', plot: { title: 'ул. Кенесары, 21', lat: LAT, lon: LON, city: 'Астана' } };

await t('check: rejects anonymous callers and bad input', async () => {
  assert.equal((await call(plotBody, 'Bearer anon-key')).error, 'not_signed_in');
  assert.equal((await call({ action: 'check', plot: { title: 'Moscow', lat: 55.75, lon: 37.6 } })).error, 'bad_plot');
  assert.equal((await call({ action: 'nope' })).error, 'unknown_action');
});
await t('check: live map objects + registry produce the right levels and distances', async () => {
  world.reverse = rev('улица Кенесары', '21');
  world.osm = [
    way(1, { waterway: 'river', name: 'Есиль', 'name:en': 'Ishim' }, [[30, -400], [30, 400]]),
    way(2, { landuse: 'construction', name: 'ЖК Тест' }, [[200, 0], [200, 50], [250, 50], [250, 0], [200, 0]]),
    way(3, { power: 'line', voltage: '110000' }, [[-400, 20], [400, 20]]),
    way(4, { highway: 'residential' }, [[5, -10], [5, 10]]),
    way(5, { natural: 'water', water: 'fountain' }, [[1, 1], [1, 2], [2, 2], [1, 1]]),
    way(6, { highway: 'primary', name: 'проспект' }, [[-600, -900], [-600, 900]]),
  ];
  const res = await call(plotBody);
  assert.equal(res.ok, true);
  const d = res.report.data, by = Object.fromEntries(d.items.map((i) => [i.code, i]));
  assert.equal(d.level, 'high'); assert.equal(by.seizure_exact.level, 'high');
  assert.equal(by.seizure_exact.params.project.id, 'ast-2026-08-27-renovation');
  assert.equal(by.water.level, 'mid'); assert.ok(Math.abs(by.water.params.distance - 30) <= 1);
  assert.equal(by.construction.level, 'low'); assert.ok(Math.abs(by.construction.params.distance - 200) <= 1);
  assert.equal(by.power_line.level, 'mid'); assert.ok(Math.abs(by.power_line.params.distance - 20) <= 1);
  assert.ok(!by.major_road, 'road 600 m away is outside the radius');
  assert.deepEqual(d.counts, { high: 1, mid: 2, low: 1 });
  assert.ok(d.ok.some((o) => o.code === 'no_official_layers'));
  assert.ok(d.projects.some((p) => p.kind === 'seizure' && p.matched) && d.projects.some((p) => p.kind === 'construction'));
  assert.ok(d.documents.length >= 2 && d.features.features.length === 3);
  assert.equal(world.state.plots.length, 1);
});
await t('check: a plot inside a polygon gets distance 0; clean plot is low with honest notes', async () => {
  world.reverse = rev('улица Достык', '5');
  world.osm = [way(1, { landuse: 'industrial' }, [[-100, -100], [-100, 100], [100, 100], [100, -100], [-100, -100]])];
  let d = (await call(plotBody)).report.data;
  assert.equal(d.items[0].code, 'industrial'); assert.equal(d.items[0].params.distance, 0);
  reset(); world.osm = [];
  d = (await call(plotBody)).report.data;
  assert.equal(d.level, 'low'); assert.equal(d.items.length, 0); assert.equal(d.headline, 'clean');
  assert.deepEqual(d.ok.map((o) => o.code), ['no_water', 'no_construction', 'no_seizure', 'no_official_layers']);
});
await t('check: city without a registry and map outage are reported, not hidden', async () => {
  world.reverse = rev('улица Абая', '1', '1, улица Абая, Караганда'); world.osmFail = true;
  const d = (await call({ action: 'check', plot: { title: 'Karaganda', lat: 49.80, lon: 73.10 } })).report.data;
  assert.equal(d.osm.ok, false);
  assert.ok(d.ok.some((o) => o.code === 'osm_unavailable') && d.ok.some((o) => o.code === 'no_registry'));
  assert.ok(!d.items.some((i) => i.code.startsWith('seizure')), 'Astana rows must not leak into Karaganda');
});
await t('check: when the address lookup fails the report says the lists were not compared', async () => {
  world.reverse = null; world.osm = [];
  const d = (await call(plotBody)).report.data;
  assert.ok(d.ok.some((o) => o.code === 'address_unknown' && o.warn) && !d.ok.some((o) => o.code === 'no_seizure'));
});
await t('check: repeat click reuses the fresh report; forced re-check notifies about changes for saved plots', async () => {
  world.reverse = rev('улица Достык', '5'); world.osm = [];
  const first = await call(plotBody);
  const again = await call(plotBody);
  assert.equal(again.cached, true); assert.equal(again.report.id, first.report.id); assert.equal(world.state.plots.length, 1);
  world.state.saved.push({ plot_id: first.plot.id, has_changes: false });
  world.osm = [way(2, { building: 'construction' }, [[10, 0], [10, 10], [20, 10], [10, 0]])];
  const forced = await call({ action: 'check', plot_id: first.plot.id, force: true });
  assert.equal(forced.cached, false); assert.equal(forced.report.data.level, 'mid');
  assert.deepEqual(world.state.notifications.map((x) => x.kind), ['level_changed', 'new_risk']);
  assert.equal(world.state.saved[0].has_changes, true);
  world.profile = { notify_risk: false, notify_docs: false, notify_digest: true }; world.state.notifications = []; world.osm = [];
  await call({ action: 'check', plot_id: first.plot.id, force: true });
  assert.deepEqual(world.state.notifications.map((x) => x.kind), ['risk_gone'], 'switched-off kinds are not recorded');
  world.profile = null;
});

/* ---------- AI ---------- */
await t('ask: answers from the report, keeps only allowed sources, stores the chat', async () => {
  world.reverse = rev('улица Кенесары', '21'); world.osm = [];
  const rep = (await call(plotBody)).report;
  world.llm = { answer: 'Адрес есть в списке изъятия.', sources: ['bes.media, 27.08.2026 (по газете «Вечерняя Астана»)', 'Made up source'] };
  const res = await call({ action: 'ask', report_id: rep.id, question: 'Можно покупать?', lang: 'ru' });
  assert.equal(res.ok, true); assert.equal(res.answer, 'Адрес есть в списке изъятия.');
  assert.deepEqual(res.sources, ['bes.media, 27.08.2026 (по газете «Вечерняя Астана»)']);
  assert.equal(world.state.ai.length, 2);
  const sys = world.lastLlm.messages[0].content;
  assert.ok(sys.includes('Housing renovation in Saryarka') && sys.includes('Reply in Russian') && sys.includes('NOT checked'));
});
await t('ask: plain-text model output still works; retired model falls back to a current one', async () => {
  world.reverse = rev('улица Достык', '5'); world.osm = [];
  const rep = (await call(plotBody)).report;
  world.llm = 'Just text'; world.models404 = true;
  const res = await call({ action: 'ask', report_id: rep.id, question: 'Is it safe?' });
  assert.equal(res.answer, 'Just text'); assert.equal(world.lastLlm.model, 'llama-4-70b-new');
});
await t('ask: daily limit, provider overload and missing key give clear errors', async () => {
  world.reverse = rev('улица Достык', '5'); world.osm = [];
  const rep = (await call(plotBody)).report;
  world.llmStatus = 429;
  assert.equal((await call({ action: 'ask', report_id: rep.id, question: 'Hello?' })).error, 'ai_busy');
  world.llmStatus = 200; world.state.ai = Array.from({ length: 20 }, () => ({ role: 'user' }));
  assert.equal((await call({ action: 'ask', report_id: rep.id, question: 'Hello?' })).error, 'ai_limit');
  world.state.ai = []; delete ENV.GROQ_API_KEY;
  assert.equal((await call({ action: 'ask', report_id: rep.id, question: 'Hello?' })).error, 'ai_not_configured');
  ENV.GROQ_API_KEY = 'k';
  assert.equal((await call({ action: 'ask', report_id: '00000000-0000-4000-8000-999999999999', question: 'Hello?' })).error, 'report_not_found');
});
await t('summary: three bullets, cached per language', async () => {
  world.reverse = rev('улица Достык', '5'); world.osm = [];
  const rep = (await call(plotBody)).report;
  world.llm = { bullets: ['a', 'b', 'c', 'd'] };
  const one = await call({ action: 'summary', report_id: rep.id, lang: 'en' });
  assert.deepEqual(one.bullets, ['a', 'b', 'c']); assert.equal(one.cached, false);
  world.llm = { bullets: ['x'] };
  assert.equal((await call({ action: 'summary', report_id: rep.id, lang: 'en' })).cached, true);
  assert.deepEqual((await call({ action: 'summary', report_id: rep.id, lang: 'ru' })).bullets, ['x']);
});
console.log(`\n${n} tests passed`);
