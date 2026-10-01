// Uji backend/Code.gs di Node (vm) dengan mock SpreadsheetApp/UrlFetchApp/PropertiesService/CacheService/ContentService/LockService.
// Jalankan: TZ=Asia/Jakarta node tests/backend.test.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const pad = n => String(n).padStart(2, '0');
const code = fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'backend', 'appsscript.json'), 'utf8'));
assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING'); assert.equal(manifest.webapp.access, 'ANYONE');
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
assert(!/sk-ant-/.test(code), 'tidak boleh ada kunci di kode');

const HB = ['ID Biji','Nama Biji / Lot','Roastery','Negara','Region / Terroir','Farm / Produsen','Ketinggian (mdpl)','Spesies','Varietas','Proses Pasca Panen','Profil Roasting','Tanggal Roasting','Tanggal Beli','Berat (g)','Harga','Catatan Roastery (flavor notes)','Catatan Pribadi'];
const HS = ['ID Seduhan','Tanggal Seduh','ID Biji','Hari Sejak Roasting','Dripper','Kertas Filter','Merek Air','Suhu Air (C)','Dosis Kopi (g)','Air Total (g)','Rasio','Grinder','Setting Grind','Pouring Interval (detik per langkah)','Total Brew Time','Aroma (1-5)','Flavor (1-5)','Aftertaste (1-5)','Acidity (1-5)','Sweetness (1-5)','Body (1-5)','Balance (1-5)','Deskriptor Rasa / Notes','Skor Keseluruhan (1-10)','Catatan Pribadi','Tweak Berikutnya'];
const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function fmtDate(d, f) {
  const y = d.getFullYear(), m = pad(d.getMonth() + 1), dd = pad(d.getDate());
  if (f === 'HH:mm:ss') return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if (f === 'yyyy-MM-dd') return `${y}-${m}-${dd}`;
  return `${y}-${m}-${dd}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+07:00`;
}
function mkSheet(name, header, rows) {
  const sh = { name, formats: {}, grid: [header].concat(rows.map(r => r.slice())) };
  const disp = v => v instanceof Date ? fmtDate(v, 'yyyy-MM-dd') : String(v);
  sh.getName = () => name;
  sh.getLastRow = () => sh.grid.length;
  sh.getLastColumn = () => header.length;
  sh.getRange = (r, c, nr, nc) => ({
    getValues: () => { const o = []; for (let i = 0; i < (nr || 1); i++) { const row = []; for (let j = 0; j < (nc || 1); j++) { const v = (sh.grid[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
    getDisplayValues: () => { const o = []; for (let i = 0; i < (nr || 1); i++) { const row = []; for (let j = 0; j < (nc || 1); j++) { const v = (sh.grid[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : disp(v)); } o.push(row); } return o; },
    setNumberFormat: f => { sh.formats[r + ',' + c] = f; },
    setValues: vals => { vals.forEach((vr, i) => vr.forEach((v, j) => { (sh.grid[r - 1 + i] = sh.grid[r - 1 + i] || [])[c - 1 + j] = v; })); }
  });
  return sh;
}
const T = (d, ...a) => d; // helper
function seedBiji() { return [
  ['B01','Guji Uraga Natural','Roastery A','Ethiopia','Guji','Smallholders',2100,'Arabica','Heirloom','Natural','Light',D('2026-09-10'),D('2026-09-14'),200,185000,'Blueberry','x'],
  ['B02','Kerinci Honey','Roastery B','Indonesia','Kerinci','KT',1400,'Arabica','Sigarar','Red Honey','Medium-light',D('2026-09-18'),D('2026-09-22'),200,120000,'Brown sugar','y']]; }
function seedSeduhan() { return [
  ['S01',D('2026-09-20'),'B01',10,'Hario V60 02','Hario','Aqua',93,15,240,'1:16','Comandante','24 klik','45s bloom','2:45',4,4,4,4,4,3,4,'Blueberry',8,'Enak','Halus 2 klik'],
  ['S02',D('2026-09-25'),'B01','',  'Hario V60 02','Hario','Aqua',93,15,240,'','Comandante','22 klik','45s bloom','3:05',4,5,4,4,5,4,5,'Blueberry matang',9,'Terbaik','Pertahankan'],
  ['S03',D('2026-09-26'),'B02',8,'Kalita Wave 185','Kalita','Le Minerale',92,16,256,'1:16','Comandante','26 klik','40s bloom','3:10',3,4,3,3,4,4,4,'Gula merah',7,'Flat','Suhu naik']]; }

function makeEnv(opts = {}) {
  const env = { props: Object.assign({ ANTHROPIC_API_KEY: 'sk-test-KEY', APP_PIN: '1234' }, opts.props), cache: {}, fetches: [], sleeps: 0, fetchQueue: (opts.fetchQueue || []).slice(), logs: [] };
  env.biji = mkSheet('Biji', HB, seedBiji()); env.seduhan = mkSheet('Seduhan', HS, seedSeduhan());
  const sheets = { Biji: env.biji, Seduhan: env.seduhan };
  const ss = { getSheetByName: n => sheets[n] || null, getSheets: () => Object.values(sheets), getSpreadsheetTimeZone: () => 'Asia/Jakarta', getName: () => 'Jurnal Kopi' };
  const ctx = {
    Utilities: { formatDate: (d, tz, f) => fmtDate(d, f), sleep: () => { env.sleeps++; } },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
    Logger: { log: m => env.logs.push(m) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in env.props ? env.props[k] : null) }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in env.cache ? env.cache[k] : null), put: (k, v) => { env.cache[k] = String(v); }, remove: k => { delete env.cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: t => ({ text: t, mime: null, setMimeType(m) { this.mime = m; return this; }, getContent() { return this.text; } }) },
    UrlFetchApp: { fetch: (url, o) => {
      env.fetches.push({ url, o, body: JSON.parse(o.payload) });
      const next = env.fetchQueue.shift();
      if (!next) throw new Error('tidak ada respons mock');
      if (next instanceof Error) throw next;
      return { getResponseCode: () => next.code, getContentText: () => typeof next.body === 'string' ? next.body : JSON.stringify(next.body) };
    } },
    Date, Object, String, Number, isFinite, isNaN, parseFloat, parseInt, Math, JSON, Array, RegExp, Error
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  env.ctx = ctx;
  env.post = (obj, raw) => JSON.parse(ctx.doPost({ postData: { contents: raw !== undefined ? raw : JSON.stringify(obj) } }).getContent());
  env.get = q => JSON.parse(ctx.doGet({ parameter: q }).getContent());
  return env;
}
const toolUse = input => ({ code: 200, body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'catat_seduhan', input }] } });
const textResp = t => ({ code: 200, body: { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: t }] } });
let n = 0; const ok = m => { n++; };

