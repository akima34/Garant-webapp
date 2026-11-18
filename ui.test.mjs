// Browser test of the whole user flow. Run: node tests/ui.test.mjs
// The backend and the map services are replaced by local fakes; the report itself
// is produced by the real server function code, so the screens show real report data.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'));
const SHOTS = process.env.SHOTS || path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });

/* ---- build real reports with the server function ---- */
const CITIES = read('fixtures_cities.json'), NOTICES = read('fixtures_notices.json'), PROJECTS = read('fixtures_projects.json');
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'https://p.supabase.co' }[k]) } };
const tmp = path.join(os.tmpdir(), 'garant-ui-' + process.pid + '.mjs');
fs.copyFileSync(path.join(root, 'supabase/functions/garant/index.ts'), tmp);
const fn = await import(pathToFileURL(tmp).href); fs.unlinkSync(tmp);
const LAT = 51.1731, LON = 71.4228;
const way = (id, tags, pts) => ({ type: 'way', id, tags, geometry: pts.map(([dn, de]) => ({ lat: LAT + dn / 111320, lon: LON + de / (111320 * Math.cos(LAT * Math.PI / 180)) })) });
let OSM = [];
const J = (b) => new Response(JSON.stringify(b), { status: 200 });
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.includes('nominatim')) return J({ display_name: '21, улица Кенесары, район Сарыарка, Астана, Казахстан', address: { road: 'улица Кенесары', house_number: '21', city: 'Астана' } });
  if (url.includes('interpreter')) return J({ osm3s: { timestamp_osm_base: '2026-11-10T00:00:00Z' }, elements: OSM });
  if (url.includes('cities')) return J(CITIES);
  if (url.includes('seizure_notices')) return J(NOTICES.filter((n) => n.city_code === 'astana'));
  if (url.includes('seizure_projects')) return J(PROJECTS.filter((n) => n.city_code === 'astana'));
  throw new Error('unexpected ' + url);
};
const req = new Request('https://x', { headers: { authorization: 'Bearer t', apikey: 'k' } });
const plotRow = { id: '11111111-1111-4111-8111-111111111111', title: 'улица Кенесары, 21', address: '21, улица Кенесары, Астана', city: 'Астана', region: '', kind: 'building', lat: LAT, lon: LON, area_m2: 412, cadastral_no: null, approx: false,
  geom: { type: 'Polygon', coordinates: [[[LON - 0.0002, LAT - 0.0001], [LON + 0.0002, LAT - 0.0001], [LON + 0.0002, LAT + 0.0001], [LON - 0.0002, LAT + 0.0001], [LON - 0.0002, LAT - 0.0001]]] } };
OSM = [way(1, { waterway: 'river', name: 'Есиль', 'name:en': 'Ishim' }, [[60, -400], [60, 400]]), way(2, { landuse: 'construction', name: 'ЖК Тест' }, [[200, 0], [200, 50], [250, 50], [250, 0], [200, 0]]), way(3, { highway: 'proposed', name: 'улица А56' }, [[-80, -300], [-80, 300]]), way(4, { power: 'line', voltage: '110000' }, [[-400, 90], [400, 90]])];
const reportHigh = await fn.buildReport(req, plotRow);
assert.equal(reportHigh.level, 'high');

