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
      env.fetches.push({ url, o, body: o.payload ? JSON.parse(o.payload) : null });
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
  r = e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }); assert.equal(r.code, 'AI_JARINGAN'); assert(/Detail: Timeout/.test(r.error), 'detail jaringan tetap ditampilkan');
  e = makeEnv({ fetchQueue: [new Error('Timeout'), textResp('pulih')] }); assert.equal(e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }).ok, true);
  e = makeEnv({ fetchQueue: [{ code: 401, body: { error: { message: 'invalid x-api-key' } } }] });
  r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'AI_KUNCI'); assert.equal(e.fetches.length, 1, '401 tidak diulang'); assert(/ANTHROPIC_API_KEY/.test(r.error) && /invalid x-api-key/.test(r.error));
  e = makeEnv({ fetchQueue: [{ code: 404, body: { error: { message: 'model: x' } } }] }); assert.equal(e.post({ action: 'parse', pin: '1234', text: 'x' }).code, 'AI_MODEL');
  e = makeEnv({ fetchQueue: [{ code: 400, body: { error: { message: 'bad' } } }] }); assert.equal(e.post({ action: 'parse', pin: '1234', text: 'x' }).code, 'AI_DITOLAK');
  e = makeEnv({ fetchQueue: [{ code: 200, body: 'bukan json' }] }); assert.equal(e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }).ok, false);
  e = makeEnv({ props: { ANTHROPIC_API_KEY: '' } }); r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'KUNCI_AI_KOSONG');
  assert(!JSON.stringify(r).includes('sk-')); ok();
}

// --- provider: pemilihan konfigurasi ---
const OA = (extra, queue) => makeEnv({ props: Object.assign({ ANTHROPIC_API_KEY: '', AI_API_KEY: 'sk-sumo-TESTKEY' }, extra), fetchQueue: queue });
const chat = (content, finish) => ({ code: 200, body: { choices: [{ index: 0, finish_reason: finish || 'stop', message: { role: 'assistant', content } }] } });
const PARSE_JSON = { biji_id: 'B02', seduhan: { tanggal: '2026-10-01', dripper: 'V60', dosis: 16, airTotal: 256, suhu: 94, aroma: 99, rasio: '', skor: 8 } };
{
  const cfg = e => JSON.parse(JSON.stringify(e.ctx.aiConfig_()));
  let c = cfg(makeEnv()); assert.equal(c.provider, 'anthropic'); assert.equal(c.modelParse, 'claude-haiku-4-5'); assert.equal(c.modelAnalyze, 'claude-sonnet-5-5');
  c = cfg(OA()); assert.equal(c.provider, 'openai-compatible'); assert.equal(c.baseUrl, 'https://ai.sumopod.com/v1'); assert.equal(c.modelParse, 'claude-haiku-4-5'); assert.equal(c.modelAnalyze, 'claude-haiku-4-5');
  assert.equal(c.jsonMode, true); assert.equal(c.temperature, true);
  c = cfg(makeEnv({ props: { ANTHROPIC_API_KEY: '', SUMOPOD_API_KEY: 'sk-alias' } })); assert.equal(c.provider, 'openai-compatible'); assert.equal(c.key, 'sk-alias');
  c = cfg(makeEnv({ props: { AI_API_KEY: 'sk-x' } })); assert.equal(c.provider, 'openai-compatible', 'kedua kunci ada -> openai-compatible');
  c = cfg(makeEnv({ props: { AI_API_KEY: 'sk-x', AI_PROVIDER: 'anthropic' } })); assert.equal(c.provider, 'anthropic'); assert.equal(c.key, 'sk-test-KEY');
  c = cfg(OA({ AI_BASE_URL: 'https://gw.example/v1/', MODEL_PARSE: 'gpt-4o-mini', MODEL_ANALYZE: 'gpt-4.1-mini', AI_JSON_MODE: 'OFF', AI_TEMPERATURE: 'off' }));
  assert.equal(c.baseUrl, 'https://gw.example/v1'); assert.equal(c.modelParse, 'gpt-4o-mini'); assert.equal(c.modelAnalyze, 'gpt-4.1-mini'); assert.equal(c.jsonMode, false); assert.equal(c.temperature, false);
  c = cfg(makeEnv({ props: { MODEL_PARSE: 'claude-x', MODEL_ANALYZE: 'claude-y' } })); assert.equal(c.provider, 'anthropic'); assert.equal(c.modelParse, 'claude-x'); assert.equal(c.modelAnalyze, 'claude-y');
  // tanpa kunci apa pun
  const r = OA({ AI_API_KEY: '' }).post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'KUNCI_AI_KOSONG'); assert(/AI_API_KEY/.test(r.error)); ok();
}

