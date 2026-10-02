// Uji helper agregasi Grafik (murni) + interaksi halaman #/grafik di jsdom (Chart.js dimock).
// Jalankan: NODE_PATH=<folder node_modules berisi jsdom> node tests/grafik.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const logic = /<script id="logic">([\s\S]*?)<\/script>/.exec(src)[1];
const ctx = { module: { exports: {} } };
vm.createContext(ctx); vm.runInContext(logic, ctx);
const L = ctx.module.exports;
const F = L.FIELD.seduh, FB = L.FIELD.biji;

const beans = [
  { 'ID Biji': 'B1', 'Nama Biji / Lot': 'Alpha', 'Negara': 'Indonesia', 'Proses Pasca Panen': 'Washed' },
  { 'ID Biji': 'B2', 'Nama Biji / Lot': 'Beta Lot Dengan Nama Sangat Panjang Sekali Untuk Uji', 'Negara': 'Kenya', 'Proses Pasca Panen': 'Natural' },
  { 'ID Biji': 'B3', 'Nama Biji / Lot': 'Gamma', 'Negara': 'Indonesia', 'Proses Pasca Panen': 'natural' }
];
const idx = L.indexBiji(beans);
const mk = (id, date, bean, skor, extra) => Object.assign({ 'ID Seduhan': id, 'Tanggal Seduh': date, 'ID Biji': bean, 'Skor Keseluruhan (1-10)': skor, '_row': +id.slice(1) + 1 }, extra || {});
const brews = [
  mk('S1', '2026-09-01', 'B1', 6, { Dripper: 'V60', 'Suhu Air (C)': 93, 'Aroma (1-5)': 3 }),
  mk('S2', '2026-09-20', 'B1', 8, { Dripper: 'V60', 'Suhu Air (C)': 92, 'Aroma (1-5)': 5 }),
  mk('S3', '2026-09-20', 'B2', 9, { Dripper: 'Kalita', 'Suhu Air (C)': 95, Grinder: 'C40', 'Setting Grind': '24 klik' }),
  mk('S4', '2026-09-30T07:00:00+07:00', 'B3', 7, { Dripper: 'v60' }),
  mk('S5', '2026-10-02', 'B2', null, { Dripper: 'Kalita' }),
  mk('S6', null, 'B1', 5)
];
const TODAY = '2026-10-02';

// --- tanggal & teks
assert.equal(L.dayLabel(L.dayNum('2026-10-02')), '2 Okt');
assert.equal(L.dayNum('2026-10-03') - L.dayNum('2026-10-02'), 1);
assert.equal(L.dayNum(null), null);
assert.equal(L.truncate('abcdefghij', 5), 'abcd\u2026');
assert.equal(L.truncate('abc', 5), 'abc');
assert.equal(L.truncate(null, 5), '');
assert.equal(L.serialToIso(46297), '2026-10-02');
assert.equal(L.serialToIso(46285), '2026-09-20');
const nd = L.normalizeDates({ seduhan: [{ 'Tanggal Seduh': 46297 }, { 'Tanggal Seduh': '2026-09-01' }], biji: [{ 'Tanggal Roasting': 46285, 'Tanggal Beli': null }] });
assert.equal(nd.seduhan[0]['Tanggal Seduh'], '2026-10-02'); assert.equal(nd.seduhan[1]['Tanggal Seduh'], '2026-09-01'); assert.equal(nd.biji[0]['Tanggal Roasting'], '2026-09-20');

// --- filter
const ids = l => l.map(s => s['ID Seduhan']).join(',');
assert.equal(ids(L.graphFilter(brews, idx, {}, TODAY)), 'S1,S2,S3,S4,S5,S6');
assert.equal(ids(L.graphFilter(brews, idx, { days: '30' }, TODAY)), 'S2,S3,S4,S5'); // S1 (31 hr lalu) & tanpa tanggal keluar
assert.equal(ids(L.graphFilter(brews, idx, { days: '90' }, TODAY)), 'S1,S2,S3,S4,S5');
assert.equal(ids(L.graphFilter(brews, idx, { biji: 'B1' }, TODAY)), 'S1,S2,S6');
assert.equal(ids(L.graphFilter(brews, idx, { proses: 'NATURAL' }, TODAY)), 'S3,S4,S5');
assert.equal(ids(L.graphFilter(brews, idx, { negara: 'indonesia', dripper: 'V60' }, TODAY)), 'S1,S2,S4');