/* ---- static server ---- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((q, s) => { const f = path.join(root, q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }); s.end(b); }); });
await new Promise((r) => server.listen(0, r));
const URL0 = `http://127.0.0.1:${server.address().port}/`;

/* ---- fake backend that runs inside the page ---- */
function mockApi(FIX) {
  const st = { user: null, profile: null, saved: {}, reports: {}, chat: {}, notifs: [], n: 0 };
  const wait = (v, ms = 30) => new Promise((r) => setTimeout(() => r(v), ms));
  window.GARANT_API = {
    session: () => wait(st.user), onAuth() {},
    signIn: (email, pw) => wait(pw === 'password123' ? ((st.user = { id: 'u1', email }), (st.profile = st.profile || { full_name: 'Example User', lang: 'en', notify_risk: true, notify_docs: true, notify_digest: false }), { error: null, user: st.user }) : { error: 'invalid' }),
    signUp: (name, email) => wait(((st.user = { id: 'u1', email }), (st.profile = { full_name: name, lang: 'en', notify_risk: true, notify_docs: true, notify_digest: false }), { error: null, user: st.user, needsConfirm: false })),
    signOut: () => wait((st.user = null)), resetPassword: () => wait(), setPassword: () => wait({ error: null }),
    profile: () => wait(st.profile), updateProfile: (p) => wait(Object.assign(st.profile, p)),
    cadastral: (no) => wait(no === '21-320-112-426' ? [FIX.notice] : []),
    check: (b) => wait((() => { if (!st.user) return { ok: false, error: 'not_signed_in' }; const id = 'aaaaaaaa-aaaa-4aaa-8aaa-00000000000' + (++st.n); const plot = { ...FIX.plot, ...(b.plot || {}), id: FIX.plot.id }; const report = { id, plot_id: plot.id, level: FIX.report.level, data: FIX.report, ai_summary: null, created_at: '2026-11-11T08:00:00Z', plot }; st.reports[id] = report; return { ok: true, plot, report, cached: false }; })(), 120),
    getReport: (id) => wait(st.reports[id] || null), history: () => wait(Object.values(st.reports).map((r) => ({ id: r.id, level: r.level, created_at: r.created_at }))),
    isSaved: (pid) => wait(st.saved[pid] ? { plot_id: pid, has_changes: false } : null), save: (pid) => wait((st.saved[pid] = true)), unsave: (pid) => wait((delete st.saved[pid], true)), clearChanges: () => wait(),
    myPlots: () => wait(Object.keys(st.saved).map((pid) => { const r = Object.values(st.reports).slice(-1)[0]; return { plot_id: pid, title: FIX.plot.title, address: '', city: 'Астана', kind: 'building', area_m2: 412, cadastral_no: null, has_changes: true, saved_at: '2026-11-11', report_id: r.id, level: r.level, checked_at: r.created_at }; })),
    notifications: () => wait(st.notifs), unread: () => wait(st.notifs.filter((n) => !n.read_at).length), markRead: (id) => wait(st.notifs.forEach((n) => { if (n.id === id) n.read_at = 'x'; })),
    chat: (rid) => wait(st.chat[rid] || []),
    ask: (rid, q) => wait((() => { if (/limit/i.test(q)) return { ok: false, error: 'ai_limit' }; const a = { role: 'assistant', content: 'Этот адрес есть в списке изъятия для госнужд. <b>Не покупайте</b> без юриста.', sources: ['Land Code of Kazakhstan', 'bes.media, 27.08.2026 (по газете «Вечерняя Астана»)'] }; (st.chat[rid] = st.chat[rid] || []).push({ role: 'user', content: q }, a); return { ok: true, answer: a.content, sources: a.sources }; })(), 150),
    summary: () => wait({ ok: true, bullets: ['Адрес включён в список изъятия.', 'Красные линии не проверены.', 'Покажите отчёт юристу.'] }, 60)
  };
  window.__st = st;
  st.notifs = [{ id: 1, kind: 'level_changed', params: { from: 'mid', to: 'high', plot_title: FIX.plot.title }, report_id: null, read_at: null, created_at: '2026-11-11T08:00:00Z' }, { id: 2, kind: 'new_risk', params: { code: 'seizure_exact', level: 'high', title_ru: 'Реновация', title_en: 'Renovation', plot_title: FIX.plot.title }, report_id: null, read_at: 'x', created_at: '2026-11-10T08:00:00Z' }];
}
const FIX = { report: reportHigh, plot: plotRow, notice: { ...NOTICES.find((n) => n.cadastral_no === '21-320-112-426') } };
const NOMINATIM_ROWS = [
  { lat: String(LAT), lon: String(LON), category: 'building', type: 'yes', addresstype: 'building', name: '', display_name: '21, улица Кенесары, район Сарыарка, Астана, Казахстан', address: { house_number: '21', road: 'улица Кенесары', city_district: 'район Сарыарка', city: 'Астана' }, boundingbox: [String(LAT - 0.0001), String(LAT + 0.0001), String(LON - 0.0002), String(LON + 0.0002)], geojson: plotRow.geom },
  { lat: '51.1700', lon: '71.4300', category: 'highway', type: 'residential', name: 'улица Кенесары', display_name: 'улица Кенесары, Астана, Казахстан', address: { road: 'улица Кенесары', city: 'Астана' }, boundingbox: ['51.16', '51.18', '71.40', '71.45'], geojson: { type: 'LineString', coordinates: [] } },
  { lat: '55.75', lon: '37.6', category: 'place', type: 'city', name: 'Outside', display_name: 'Outside KZ', address: {}, boundingbox: ['1', '2', '3', '4'] }
];