// --- openai-compatible: parse (JSON dalam code fence) ---
{
  const fenced = 'Berikut hasilnya:\n```json\n' + JSON.stringify(PARSE_JSON) + '\n```\nSemoga membantu.';
  const e = OA({}, [chat(fenced)]);
  const r = e.post({ action: 'parse', pin: '1234', text: 'Tadi seduh kerinci honey V60 16g 256g 94C' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.matchedBijiId, 'B02'); assert.equal(r.draft.seduhan['ID Biji'], 'B02');
  assert.equal(r.draft.seduhan['Dosis Kopi (g)'], 16); assert.equal(r.draft.seduhan['Aroma (1-5)'], undefined, 'validasi sama'); assert.equal(r.draft.seduhan['Rasio'], undefined); assert.equal(r.draft.biji, undefined);
  assert.deepEqual(Object.keys(r).sort(), ['draft', 'matchedBijiId', 'ok']);
  const f = e.fetches[0];
  assert.equal(f.url, 'https://ai.sumopod.com/v1/chat/completions'); assert.equal(f.o.method, 'post'); assert.equal(f.o.headers.Authorization, 'Bearer sk-sumo-TESTKEY'); assert.equal(f.o.headers['x-api-key'], undefined);
  assert.equal(f.body.model, 'claude-haiku-4-5'); assert.equal(f.body.temperature, 0); assert.deepEqual(f.body.response_format, { type: 'json_object' });
  assert.equal(f.body.tools, undefined); assert.equal(f.body.tool_choice, undefined); assert.equal(f.body.output_config, undefined); assert.equal(f.body.system, undefined);
  assert.equal(f.body.messages[0].role, 'system'); assert(/JSON/.test(f.body.messages[0].content) && /seduhan/.test(f.body.messages[0].content) && !/lewat tool/.test(f.body.messages[0].content));
  assert.equal(f.body.messages[1].role, 'user'); assert(/B01: Guji Uraga Natural/.test(f.body.messages[1].content));
  assert.equal(e.seduhan.grid.length, 4, 'parse tidak menulis sheet'); assert(!JSON.stringify(r).includes('sk-sumo'));
  // JSON polos, teks di sekeliling, <think>, kurung kurawal dalam string
  const x = e.ctx.extractJson_;
  assert.deepEqual(JSON.parse(JSON.stringify(x('{"a":1}'))), { a: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(x('Ini: {"a":"}{","b":{"c":2}} selesai'))), { a: '}{', b: { c: 2 } });
  assert.deepEqual(JSON.parse(JSON.stringify(x('<think>{"x":0}</think>\n{"a":3}'))), { a: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(x('```\n{"a":4}\n```'))), { a: 4 });
  assert.equal(x('tidak ada json'), null); assert.equal(x(''), null); assert.equal(x('[1,2]'), null);
  // opsi menimpa
  const e2 = OA({ MODEL_PARSE: 'gpt-4o-mini', AI_BASE_URL: 'https://gw.example/v1/', AI_JSON_MODE: 'off', AI_TEMPERATURE: 'off' }, [chat('{"seduhan":{"tanggal":"2026-10-01"}}')]);
  assert.equal(e2.post({ action: 'parse', pin: '1234', text: 'x' }).ok, true);
  const f2 = e2.fetches[0]; assert.equal(f2.url, 'https://gw.example/v1/chat/completions'); assert.equal(f2.body.model, 'gpt-4o-mini'); assert.equal(f2.body.response_format, undefined); assert.equal(f2.body.temperature, undefined);
  // jawaban bukan JSON -> AI_TANPA_HASIL; konten bentuk array
  assert.equal(OA({}, [chat('maaf saya tidak bisa')]).post({ action: 'parse', pin: '1234', text: 'x' }).code, 'AI_TANPA_HASIL');
  const arr = OA({}, [{ code: 200, body: { choices: [{ finish_reason: 'stop', message: { content: [{ type: 'text', text: '{"seduhan":{"dosis":15}}' }] } }] } }]).post({ action: 'parse', pin: '1234', text: 'x' });
  assert.equal(arr.draft.seduhan['Dosis Kopi (g)'], 15); ok();
}

// --- openai-compatible: analyze (teks biasa) ---
{
  const e = OA({}, [chat('## Ringkasan\nSkor naik.')]);
  const r = e.post({ action: 'analyze', pin: '1234', seduhanId: 'S02', question: 'kenapa?' });
  assert.equal(r.ok, true); assert(/Ringkasan/.test(r.analysis)); assert.equal(r.model, 'claude-haiku-4-5'); assert.equal(r.totalBrews, 2);
  const f = e.fetches[0]; assert.equal(f.url, 'https://ai.sumopod.com/v1/chat/completions'); assert.equal(f.body.model, 'claude-haiku-4-5');
  ['temperature', 'response_format', 'output_config', 'tools', 'tool_choice', 'system'].forEach(k => assert.equal(f.body[k], undefined, k));
  assert.equal(f.body.messages[0].role, 'system'); assert(/Bahasa Indonesia/.test(f.body.messages[0].content)); assert(/>> TARGET S02/.test(f.body.messages[1].content));
  // model dari properti, terpotong, ditolak, kosong
  const e2 = OA({ MODEL_ANALYZE: 'gpt-4.1-mini' }, [chat('abc', 'length')]); const r2 = e2.post({ action: 'analyze', pin: '1234', bijiId: 'B01' });
  assert.equal(r2.model, 'gpt-4.1-mini'); assert.equal(e2.fetches[0].body.model, 'gpt-4.1-mini'); assert(/terpotong/.test(r2.analysis));
  assert.equal(OA({}, [chat('', 'content_filter')]).post({ action: 'analyze', pin: '1234', bijiId: 'B01' }).code, 'AI_MENOLAK');
  assert.equal(OA({}, [chat('')]).post({ action: 'analyze', pin: '1234', bijiId: 'B01' }).code, 'AI_TANPA_HASIL');
  // anthropic + MODEL_ANALYZE ditimpa: effort tidak dikirim; bawaan: effort dikirim
  const a = makeEnv({ props: { MODEL_ANALYZE: 'claude-sonnet-4-5' }, fetchQueue: [textResp('ok')] }); a.post({ action: 'analyze', pin: '1234', bijiId: 'B01' });
  assert.equal(a.fetches[0].body.model, 'claude-sonnet-4-5'); assert.equal(a.fetches[0].body.output_config, undefined);
  // retry 429 tetap jalan
  const e3 = OA({}, [{ code: 429, body: { error: { message: 'rate' } } }, chat('berhasil')]); assert.equal(e3.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }).ok, true); assert.equal(e3.fetches.length, 2); assert.equal(e3.sleeps, 1); ok();
}