// --- konstanta model ---
{ const e = makeEnv(); assert.equal(e.ctx.MODEL_PARSE, 'claude-haiku-4-5'); assert.equal(e.ctx.MODEL_ANALYZE, 'claude-sonnet-5-5'); ok(); }

// --- GET data: bentuk sama dengan data.json + kolom terhitung ---
{
  const e = makeEnv(); const d = e.get({ action: 'data' });
  assert.equal(d.biji.length, 2); assert.equal(d.seduhan.length, 3);
  assert.equal(d.biji[0]['Tanggal Roasting'], '2026-09-10'); assert.equal(d.seduhan[0]['Rasio'], '1:16');
  assert.equal(d.seduhan[1]['Hari Sejak Roasting'], 15); assert.equal(d.seduhan[1]['Rasio'], '1:16'); assert.equal(d.seduhan[1]._hariDihitung, true);
  assert.deepEqual(Object.keys(d).sort(), ['biji', 'meta', 'seduhan']); assert.equal(d.meta.spreadsheetName, 'Jurnal Kopi');
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
  assert.deepEqual(Object.keys(d.seduhan[0]).sort(), Object.keys(ref.seduhan[0]).sort());
  assert.deepEqual(Object.keys(d.biji[0]).sort(), Object.keys(ref.biji[0]).sort());
  assert.equal(e.ctx.doGet({ parameter: {} }).mime, 'JSON');
  assert.equal(e.get({}).ok, true); ok();
}