const browser = await chromium.launch();
const problems = [];
async function run(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${name}: pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`${name}: console ${m.text()}`); });
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(URL0)) return r.continue(); if (u.includes('nominatim.openstreetmap.org/search')) return r.fulfill({ json: /zzz/.test(u) ? [] : NOMINATIM_ROWS }); if (u.includes('nominatim.openstreetmap.org/reverse')) return r.fulfill({ json: NOMINATIM_ROWS[0] }); return r.abort(); });
  await page.addInitScript(mockApi, FIX);
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${name}-${n}.png`), fullPage: true });
  const noOverflow = async (where) => { const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(w <= 1, `${name}: horizontal overflow on ${where}: ${w}px`); };
  const text = () => page.locator('#app').innerText();

  await page.goto(URL0); await page.waitForSelector('.hero'); await noOverflow('home'); await shot('1-home');
  await page.fill('#homeQ', 'Кенесары 21'); await page.click('.hero button[type=submit]');
  await page.waitForSelector('.result'); assert.equal(await page.locator('.result').count(), 2, 'result outside Kazakhstan is dropped');
  assert.match(await text(), /2 found for “Кенесары 21”/); await noOverflow('search'); await shot('2-search');
  await page.click('.chip[data-filter="area"]'); assert.equal(await page.locator('.result').count(), 1);
  await page.click('.chip[data-filter="all"]'); await page.click('.result >> nth=0');
  await page.waitForSelector('.lockcard'); assert.match(await text(), /улица Кенесары, 21/); assert.match(await text(), /622 m²/); await noOverflow('preview'); await shot('3-preview');
  await page.click('text=Sign in to open report'); await page.waitForSelector('.signin');
  assert.match(await text(), /Report: улица Кенесары, 21/); await shot('4-signin');
  await page.click('.signin button[type=submit]'); assert.match(await text(), /Enter a valid email address/);
  await page.fill('.signin [name=email]', 'example@email.com'); await page.fill('.signin [name=password]', 'short'); await page.click('.signin button[type=submit]'); assert.match(await text(), /at least 8 characters/);
  assert.equal(await page.inputValue('.signin [name=email]'), 'example@email.com', 'email survives a validation error');
  await page.fill('.signin [name=password]', 'wrongpassword'); await page.click('.signin button[type=submit]'); await page.waitForSelector('.err'); assert.match(await text(), /Wrong email or password/);
  await page.fill('.signin [name=password]', 'password123'); await page.click('.signin button[type=submit]');
  await page.waitForSelector('.verdict'); const rep = await text();
  for (const s of ['High risk', 'Address is on a seizure list', 'Housing renovation in Saryarka', 'Planned road nearby', 'Water nearby', 'High-voltage power line nearby', 'Construction nearby', 'Red lines and flood zones are not checked', 'Live data', mobile ? 'EU' : 'Example User']) assert.ok(rep.includes(s), `${name}: report shows "${s}"`);
  assert.match(page.url(), /#\/report\/aaaaaaaa/); await noOverflow('report'); await shot('5-report');
  await page.click('[data-tab=projects]'); assert.match(await text(), /Street A56/); await shot('5b-projects');
  await page.click('[data-tab=docs]'); assert.ok((await page.locator('a.doc').count()) >= 2); assert.ok((await page.locator('a.doc').first().getAttribute('href')).startsWith('https://'));
  await page.click('[data-tab=changes]'); assert.match(await text(), /First check/); await noOverflow('report tabs');
  await page.click('.ai-cta'); await page.waitForSelector('.ai-sum li'); assert.match(await text(), /Адрес включён в список изъятия/);
  await page.click('.sugg button >> nth=0'); await page.waitForSelector('.msg.ai .src'); const chat = await text();
  assert.ok(chat.includes('Is it safe to buy this plot?') && chat.includes('<b>Не покупайте</b>'), 'AI text is shown as text, not HTML');
  await page.fill('.composer input', 'limit please'); await page.press('.composer input', 'Enter'); await page.waitForSelector('.toast.show'); assert.match(await page.locator('.toast').innerText(), /20 questions/);
  assert.equal(await page.locator('.msg.user').count(), 1, 'failed question is removed'); await noOverflow('ai'); await shot('6-ai');
  await page.click('[data-act=watch] >> nth=0'); await page.waitForSelector('.plot'); assert.match(await text(), /You’re watching 1 plot\./); assert.match(await text(), /New changes/); await noOverflow('plots'); await shot('7-plots');
  await page.click('[data-act="theme"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(14, 24, 19)');
  await page.waitForTimeout(500); await shot('7b-dark');
  await page.click('[data-act="theme"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.click('.icon-btn[data-href="#/notifications"]'); await page.waitForSelector('.nitem'); assert.match(await text(), /1 unread/); assert.match(await text(), /medium → high/);
  await page.click('[data-tg=notify_digest]'); assert.equal(await page.evaluate(() => window.__st.profile.notify_digest), true);
  await page.click('.nitem >> nth=0'); await page.waitForFunction(() => /0 unread/.test(document.body.innerText)); await noOverflow('notifications'); await shot('8-notifications');
  await page.click('[data-lang=ru]'); assert.match(await text(), /Уведомления/); assert.match(await text(), /средний → высокий/);
  await page.click('.avatar'); await page.waitForSelector('.menu'); await page.click('[data-act=signout]'); await page.waitForSelector('.hero');
  assert.equal(await page.locator('.avatar').count(), 0, 'signed out');
  await page.reload(); await page.waitForSelector('.hero');
  assert.match(await text(), /Проверьте участок до покупки/, 'language choice is remembered');
  await page.goto(URL0 + '#/plots'); await page.waitForSelector('.signin'); assert.match(await text(), /Вход в Garant/, 'private page asks to sign in');
  await page.goto(URL0 + '#/search?q=21-320-112-426'); await page.waitForSelector('.result'); assert.match(await text(), /Черёмушки/);
  await page.goto(URL0 + '#/search?q=zzz'); await page.waitForSelector('.empty'); assert.match(await text(), /Ничего не найдено/);
  await page.goto(URL0 + '#/privacy'); await page.waitForSelector('.setup'); await noOverflow('privacy');
  await ctx.close(); console.log('ok  ' + name);
}
try {
  await run('desktop', { width: 1440, height: 900 }, false);
  await run('laptop', { width: 1024, height: 768 }, false);
  await run('mobile', { width: 390, height: 844 }, true);
  assert.deepEqual(problems, []);
  console.log('\nUI flow passed on 3 screen sizes; screenshots in ' + SHOTS);
} finally { await browser.close(); server.close(); }