// --- openai-compatible: 400 response_format / temperature / max_tokens -> ulang sekali ---
{
  let e = OA({}, [{ code: 400, body: { error: { message: "Unsupported parameter: 'response_format' is not supported with this model." } } }, chat('{"seduhan":{"dosis":15}}')]);
  let r = e.post({ action: 'parse', pin: '1234', text: 'x' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(e.fetches.length, 2); assert.equal(e.fetches[0].body.response_format.type, 'json_object'); assert.equal(e.fetches[1].body.response_format, undefined); assert.equal(e.fetches[1].body.temperature, 0);
  e = OA({}, [{ code: 400, body: { error: { message: "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported." } } }, chat('{"seduhan":{"dosis":15}}')]);
  r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.ok, true); assert.equal(e.fetches.length, 2); assert.equal(e.fetches[1].body.temperature, undefined); assert.deepEqual(e.fetches[1].body.response_format, { type: 'json_object' });
  // keduanya berurutan
  e = OA({}, [{ code: 400, body: { error: { message: 'response_format unsupported' } } }, { code: 400, body: { error: { message: 'temperature unsupported' } } }, chat('{"seduhan":{"dosis":15}}')]);
  r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.ok, true); assert.equal(e.fetches.length, 3); assert.equal(e.fetches[2].body.temperature, undefined); assert.equal(e.fetches[2].body.response_format, undefined);
  // max_tokens -> max_completion_tokens
  e = OA({}, [{ code: 400, body: { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } } }, chat('ok')]);
  r = e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' }); assert.equal(r.ok, true); assert.equal(e.fetches[1].body.max_tokens, undefined); assert.equal(e.fetches[1].body.max_completion_tokens, 6000);
  // 400 yang sama berulang: hanya sekali per parameter, lalu galat dengan detail
  e = OA({}, [{ code: 400, body: { error: { message: 'response_format bad' } } }, { code: 400, body: { error: { message: 'response_format bad' } } }]);
  r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.ok, false); assert.equal(r.code, 'AI_DITOLAK'); assert.equal(e.fetches.length, 2); assert(/HTTP 400/.test(r.error) && /response_format bad/.test(r.error));
  // 400 lain: tidak diulang, detail tampil
  e = OA({}, [{ code: 400, body: { error: { message: 'Budget has been exceeded' } } }]);
  r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'AI_DITOLAK'); assert.equal(e.fetches.length, 1); assert(/Budget has been exceeded/.test(r.error));
  // jangan ulang temperature bila tidak dikirim (AI_TEMPERATURE=off)
  e = OA({ AI_TEMPERATURE: 'off' }, [{ code: 400, body: { error: { message: 'temperature weird' } } }]); r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'AI_DITOLAK'); assert.equal(e.fetches.length, 1); ok();
}