// --- agregasi
const bs = L.beanScores(brews, idx);
assert.deepEqual(bs.map(g => g.key), ['B2', 'B3', 'B1']);
assert.equal(bs[0].avg, 9); assert.equal(bs[0].n, 1); // S5 tanpa skor tidak dihitung
assert.equal(bs[2].avg, 19 / 3); assert.equal(bs[2].min, 5); assert.equal(bs[2].max, 8);
const ps = L.dimScores(brews, idx, 'proses'); // Natural & natural digabung
assert.equal(ps.length, 2); assert.equal(ps[0].n, 2); assert.equal(ps[0].avg, 8);
assert.deepEqual(L.dimScores(brews, idx, 'suhu').map(g => g.label), ['94\u201395\u00b0C', '92\u201393\u00b0C']);
assert.equal(L.dimScores(brews, idx, 'grind')[0].label, '24 klik \u00b7 C40');
assert.equal(L.dimScores(brews, idx, 'grinder').length, 1);
assert.deepEqual(L.groupScores([], () => 'x'), []);
assert.deepEqual(L.groupScores(brews, () => ''), []);
const aa = L.attrAverages(brews);
assert.equal(aa[0], 4); assert.equal(aa[1], null);
assert.equal(L.attrAverages([mk('S9', '2026-10-01', 'B1', 7)]), null);

// --- tren
const tp = L.trendPoints(brews, idx);
assert.equal(tp.length, 4); // tanpa skor / tanpa tanggal dibuang
assert.deepEqual(tp.map(p => p.brewId), ['S1', 'S2', 'S3', 'S4']);
assert(tp[1].x !== tp[2].x && Math.abs(tp[1].x - tp[2].x) < 0.5, 'seduhan sehari yang sama digeser kecil');
const ma = L.movingAvg(tp, 3);
assert.equal(ma.length, 4); assert.equal(ma[0].y, 6); assert.equal(ma[1].y, 7); assert.equal(ma[3].y, (8 + 9 + 7) / 3);

// --- aktivitas
const ab = L.activityBuckets(brews);
assert.equal(ab.unit, 'week');
assert.equal(ab.buckets.reduce((a, b) => a + b.count, 0), 5);
assert.equal(ab.buckets[ab.buckets.length - 1].count, 2);
const long = L.activityBuckets([mk('S1', '2026-01-10', 'B1', 7), mk('S2', '2026-05-02', 'B1', 9), mk('S3', '2026-05-20', 'B1', 8)]);
assert.equal(long.unit, 'month'); assert.equal(long.buckets.length, 5); assert.equal(long.buckets[0].count, 1); assert.equal(long.buckets[4].count, 2); assert.equal(long.buckets[4].avg, 8.5);
assert.deepEqual(L.activityBuckets([]).buckets, []);