// --- PIN ---
{
  let e = makeEnv();
  let r = e.post({ action: 'save', pin: 'salah', seduhan: {} }); assert.equal(r.ok, false); assert.equal(r.code, 'PIN_SALAH'); assert(/PIN salah/.test(r.error));
  r = e.post({ action: 'parse', text: 'x' }); assert.equal(r.code, 'PIN_SALAH'); // tanpa pin
  r = e.post({ action: 'analyze', pin: 12345, bijiId: 'B01' }); assert.equal(r.code, 'PIN_SALAH');
  assert.equal(e.fetches.length, 0); assert.equal(e.biji.grid.length, 3);
  assert.equal(e.post({ action: 'ping', pin: '1234' }).ok, true);
  assert.equal(e.ctx.safeEqual_('abc', 'abc'), true); assert.equal(e.ctx.safeEqual_('abc', 'abd'), false); assert.equal(e.ctx.safeEqual_('abc', 'abcd'), false);
  e = makeEnv({ props: { APP_PIN: '' } }); r = e.post({ action: 'ping', pin: '' }); assert.equal(r.code, 'PIN_BELUM_DIATUR');
  // penguncian setelah salah beruntun
  e = makeEnv(); for (let i = 0; i < 10; i++) e.post({ action: 'ping', pin: 'x' });
  r = e.post({ action: 'ping', pin: '1234' }); assert.equal(r.code, 'PIN_TERKUNCI');
  // body rusak
  e = makeEnv(); assert.equal(e.post(null, 'bukan json').code, 'BODY_RUSAK'); assert.equal(e.post(null, '').code, 'BODY_KOSONG');
  assert.equal(e.post({ action: 'hapus', pin: '1234' }).code, 'AKSI_TIDAK_DIKENAL'); ok();
}

// --- parse ---
{
  const e = makeEnv({ fetchQueue: [toolUse({ biji_id: 'B02', seduhan: { tanggal: '2026-10-01', dripper: 'V60', dosis: 16, airTotal: 256, suhu: 94, grind: '24 klik', waktu: '3:00', skor: 8, aroma: 99, rasio: '', deskriptor: 'gula merah' } })] });
  const r = e.post({ action: 'parse', pin: '1234', text: 'Tadi seduh kerinci honey V60 16g 256g 94C', knownBeans: [{ id: 'B02', nama: 'Kerinci Honey' }] });
  assert.equal(r.ok, true); assert.equal(r.matchedBijiId, 'B02'); assert.equal(r.draft.seduhan['ID Biji'], 'B02');
  assert.equal(r.draft.seduhan['Dosis Kopi (g)'], 16); assert.equal(r.draft.seduhan['Tanggal Seduh'], '2026-10-01');
  assert.equal(r.draft.seduhan['Aroma (1-5)'], undefined, 'nilai di luar rentang dibuang'); assert.equal(r.draft.seduhan['Rasio'], undefined);
  assert.equal(r.draft.biji, undefined);
  const f = e.fetches[0];
  assert.equal(f.url, 'https://api.anthropic.com/v1/messages'); assert.equal(f.o.headers['x-api-key'], 'sk-test-KEY'); assert.equal(f.o.headers['anthropic-version'], '2023-06-01');
  assert.equal(f.body.model, 'claude-haiku-4-5'); assert.equal(f.body.tool_choice.name, 'catat_seduhan');
  assert(/B01: Guji Uraga Natural/.test(f.body.messages[0].content)); assert(/Hari ini: \d{4}-\d{2}-\d{2}/.test(f.body.messages[0].content));
  assert.equal(e.seduhan.grid.length, 4, 'parse tidak menulis sheet'); assert.equal(e.biji.grid.length, 3);
  assert(!JSON.stringify(r).includes('sk-test-KEY'));
  // biji baru
  const e2 = makeEnv({ fetchQueue: [toolUse({ biji_baru: { nama: 'Gayo Wine', roastery: 'Roastery C', roast: '2026-09-28', altitude: 'tinggi' }, seduhan: { tanggal: '2026-10-01' } })] });
  const r2 = e2.post({ action: 'parse', pin: '1234', text: 'biji baru gayo wine' });
  assert.equal(r2.draft.biji['Nama Biji / Lot'], 'Gayo Wine'); assert.equal(r2.draft.biji['Ketinggian (mdpl)'], undefined); assert.equal(r2.matchedBijiId, null);
  // biji_baru yang namanya sudah ada di sheet -> dicocokkan ke ID yang ada
  const e3 = makeEnv({ fetchQueue: [toolUse({ biji_baru: { nama: 'kerinci  honey' }, seduhan: { tanggal: '2026-10-01' } })] });
  const r3 = e3.post({ action: 'parse', pin: '1234', text: 'kerinci honey' }); assert.equal(r3.matchedBijiId, 'B02'); assert.equal(r3.draft.biji, undefined);
  // ID dari AI yang tidak ada di sheet diabaikan
  const e4 = makeEnv({ fetchQueue: [toolUse({ biji_id: 'B99', seduhan: { tanggal: '2026-10-01' } })] });
  const r4 = e4.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r4.draft.seduhan['ID Biji'], undefined);
  // teks kosong / tanpa tool_use
  assert.equal(makeEnv().post({ action: 'parse', pin: '1234', text: '  ' }).code, 'TEKS_KOSONG');
  assert.equal(makeEnv({ fetchQueue: [textResp('halo')] }).post({ action: 'parse', pin: '1234', text: 'x' }).code, 'AI_TANPA_HASIL'); ok();
}