// --- openai-compatible: 401/403/404/5xx/jaringan ---
{
  let e = OA({}, [{ code: 401, body: { error: { message: 'Authentication Error, Invalid proxy server token passed. key=sk-sumo-TESTKEY' } } }]);
  let r = e.post({ action: 'parse', pin: '1234', text: 'x' });
  assert.equal(r.code, 'AI_KUNCI'); assert.equal(e.fetches.length, 1, '401 tidak diulang'); assert(/AI_API_KEY/.test(r.error) && /Authentication Error/.test(r.error) && /HTTP 401/.test(r.error)); assert(!r.error.includes('sk-sumo-TESTKEY'), 'kunci di-redact'); assert(!/ANTHROPIC/.test(r.error));
  e = OA({}, [{ code: 403, body: { error: { message: 'key not allowed to access model claude-haiku-4-5' } } }]); r = e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' });
  assert.equal(r.code, 'AI_KUNCI'); assert(/not allowed to access model/.test(r.error) && /HTTP 403/.test(r.error));
  e = OA({}, [{ code: 404, body: { error: { message: 'model gpt-9 not found' } } }]); r = e.post({ action: 'analyze', pin: '1234', bijiId: 'B01' });
  assert.equal(r.code, 'AI_MODEL'); assert(/gpt-9 not found/.test(r.error) && /MODEL_ANALYZE/.test(r.error) && /models/.test(r.error));
  e = OA({}, [{ code: 401, body: '<html>Unauthorized</html>' }]); r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'AI_KUNCI'); assert(/Unauthorized/.test(r.error));
  e = OA({}, [{ code: 503, body: { error: { message: 'upstream down' } } }, { code: 502, body: 'bad gateway' }]); r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'AI_GANGGUAN'); assert.equal(e.fetches.length, 2);
  e = OA({}, [new Error('Address unavailable: https://ai.sumopod.com/v1/chat/completions'), new Error('Address unavailable')]); r = e.post({ action: 'parse', pin: '1234', text: 'x' }); assert.equal(r.code, 'AI_JARINGAN'); assert(/Detail: Address unavailable/.test(r.error));
  // 401 sebelum PIN tidak mungkin: PIN tetap dicek lebih dulu
  e = OA({}, []); assert.equal(e.post({ action: 'models', pin: 'salah' }).code, 'PIN_SALAH'); assert.equal(e.fetches.length, 0); ok();
}