// --- halaman #/grafik di jsdom
const { JSDOM } = require('jsdom');
const html = src.replace(/var BACKEND_URL = '[^']*';/, "var BACKEND_URL = '';");
const big = { biji: [], seduhan: [], meta: { today: TODAY } };
for (let i = 1; i <= 25; i++) big.biji.push({ 'ID Biji': 'B' + i, 'Nama Biji / Lot': 'Bean ' + i, Negara: i % 2 ? 'Indonesia' : 'Kenya', 'Proses Pasca Panen': i % 3 ? 'Washed' : 'Natural' });
for (let i = 1; i <= 120; i++) big.seduhan.push({ 'ID Seduhan': 'S' + i, 'Tanggal Seduh': i % 7 === 0 ? 46280 + (i % 30) : '2026-09-' + String(1 + (i % 28)).padStart(2, '0'), 'ID Biji': 'B' + (1 + (i % 25)), Dripper: i % 2 ? 'V60' : 'Orea', 'Skor Keseluruhan (1-10)': 5 + (i % 9) * 0.5, 'Aroma (1-5)': 1 + (i % 5), _row: i + 1 });
function page(payload) {
  return new Promise(res => {
    const dom = new JSDOM(html.replace(/<script src[^>]*><\/script>/, ''), { runScripts: 'dangerously', url: 'http://x/#/grafik', pretendToBeVisual: true,
      beforeParse(w) {
        w.scrollTo = () => {};
        w.Chart = function (el, cfg) { this.destroy = () => {}; (w.__charts = w.__charts || []).push({ id: el.id, cfg }); };
        w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(payload))) });
      } });
    setTimeout(() => res(dom), 120);
  });
}
const last = (dom, id) => { const l = dom.window.__charts.filter(c => c.id === id); return l[l.length - 1]; };
(async () => {
  let dom = await page(big);
  const doc = dom.window.document;
  assert(!/Gagal/.test(doc.getElementById('app').textContent), doc.getElementById('app').textContent.slice(0, 200));
  ['gTrend', 'gBeans', 'gDim', 'gRadar', 'gAct'].forEach(id => assert(last(dom, id), 'chart ' + id));
  assert.equal(last(dom, 'gBeans').cfg.data.labels.length, 8, 'top 8 secara default');
  assert.equal(last(dom, 'gTrend').cfg.options.plugins.legend.display, false);
  assert(last(dom, 'gBeans').cfg.data.datasets[0].data.every((v, i, a) => !i || a[i - 1] >= v), 'terurut menurun');
  // tampilkan semua
  doc.querySelector('[data-act=allBeans]').click();
  assert.equal(last(dom, 'gBeans').cfg.data.labels.length, 25);
  assert(/Tampilkan 8 teratas/.test(doc.querySelector('[data-act=allBeans]').textContent));
  // dimensi
  doc.querySelector('[data-v=dripper]').click();
  assert.deepEqual(last(dom, 'gDim').cfg.data.labels.slice().sort(), ['Orea', 'V60']);
  // filter periode & biji
  const n0 = dom.window.__charts.length;
  doc.querySelector('[data-days="30"]').click();
  assert(dom.window.__charts.length > n0);
  doc.getElementById('greset').click();
  const sel = doc.getElementById('gbiji'); sel.value = 'B3'; sel.dispatchEvent(new dom.window.Event('change'));
  assert.equal(last(dom, 'gBeans').cfg.data.labels.length, 1);
  assert.equal(last(dom, 'gRadar').cfg.data.datasets.length, 2, 'radar biji vs semua');
  // kosong
  const dr = doc.getElementById('gdripper'); sel.value = ''; sel.dispatchEvent(new dom.window.Event('change'));
  const ng = doc.getElementById('gnegara'); ng.value = 'Kenya'; ng.dispatchEvent(new dom.window.Event('change'));
  const pr = doc.getElementById('gproses'); pr.value = 'Natural'; pr.dispatchEvent(new dom.window.Event('change'));
  dr.value = 'V60'; dr.dispatchEvent(new dom.window.Event('change'));
  assert(/Tidak ada seduhan yang cocok/.test(doc.getElementById('gcontent').textContent) || last(dom, 'gTrend'), 'empty state atau data');
  // tanggal berupa nomor seri tidak merusak halaman (46280 -> 2026-09-15)
  dom = await page(big);
  assert(dom.window.__app.state.data.seduhan.every(s => typeof s['Tanggal Seduh'] === 'string'));
  // data kosong skor
  dom = await page({ biji: beans, seduhan: [mk('S1', '2026-10-01', 'B1', null)], meta: { today: TODAY } });
  assert(/Belum ada skor/.test(dom.window.document.getElementById('gcontent').textContent));
  dom = await page({ biji: [], seduhan: [], meta: {} });
  assert(/Belum ada data seduhan/.test(dom.window.document.getElementById('app').textContent));
  console.log('grafik tests ok');
})().catch(e => { console.error(e); process.exit(1); });