// --- save ---
{
  const e = makeEnv();
  const r = e.post({ action: 'save', pin: '1234', seduhan: { 'Tanggal Seduh': '2026-10-01', 'ID Biji': 'B02', 'Dripper': 'Kalita Wave 185', 'Dosis Kopi (g)': 16, 'Air Total (g)': 256, 'Total Brew Time': '3:00', 'Setting Grind': '24 klik', 'Skor Keseluruhan (1-10)': 8, 'Deskriptor Rasa / Notes': 'manis' } });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.ids.seduhan, 'S04'); assert.equal(r.ids.biji, 'B02'); assert.equal(r.ids.bijiBaru, false);
  const row = e.seduhan.grid[4], idx = h => HS.indexOf(h);
  assert.equal(row[idx('ID Seduhan')], 'S04'); assert.equal(row[idx('ID Biji')], 'B02');
  assert(row[idx('Tanggal Seduh')] instanceof Date); assert.equal(fmtDate(row[idx('Tanggal Seduh')], 'yyyy-MM-dd'), '2026-10-01');
  assert.equal(row[idx('Hari Sejak Roasting')], 13); assert.strictEqual(row[idx('Rasio')], '1:16'); assert.strictEqual(row[idx('Total Brew Time')], '3:00');
  assert.strictEqual(row[idx('Dosis Kopi (g)')], 16); assert.strictEqual(row[idx('Skor Keseluruhan (1-10)')], 8);
  assert.equal(e.seduhan.formats['5,' + (idx('Rasio') + 1)], '@'); assert.equal(e.seduhan.formats['5,' + (idx('Total Brew Time') + 1)], '@');
  assert.equal(r.data.seduhan.length, 4); assert.equal(r.data.seduhan[3]['ID Seduhan'], 'S04'); assert.equal(r.data.seduhan[3]['Rasio'], '1:16'); assert.equal(r.data.seduhan[3]['Total Brew Time'], '3:00');
  assert.equal(e.biji.grid.length, 3);
  // biji baru + seduhan
  const e2 = makeEnv();
  const r2 = e2.post({ action: 'save', pin: '1234', biji: { 'Nama Biji / Lot': 'Gayo Wine', 'Tanggal Roasting': '2026-09-28', 'Berat (g)': 250, 'Harga': '150.000' }, seduhan: { 'Tanggal Seduh': '2026-10-01', 'Dosis Kopi (g)': 15, 'Air Total (g)': 250 } });
  assert.equal(r2.ok, true, JSON.stringify(r2)); assert.equal(r2.ids.biji, 'B03'); assert.equal(r2.ids.bijiBaru, true); assert.equal(r2.ids.seduhan, 'S04');
  assert.equal(e2.biji.grid[3][0], 'B03'); assert.equal(e2.biji.grid[3][HB.indexOf('Harga')], 150000);
  assert.equal(e2.seduhan.grid[4][HS.indexOf('ID Biji')], 'B03'); assert.equal(e2.seduhan.grid[4][HS.indexOf('Hari Sejak Roasting')], 3); assert.equal(e2.seduhan.grid[4][HS.indexOf('Rasio')], '1:16.7');
  assert.equal(r2.data.biji.length, 3);
  // validasi
  const bad = (seduhan, biji) => makeEnv().post({ action: 'save', pin: '1234', seduhan, biji });
  assert.equal(bad({ 'ID Biji': 'B01' }).ok, false);
  assert(/Tanggal seduh wajib/.test(bad({ 'ID Biji': 'B01' }).error));
  assert(/format/.test(bad({ 'Tanggal Seduh': '01/10/2026', 'ID Biji': 'B01' }).error));
  assert(/masa depan/.test(bad({ 'Tanggal Seduh': '2099-01-01', 'ID Biji': 'B01' }).error));
  assert(/rentang/.test(bad({ 'Tanggal Seduh': '2026-10-01', 'ID Biji': 'B01', 'Aroma (1-5)': 7 }).error));
  assert(/angka/.test(bad({ 'Tanggal Seduh': '2026-10-01', 'ID Biji': 'B01', 'Suhu Air (C)': 'panas' }).error));
  assert(/tidak ada di Sheet/.test(bad({ 'Tanggal Seduh': '2026-10-01', 'ID Biji': 'B77' }).error));
  assert(/Pilih biji/.test(bad({ 'Tanggal Seduh': '2026-10-01' }).error));
  assert(/Nama biji wajib/.test(bad({ 'Tanggal Seduh': '2026-10-01' }, { 'Roastery': 'X' }).error));
  assert.equal(makeEnv().post({ action: 'save', pin: '1234' }).code, 'DATA_KOSONG');
  const eb = makeEnv(); eb.post({ action: 'save', pin: '1234', seduhan: { 'Tanggal Seduh': '2026-10-01', 'ID Biji': 'B01', 'Aroma (1-5)': 9 } }); assert.equal(eb.seduhan.grid.length, 4, 'gagal validasi tidak menulis');
  // dua simpan berurutan -> ID bertambah
  const e3 = makeEnv(); const a = { action: 'save', pin: '1234', seduhan: { 'Tanggal Seduh': '2026-10-01', 'ID Biji': 'B01' } };
  assert.equal(e3.post(a).ids.seduhan, 'S04'); assert.equal(e3.post(a).ids.seduhan, 'S05'); ok();
}