// --- aksi models ---
{
  let e = OA({}, [{ code: 200, body: { object: 'list', data: [{ id: 'gpt-4o-mini' }, { id: 'claude-haiku-4-5' }, { id: 'deepseek-v3' }] } }]);
  let r = e.post({ action: 'models', pin: '1234' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.deepEqual(r.models, ['claude-haiku-4-5', 'deepseek-v3', 'gpt-4o-mini']); assert.equal(r.count, 3); assert.equal(r.provider, 'openai-compatible');
  assert.deepEqual(r.current, { parse: 'claude-haiku-4-5', analyze: 'claude-haiku-4-5' }); assert(!JSON.stringify(r).includes('sk-sumo'));
  const f = e.fetches[0]; assert.equal(f.url, 'https://ai.sumopod.com/v1/models'); assert.equal(f.o.method, 'get'); assert.equal(f.o.headers.Authorization, 'Bearer sk-sumo-TESTKEY'); assert.equal(f.body, null);
  assert.equal(e.cache['ai_calls_' + Math.floor(Date.now() / 3600000)], undefined, 'models tidak memakan jatah parse/analyze');
  e = OA({ AI_BASE_URL: 'https://gw.example/v1' }, [{ code: 200, body: { data: [] } }]); r = e.post({ action: 'models', pin: '1234' }); assert.equal(e.fetches[0].url, 'https://gw.example/v1/models'); assert.equal(r.count, 0);
  e = OA({}, [{ code: 401, body: { error: { message: 'bad key' } } }]); r = e.post({ action: 'models', pin: '1234' }); assert.equal(r.code, 'AI_KUNCI'); assert(/bad key/.test(r.error));
  e = OA({}, [{ code: 404, body: { error: { message: 'no route' } } }]); r = e.post({ action: 'models', pin: '1234' }); assert.equal(r.code, 'AI_MODEL'); assert(/AI_BASE_URL/.test(r.error) && /no route/.test(r.error));
  assert.equal(OA({ AI_API_KEY: '' }).post({ action: 'models', pin: '1234' }).code, 'KUNCI_AI_KOSONG');
  // anthropic langsung
  e = makeEnv({ fetchQueue: [{ code: 200, body: { data: [{ id: 'claude-haiku-4-5' }] } }] }); r = e.post({ action: 'models', pin: '1234' });
  assert.equal(r.provider, 'anthropic'); assert.deepEqual(r.models, ['claude-haiku-4-5']); assert(/^https:\/\/api\.anthropic\.com\/v1\/models/.test(e.fetches[0].url)); assert.equal(e.fetches[0].o.headers['x-api-key'], 'sk-test-KEY');
  // izinkan()
  e = OA({}, [{ code: 401, body: { error: { message: 'x' } } }]); const m = e.ctx.izinkan(); assert(/OK/.test(m)); assert.equal(e.fetches[0].url, 'https://ai.sumopod.com/v1/models'); ok();
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