// --- analyze ---
{
  const e = makeEnv({ fetchQueue: [textResp('## Ringkasan\nSkor naik dari 8 ke 9.')] });
  const r = e.post({ action: 'analyze', pin: '1234', seduhanId: 'S02', question: 'kenapa lebih enak?' });
  assert.equal(r.ok, true); assert(/Ringkasan/.test(r.analysis)); assert.equal(r.model, 'claude-sonnet-5-5'); assert.equal(r.totalBrews, 2);
  const f = e.fetches[0].body;
  assert.equal(f.model, 'claude-sonnet-5-5'); assert.equal(f.temperature, undefined); assert.deepEqual(f.output_config, { effort: 'medium' });
  const u = f.messages[0].content;
  assert(/S01/.test(u) && /S02/.test(u) && !/ S03:/.test(u), 'hanya riwayat biji yang sama'); assert(/>> TARGET S02/.test(u)); assert(/kenapa lebih enak/.test(u));
  assert(/Guji Uraga/.test(u)); assert(/JANGAN menyebut atau mengaku memakai sumber web/.test(f.system)); assert(/Bahasa Indonesia/.test(f.system));
  // berdasarkan biji saja; seduhan lain dengan dripper sama tidak dipakai bila target tidak ada
  const e2 = makeEnv({ fetchQueue: [textResp('ok')] }); assert.equal(e2.post({ action: 'analyze', pin: '1234', bijiId: 'B02' }).ok, true);
  assert(/S03/.test(e2.fetches[0].body.messages[0].content));
  // galat
  assert.equal(makeEnv().post({ action: 'analyze', pin: '1234' }).code, 'TARGET_KOSONG');
  assert.equal(makeEnv().post({ action: 'analyze', pin: '1234', bijiId: 'B9' }).code, 'TARGET_HILANG');
  assert.equal(makeEnv().post({ action: 'analyze', pin: '1234', seduhanId: 'S9' }).code, 'TARGET_HILANG');
  const e3 = makeEnv(); e3.biji.grid.push(['B03', 'Kosong']); assert.equal(e3.post({ action: 'analyze', pin: '1234', bijiId: 'B03' }).code, 'RIWAYAT_KOSONG');
  assert.equal(makeEnv({ fetchQueue: [{ code: 200, body: { stop_reason: 'refusal', content: [] } }] }).post({ action: 'analyze', pin: '1234', bijiId: 'B01' }).code, 'AI_MENOLAK');
  const t = makeEnv({ fetchQueue: [{ code: 200, body: { stop_reason: 'max_tokens', content: [{ type: 'text', text: 'abc' }] } }] }).post({ action: 'analyze', pin: '1234', bijiId: 'B01' });
  assert(/terpotong/.test(t.analysis)); ok();
}

// --- galat Anthropic: retry, timeout, kunci ---
{
  let e = makeEnv({ fetchQueue: [{ code: 429, body: { error: { message: 'rate' } } }, textResp('berhasil')] });
  let r = e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }); assert.equal(r.ok, true); assert.equal(e.fetches.length, 2); assert.equal(e.sleeps, 1);
  e = makeEnv({ fetchQueue: [{ code: 529, body: 'overloaded' }, { code: 503, body: 'x' }] });
  r = e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }); assert.equal(r.ok, false); assert.equal(r.code, 'AI_GANGGUAN'); assert.equal(e.fetches.length, 2); assert(/Layanan AI/.test(r.error));
  e = makeEnv({ fetchQueue: [new Error('Timeout'), new Error('Timeout')] });
  r = e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }); assert.equal(r.code, 'AI_JARINGAN'); assert(!/Timeout/.test(r.error));
  e = makeEnv({ fetchQueue: [new Error('Timeout'), textResp('pulih')] }); assert.equal(e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }).ok, true);
  e = makeEnv({ fetchQueue: [{ code: 401, body: { error: { message: 'invalid x-api-key' } } }] });
  r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'AI_KUNCI'); assert.equal(e.fetches.length, 1, '401 tidak diulang');
  e = makeEnv({ fetchQueue: [{ code: 404, body: { error: { message: 'model: x' } } }] }); assert.equal(e.post({ action: 'parse', pin: '1234', text: 'x' }).code, 'AI_MODEL');
  e = makeEnv({ fetchQueue: [{ code: 400, body: { error: { message: 'bad' } } }] }); assert.equal(e.post({ action: 'parse', pin: '1234', text: 'x' }).code, 'AI_DITOLAK');
  e = makeEnv({ fetchQueue: [{ code: 200, body: 'bukan json' }] }); assert.equal(e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }).ok, false);
  e = makeEnv({ props: { ANTHROPIC_API_KEY: '' } }); r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'KUNCI_AI_KOSONG');
  assert(!JSON.stringify(r).includes('sk-')); ok();
}

// --- rate limit ---
{
  const q = []; for (let i = 0; i < 40; i++) q.push(textResp('ok'));
  const e = makeEnv({ fetchQueue: q }); let okc = 0, limited = null;
  for (let i = 0; i < 32; i++) { const r = e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }); if (r.ok) okc++; else limited = r; }
  assert.equal(okc, 30); assert.equal(limited.code, 'BATAS_AI'); assert(/per jam/.test(limited.error)); assert.equal(e.fetches.length, 30);
  // parse juga dihitung; save tidak
  const e2 = makeEnv(); e2.cache['ai_calls_' + Math.floor(Date.now() / 3600000)] = '30';
  assert.equal(e2.post({ action: 'parse', pin: '1234', text: 'x' }).code, 'BATAS_AI');
  assert.equal(e2.post({ action: 'save', pin: '1234', seduhan: { 'Tanggal Seduh': '2026-10-01', 'ID Biji': 'B01' } }).ok, true); ok();
}

console.log('backend tests ok (' + n + ' blok)');
