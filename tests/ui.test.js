// Uji UI Catat / Analisa AI / fallback dengan jsdom (fetch dimock).
// Jalankan: NODE_PATH=<folder node_modules berisi jsdom> node tests/ui.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
// index.html di repo sudah berisi BACKEND_URL asli; uji ini mensimulasikan 'belum dipasang' dengan mengosongkannya.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/var BACKEND_URL = '[^']*';/, "var BACKEND_URL = '';");
const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
const { JSDOM } = require('jsdom');
const URL_B = 'https://script.google.com/macros/s/TEST/exec';
assert(/var BACKEND_URL = '';/.test(html), 'BACKEND_URL kosong secara default');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = (o, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(o) });

function render({ backend, hash, handler, storage }) {
  const src = backend ? html.replace("var BACKEND_URL = '';", "var BACKEND_URL = '" + backend + "';") : html;
  const calls = [];
  return new Promise(res => {
    const dom = new JSDOM(src.replace(/<script src[^>]*><\/script>/, ''), { runScripts: 'dangerously', url: 'http://x/' + (hash || ''), pretendToBeVisual: true,
      beforeParse(w) {
        w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
        w.Chart = function () { this.destroy = () => {}; };
        if (storage) Object.keys(storage).forEach(k => w.localStorage.setItem(k, storage[k]));
        w.fetch = (url, opts) => {
          const body = opts && opts.body ? JSON.parse(opts.body) : null;
          calls.push({ url: String(url), opts, body });
          return handler(String(url), opts, body);
        };
      } });
    dom.calls = calls;
    setTimeout(() => res(dom), 100);
  });
}
const dataHandler = extra => (url, opts, body) => {
  if (url.indexOf(URL_B) === 0 && !body) return json(data);
  if (url.indexOf('data.json') === 0) return json(data);
  return extra ? extra(url, opts, body) : json({ ok: false, error: 'tak terduga' });
};
const vis = dom => { const b = dom.window.document.body.cloneNode(true); b.querySelectorAll('script').forEach(s => s.remove()); return b.textContent; };
const text = dom => vis(dom);
const $ = (dom, sel) => dom.window.document.querySelector(sel);
function setIn(dom, sel, v) { const el = $(dom, sel); el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
const click = (dom, sel) => $(dom, sel).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const fld = (grp, col) => '[data-grp="' + grp + '"][data-col="' + col + '"]';

(async () => {
  // 1) Tanpa BACKEND_URL: pakai data.json, Catat & Analisa dinonaktifkan dengan petunjuk
  let dom = await render({ hash: '#/catat', handler: dataHandler() });
  assert(/^data\.json/.test(dom.calls[0].url));
  assert(/belum aktif/.test(text(dom)) && /BACKEND_URL/.test(text(dom)) && /SETUP-id\.md/.test(text(dom)));
  assert($(dom, '#cfs').disabled, 'form dinonaktifkan');
  assert.equal(dom.calls.filter(c => c.body).length, 0);
  dom = await render({ hash: '#/biji/B01', handler: dataHandler() });
  let b = dom.window.document.querySelector('button[data-ai]'); assert(b && b.disabled, 'tombol analisa nonaktif'); assert(/Backend belum dipasang/.test(text(dom)));
  b.click(); assert(!$(dom, '#aipanel'), 'panel tidak terbuka bila nonaktif');
  // rute lama tetap jalan
  for (const h of ['#/', '#/seduhan', '#/biji', '#/biji/B02', '#/grafik']) { dom = await render({ hash: h, handler: dataHandler() }); assert(!/Gagal/.test(text(dom)), h); }
  assert(dom.window.document.querySelector('#nav a[data-r="catat"]'), 'menu Catat ada');

  // 2) Dengan BACKEND_URL: data dari ?action=data
  dom = await render({ backend: URL_B, hash: '#/', handler: dataHandler() });
  assert.equal(dom.calls[0].url, URL_B + '?action=data'); assert.equal(dom.calls[0].opts.redirect, 'follow');
  assert(/Total seduhan/.test(text(dom))); assert(!$(dom, '#fbnotice'));
  // URL dengan query sudah ada memakai &
  assert.equal(dom.window.eval("backendUrl('https://a/b?x=1','action=data')"), 'https://a/b?x=1&action=data');

  // 3) Fallback ke data.json bila backend gagal (jaringan / HTTP / JSON salah)
  for (const mode of ['reject', 'http', 'bad']) {
    dom = await render({ backend: URL_B, hash: '#/', handler: (url) => {
      if (url.indexOf(URL_B) === 0) return mode === 'reject' ? Promise.reject(new Error('net')) : mode === 'http' ? json({}, false, 500) : json({ ok: false, error: 'x' });
      return json(data);
    } });
    assert(dom.calls.some(c => /^data\.json/.test(c.url)), mode); assert(/Total seduhan/.test(text(dom)), mode); assert($(dom, '#fbnotice'), mode);
  }

  // 4) Alur Catat: AI isi form -> edit -> simpan
  const draft = { ok: true, draft: { seduhan: { 'ID Biji': 'B02', 'Tanggal Seduh': '2026-10-01', 'Dripper': 'Kalita Wave 185', 'Dosis Kopi (g)': 16, 'Air Total (g)': 256, 'Suhu Air (C)': 94, 'Setting Grind': '24 klik', 'Skor Keseluruhan (1-10)': 8 } }, matchedBijiId: 'B02' };
  const saved = JSON.parse(JSON.stringify(data));
  saved.seduhan.push({ 'ID Seduhan': 'S05', 'Tanggal Seduh': '2026-10-01', 'ID Biji': 'B02', 'Dripper': 'Kalita Wave 185', 'Skor Keseluruhan (1-10)': 8, _row: 6 });
  dom = await render({ backend: URL_B, hash: '#/catat', handler: dataHandler((url, o, body) => {
    if (body.action === 'parse') return json(draft);
    if (body.action === 'save') return json({ ok: true, ids: { biji: 'B02', seduhan: 'S05', bijiBaru: false }, data: saved });
  }) });
  assert(!$(dom, '#cfs').disabled);
  // ada semua field Biji & Seduhan
  const cols = ['Nama Biji / Lot','Roastery','Negara','Region / Terroir','Farm / Produsen','Ketinggian (mdpl)','Spesies','Varietas','Proses Pasca Panen','Profil Roasting','Tanggal Roasting','Tanggal Beli','Berat (g)','Harga','Catatan Roastery (flavor notes)'];
  cols.forEach(c => assert($(dom, fld('b', c)), 'field biji ' + c));
  ['Tanggal Seduh','Dripper','Kertas Filter','Merek Air','Suhu Air (C)','Dosis Kopi (g)','Air Total (g)','Rasio','Grinder','Setting Grind','Pouring Interval (detik per langkah)','Total Brew Time','Aroma (1-5)','Flavor (1-5)','Aftertaste (1-5)','Acidity (1-5)','Sweetness (1-5)','Body (1-5)','Balance (1-5)','Deskriptor Rasa / Notes','Skor Keseluruhan (1-10)','Catatan Pribadi','Tweak Berikutnya'].forEach(c => assert($(dom, fld('s', c)), 'field seduhan ' + c));
  // tanpa PIN / tanpa teks
  click(dom, '#cai'); assert(/Tulis dulu/.test($(dom, '#cstatus').textContent));
  setIn(dom, '#ctext', 'Tadi seduh kerinci honey V60 16g 256g'); click(dom, '#cai'); assert(/Masukkan PIN/.test($(dom, '#cstatus').textContent));
  assert.equal(dom.calls.filter(c => c.body).length, 0);
  setIn(dom, '#cpin', '1234'); $(dom, '#cremember').checked = true; click(dom, '#cai');
  assert(/AI sedang membaca/.test($(dom, '#cstatus').textContent) && $(dom, '#cai').disabled, 'status memuat');
  await sleep(50);
  const pc = dom.calls.find(c => c.body && c.body.action === 'parse');
  assert.equal(pc.url, URL_B); assert.equal(pc.opts.method, 'POST'); assert.equal(pc.opts.redirect, 'follow');
  assert(/^text\/plain/.test(pc.opts.headers['Content-Type'])); assert.equal(pc.body.pin, '1234'); assert(/kerinci/.test(pc.body.text)); assert(pc.body.knownBeans.some(k => k.id === 'B02'));
  assert.equal($(dom, '#cbiji').value, 'B02'); assert.equal($(dom, fld('s', 'Dripper')).value, 'Kalita Wave 185'); assert.equal($(dom, fld('s', 'Dosis Kopi (g)')).value, '16');
  assert(/Draf terisi/.test($(dom, '#cstatus').textContent)); assert(!$(dom, '#cai').disabled);
  assert.equal(dom.window.localStorage.getItem('jk_pin'), '1234', 'PIN diingat');
  assert($(dom, fld('s', 'Dripper')).parentNode.className.indexOf('ai') !== -1, 'ditandai terisi AI');
  assert.equal($(dom, '#cnew').style.display, 'none');
  setIn(dom, fld('s', 'Deskriptor Rasa / Notes'), 'gula merah, jeruk');
  click(dom, '#csave'); await sleep(50);
  const sc = dom.calls.find(c => c.body && c.body.action === 'save');
  assert.equal(sc.body.biji, undefined); assert.equal(sc.body.seduhan['ID Biji'], 'B02'); assert.strictEqual(sc.body.seduhan['Dosis Kopi (g)'], 16);
  assert.equal(sc.body.seduhan['Deskriptor Rasa / Notes'], 'gula merah, jeruk'); assert.equal(sc.body.seduhan['Setting Grind'], '24 klik'); assert.equal(sc.body.seduhan['Rasio'], undefined);
  assert(/Tersimpan/.test(text(dom)) && /S05/.test(text(dom)), text(dom).slice(0, 300));
  assert.equal(dom.window.__app.state.data.seduhan.length, data.seduhan.length + 1, 'data diperbarui dari respons save');

  // 5) Beans baru: AI menyarankan beans baru, form beans terbuka, simpan mengirim biji
  dom = await render({ backend: URL_B, hash: '#/catat', handler: dataHandler((url, o, body) => {
    if (body.action === 'parse') return json({ ok: true, draft: { biji: { 'Nama Biji / Lot': 'Gayo Wine', 'Roastery': 'RC' }, seduhan: { 'Tanggal Seduh': '2026-10-01' } } });
    if (body.action === 'save') return json({ ok: true, ids: { biji: 'B03', seduhan: 'S05', bijiBaru: true }, data: data });
  }) });
  setIn(dom, '#cpin', '1234'); setIn(dom, '#ctext', 'biji baru gayo wine'); click(dom, '#cai'); await sleep(50);
  assert.equal($(dom, '#cbiji').value, '__new'); assert.equal($(dom, '#cnew').style.display, 'block'); assert.equal($(dom, fld('b', 'Nama Biji / Lot')).value, 'Gayo Wine');
  assert.equal(dom.window.localStorage.getItem('jk_pin'), null, 'tanpa centang -> tidak disimpan');
  // validasi sisi klien
  setIn(dom, fld('b', 'Nama Biji / Lot'), ''); click(dom, '#csave'); assert(/Nama beans wajib/.test($(dom, '#csmsg').textContent));
  setIn(dom, fld('b', 'Nama Biji / Lot'), 'Gayo Wine'); setIn(dom, fld('s', 'Tanggal Seduh'), ''); click(dom, '#csave'); assert(/Tanggal seduh wajib/.test($(dom, '#csmsg').textContent));
  assert.equal(dom.calls.filter(c => c.body && c.body.action === 'save').length, 0);
  setIn(dom, fld('s', 'Tanggal Seduh'), '2026-10-01'); click(dom, '#csave'); await sleep(50);
  const sv = dom.calls.find(c => c.body && c.body.action === 'save');
  assert.equal(sv.body.biji['Nama Biji / Lot'], 'Gayo Wine'); assert.equal(sv.body.seduhan['ID Biji'], undefined); assert(/beans baru/.test(text(dom)));

  // 6) Galat dari server: PIN salah menghapus PIN tersimpan; galat tampil
  dom = await render({ backend: URL_B, hash: '#/catat', storage: { jk_pin: '0000' }, handler: dataHandler((u, o, body) => json({ ok: false, code: 'PIN_SALAH', error: 'PIN salah.' })) });
  assert.equal($(dom, '#cpin').value, '0000'); assert($(dom, '#cremember').checked);
  setIn(dom, '#ctext', 'x'); click(dom, '#cai'); await sleep(50);
  assert(/PIN salah/.test($(dom, '#cstatus').textContent)); assert.equal(dom.window.localStorage.getItem('jk_pin'), null);
  dom = await render({ backend: URL_B, hash: '#/catat', handler: dataHandler(() => Promise.reject(new Error('net'))) });
  setIn(dom, '#cpin', '1'); setIn(dom, '#ctext', 'x'); click(dom, '#cai'); await sleep(50);
  assert(/Tidak dapat terhubung/.test($(dom, '#cstatus').textContent)); assert(!$(dom, '#cai').disabled);
  dom = await render({ backend: URL_B, hash: '#/catat', handler: dataHandler(() => json({ ok: false, error: 'Tanggal seduh wajib diisi.' })) });
  setIn(dom, '#cpin', '1'); click(dom, '#csave'); await sleep(10); // validasi klien
  setIn(dom, '#cbiji', '__new'); setIn(dom, fld('b', 'Nama Biji / Lot'), 'A'); click(dom, '#csave'); await sleep(50);
  assert(/Tanggal seduh wajib diisi/.test($(dom, '#csmsg').textContent)); assert(!$(dom, '#csave').disabled);

  // 7) Panel Analisa AI dari halaman biji dan dari baris seduhan
  const analysis = '## Ringkasan\nSkor naik **8 → 9**.\n\n- Grind lebih halus\n- Pertahankan suhu\n\n## Saran tweak berikutnya\n1. Coba 21 klik\n<script>alert(1)</script>';
  let pending;
  dom = await render({ backend: URL_B, hash: '#/biji/B01', storage: { jk_pin: '1234' }, handler: dataHandler((u, o, body) => { pending = body; return new Promise(r => setTimeout(() => r({ ok: true, json: () => Promise.resolve({ ok: true, analysis, model: 'claude-sonnet-5-5', usedBrews: 2, totalBrews: 2 }) }), 40)); }) });
  const btn = dom.window.document.querySelector('button[data-ai][data-bean="B01"]'); assert(btn && !btn.disabled);
  btn.click();
  assert($(dom, '#aipanel') && $(dom, '#ailoading'), 'panel + loading');
  await sleep(120);
  assert.equal(pending.action, 'analyze'); assert.equal(pending.bijiId, 'B01'); assert.equal(pending.pin, '1234');
  assert(/Ringkasan/.test($(dom, '#airesult').textContent)); assert($(dom, '#airesult h4')); assert.equal($(dom, '#airesult ul').children.length, 2); assert($(dom, '#airesult strong'));
  assert(!$(dom, '#airesult script'), 'HTML dari AI di-escape'); assert(/<script>alert/.test($(dom, '#airesult').textContent));
  assert(/bukan kepastian/.test($(dom, '#aibody').textContent));
  setIn(dom, '#aiquestion', 'kenapa tipis?'); click(dom, '#aiask'); await sleep(120);
  assert.equal(pending.question, 'kenapa tipis?');
  click(dom, '#aiclose'); assert(!$(dom, '#aipanel'));
  // dari tabel perbandingan / baris seduhan
  const brewBtn = dom.window.document.querySelector('button[data-ai][data-brew="S02"]'); assert(brewBtn, 'tombol analisa di tabel');
  brewBtn.click(); await sleep(120); assert.equal(pending.seduhanId, 'S02'); click(dom, '#aiclose');
  dom = await render({ backend: URL_B, hash: '#/seduhan', storage: { jk_pin: '1234' }, handler: dataHandler((u, o, body) => { pending = body; return json({ ok: true, analysis: 'ok', usedBrews: 1, totalBrews: 1 }); }) });
  assert.equal(dom.window.document.querySelectorAll('#flist button[data-ai]').length, Math.min(20, data.seduhan.length), 'tombol di tiap kartu yang tampil (halaman pertama 20)');
  dom.window.document.querySelector('#flist button[data-ai]').click(); await sleep(50);
  assert(pending.seduhanId); assert.equal($(dom, '#airesult').textContent, 'ok');
  assert($(dom, '#flist .brew #aipanel'), 'hasil Analisa tampil di dalam kartu seduhan'); assert(!$(dom, '.ovl'), 'bukan modal');
  assert(!$(dom, '#flist a.brew'), 'tombol tidak di dalam tautan'); assert($(dom, '#flist .brew .bfoot button[data-ai]'), 'tombol di footer kartu');
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })); assert(!$(dom, '#aipanel'), 'Esc menutup');

  // 8) Panel: tanpa PIN -> minta PIN; PIN salah -> minta ulang; galat -> tombol coba lagi
  let mode = 'pinwrong';
  dom = await render({ backend: URL_B, hash: '#/biji/B01', handler: dataHandler((u, o, body) => {
    if (mode === 'pinwrong' && body.pin !== 'bener') return json({ ok: false, code: 'PIN_SALAH', error: 'PIN salah.' });
    if (mode === 'err') return json({ ok: false, code: 'AI_SIBUK', error: 'Layanan AI sedang sibuk.' });
    return json({ ok: true, analysis: 'selesai', usedBrews: 1, totalBrews: 1 });
  }) });
  dom.window.document.querySelector('button[data-ai]').click();
  assert($(dom, '#aipin'), 'minta PIN'); assert.equal(dom.calls.filter(c => c.body).length, 0);
  setIn(dom, '#aipin', 'salah'); click(dom, '#aigo'); await sleep(50);
  assert(/PIN salah/.test($(dom, '#aibody').textContent) && $(dom, '#aipin'), 'minta ulang PIN');
  setIn(dom, '#aipin', 'bener'); click(dom, '#aigo'); await sleep(50); assert.equal($(dom, '#airesult').textContent, 'selesai');
  mode = 'err'; click(dom, '#aiclose'); dom.window.document.querySelector('button[data-ai]').click(); await sleep(50);
  assert(/sedang sibuk/.test($(dom, '#aierror').textContent)); mode = 'ok'; click(dom, '#airetry'); await sleep(50); assert.equal($(dom, '#airesult').textContent, 'selesai');

  // 9) miniMarkdown aman
  const mm = dom.window.eval("miniMarkdown('## Judul\\n**tebal** & <b>x</b>\\n- a\\n- b')");
  assert(/<h4>Judul<\/h4>/.test(mm) && /<strong>tebal<\/strong>/.test(mm) && /&lt;b&gt;/.test(mm) && /<li>b<\/li>/.test(mm));

  // 10) Audit: pagination, duplikat, validasi, aksesibilitas, backend tak terjangkau, teks ramah pengunjung
  const nFull = data.seduhan.length; assert(nFull > 20, 'data uji cukup untuk pagination');
  dom = await render({ backend: URL_B, hash: '#/seduhan', handler: dataHandler() });
  const cards = () => $(dom, '#flist') ? $(dom, '#flist').querySelectorAll('.brew').length : 0;
  assert.equal(cards(), 20, '20 kartu pertama'); assert(/Tampilkan lebih banyak/.test($(dom, '#fmore').textContent));
  assert(new RegExp(nFull + ' dari ' + nFull + ' seduhan').test($(dom, '#fcount').textContent), $(dom, '#fcount').textContent);
  click(dom, '#fmore'); assert.equal(cards(), nFull); assert(!$(dom, '#fmore'), 'tombol hilang bila habis');
  assert.equal($(dom, '#fcount').textContent, nFull + ' dari ' + nFull + ' seduhan');
  setIn(dom, '#fsort', 'asc'); assert.equal(cards(), 20, 'urutan mereset halaman'); assert($(dom, '#fmore'));
  click(dom, '#fmore'); setIn(dom, '#fq', 'V60'); const nv = cards(); assert(nv <= 20 && !$(dom, '#fmore') === (nv <= 20), 'pencarian mereset halaman');
  assert(new RegExp('^' + nv + ' dari ' + nFull).test($(dom, '#fcount').textContent));
  click(dom, '#freset'); assert.equal(cards(), 20, 'reset filter');
  assert($(dom, '#fdari').getAttribute('lang') === 'id' && $(dom, '#fdari').parentNode.querySelector('.dhint'), 'helper tanggal');
  setIn(dom, '#fdari', '2026-09-26'); assert(/26 Sep 2026/.test($(dom, '#fdari').parentNode.querySelector('.dhint').textContent));

  // duplikat dari kartu
  const src = data.seduhan.find(x => x['ID Seduhan'] === 'S02');
  dom = await render({ backend: URL_B, hash: '#/seduhan', handler: dataHandler((u, o, body) => body && body.action === 'save' ? json({ ok: true, ids: { biji: src['ID Biji'], seduhan: 'S30' }, data }) : null) });
  click(dom, '#fmore'); const dupBtn = $(dom, '#flist [data-dup="S02"]'); assert(dupBtn && !dupBtn.disabled && dupBtn.getBoundingClientRect, 'tombol Duplikat di kartu');
  dupBtn.click(); await sleep(60);
  assert.equal(dom.window.location.hash, '#/catat'); assert.equal($(dom, '#cbiji').value, String(src['ID Biji']));
  const today = dom.window.__app.state.today;
  assert.equal($(dom, fld('s', 'Tanggal Seduh')).value, today, 'tanggal = hari ini');
  ['Dripper', 'Kertas Filter', 'Merek Air', 'Suhu Air (C)', 'Dosis Kopi (g)', 'Air Total (g)', 'Grinder', 'Setting Grind', 'Pouring Interval (detik per langkah)'].forEach(c => {
    if (src[c] !== undefined && src[c] !== null && src[c] !== '') assert.equal($(dom, fld('s', c)).value, String(src[c]), 'disalin ' + c);
  });
  ['Aroma (1-5)', 'Flavor (1-5)', 'Skor Keseluruhan (1-10)', 'Deskriptor Rasa / Notes', 'Catatan Pribadi', 'Tweak Berikutnya', 'Rasio', 'Total Brew Time'].forEach(c => assert.equal($(dom, fld('s', c)).value, '', 'kosong ' + c));
  assert(/disalin dari seduhan #S02/i.test($(dom, '#cdupnote').textContent));
  setIn(dom, '#cpin', '1234'); click(dom, '#csave'); await sleep(50);
  const dsv = dom.calls.find(c => c.body && c.body.action === 'save');
  assert(dsv, 'alur simpan biasa'); assert.equal(dsv.body.seduhan['ID Biji'], src['ID Biji']); assert.equal(dsv.body.seduhan['Tanggal Seduh'], today);
  assert.equal(dsv.body.seduhan['Skor Keseluruhan (1-10)'], undefined); assert.equal(dsv.body.seduhan['Dosis Kopi (g)'], src['Dosis Kopi (g)']);
  // tombol "Duplikat seduhan terakhir" di Catat
  dom = await render({ backend: URL_B, hash: '#/catat', handler: dataHandler() });
  setIn(dom, fld('s', 'Dripper'), 'xx'); setIn(dom, fld('s', 'Aroma (1-5)'), '4'); click(dom, '#cdup');
  const lastB = dom.window.eval("sortBrews(__app.state.data.seduhan, 'desc')[0]");
  assert.equal($(dom, fld('s', 'Dripper')).value, String(lastB['Dripper'] || '')); assert.equal($(dom, fld('s', 'Aroma (1-5)')).value, '', 'skor dikosongkan');
  assert.equal($(dom, fld('s', 'Tanggal Seduh')).value, dom.window.__app.state.today);

  // validasi min/max sisi klien
  dom = await render({ backend: URL_B, hash: '#/catat', handler: dataHandler((u, o, body) => json({ ok: true, ids: { biji: 'B01', seduhan: 'S99' }, data })) });
  setIn(dom, '#cpin', '1234'); setIn(dom, fld('s', 'Aroma (1-5)'), '7'); setIn(dom, fld('s', 'Skor Keseluruhan (1-10)'), '11');
  assert(/1–5/.test($(dom, fld('s', 'Aroma (1-5)')).parentNode.querySelector('.ferr').textContent), 'pesan inline aroma');
  click(dom, '#csave'); await sleep(30);
  assert.equal(dom.calls.filter(c => c.body && c.body.action === 'save').length, 0, 'tidak terkirim bila tak valid');
  assert.equal($(dom, fld('s', 'Aroma (1-5)')).getAttribute('aria-invalid'), 'true'); assert(/1–10/.test($(dom, fld('s', 'Skor Keseluruhan (1-10)')).parentNode.querySelector('.ferr').textContent));
  assert(/Periksa kolom/.test($(dom, '#csmsg').textContent));
  setIn(dom, fld('s', 'Aroma (1-5)'), '4'); setIn(dom, fld('s', 'Skor Keseluruhan (1-10)'), '8.5');
  assert(!dom.window.document.querySelector('.ferr') && !$(dom, fld('s', 'Aroma (1-5)')).getAttribute('aria-invalid'), 'pesan hilang setelah dibetulkan');
  click(dom, '#csave'); await sleep(50); assert.equal(dom.calls.filter(c => c.body && c.body.action === 'save').length, 1);
  setIn(dom, fld('s', 'Suhu Air (C)'), '150'); assert($(dom, fld('s', 'Suhu Air (C)')).parentNode.querySelector('.ferr'));

  // teks ramah pengunjung di Catat
  assert(/Fitur ini hanya untuk pemilik jurnal \(butuh PIN\)\./.test(text(dom))); assert.equal($(dom, '#cpin').getAttribute('placeholder'), 'PIN'); assert(!/APP_PIN|Apps Script|tab "Biji"|Google Sheet/.test(text(dom)));
  for (const emp of [{ biji: [], seduhan: [], meta: {} }, { biji: data.biji, seduhan: [], meta: {} }]) {
    for (const h of ['#/', '#/seduhan', '#/biji/NONE', '#/grafik']) {
      dom = await render({ backend: URL_B, hash: h, handler: (u) => json(emp) });
      assert(!/Google Sheet|tab "|Tab "|kolom "|Isi baris|APP_PIN/.test(text(dom)), h + ': ' + text(dom).slice(0, 300));
    }
  }
  // backend tak terjangkau: tombol & form nonaktif + catatan + subtitle
  for (const h of ['#/seduhan', '#/biji/B01', '#/catat']) {
    dom = await render({ backend: URL_B, hash: h, handler: (url) => url.indexOf(URL_B) === 0 ? Promise.reject(new Error('net')) : json(data) });
    assert($(dom, '#fbnotice'), h); assert(/tidak terjangkau/.test($(dom, '#subtitle').textContent) && !/analisa AI/i.test($(dom, '#subtitle').textContent), $(dom, '#subtitle').textContent);
    const ais = dom.window.document.querySelectorAll('button[data-ai],button[data-dup]'); if (h !== '#/catat') assert(ais.length && [].every.call(ais, b => b.disabled && b.title), h + ': tombol nonaktif');
    if (h === '#/catat') { assert($(dom, '#cfs').disabled); assert(/belum terjangkau/.test($(dom, '#cdown').textContent)); assert(/Fitur ini hanya untuk pemilik/.test(text(dom))); }
    if (h === '#/seduhan') { $(dom, 'button[data-ai]').click(); assert(!$(dom, '#aipanel')); }
  }
  dom = await render({ backend: URL_B, hash: '#/', handler: dataHandler() });
  assert(!/tidak terjangkau/.test($(dom, '#subtitle').textContent) && !$(dom, 'button[data-ai]:disabled'), 'normal: subtitle & tombol aktif');

  // judul per rute, aria-current, ringkasan kanvas, satuan & format angka
  const titles = { '#/': 'Ringkasan', '#/seduhan': 'Seduhan', '#/biji': 'Beans', '#/grafik': 'Grafik', '#/catat': 'Catat Seduhan' };
  for (const h of Object.keys(titles)) {
    dom = await render({ backend: URL_B, hash: h, handler: dataHandler() });
    assert.equal(dom.window.document.title, titles[h] + ' · Jurnal Seduh Kopi', h);
    const cur = dom.window.document.querySelectorAll('#nav a[aria-current]'); assert.equal(cur.length, 1, h); assert.equal(cur[0].getAttribute('aria-current'), 'page'); assert.equal(cur[0].getAttribute('data-r'), { '#/': 'home', '#/biji': 'biji' }[h] || h.slice(2));
  }
  dom = await render({ backend: URL_B, hash: '#/biji/B01', handler: dataHandler() });
  assert(/^.+ · Beans · Jurnal Seduh Kopi$/.test(dom.window.document.title) && /CONTOH|Kerinci|Gayo|\w/.test(dom.window.document.title));
  dom.window.location.hash = '#/grafik'; await sleep(60);
  assert.equal(dom.window.document.querySelector('#nav a[aria-current]').getAttribute('data-r'), 'grafik', 'aria-current ikut berpindah');
  for (const id of ['gTrend', 'gBeans', 'gRadar', 'gAct']) { const c = $(dom, '#' + id); assert(c && c.getAttribute('role') === 'img' && c.getAttribute('aria-label').length > 30, 'aria-label ' + id); }
  dom = await render({ backend: URL_B, hash: '#/', handler: dataHandler() }); assert(/seduhan/.test($(dom, '#homeTime').getAttribute('aria-label')));
  dom = await render({ backend: URL_B, hash: '#/biji/B01', handler: dataHandler() });
  assert(!/\bhr\b/.test(text(dom)) && /\d+ hari/.test(text(dom)), 'satuan hari');
  assert.equal(dom.window.document.querySelectorAll('dl.info dt').length && [].filter.call(dom.window.document.querySelectorAll('dl.info dt'), x => /Tanggal roasting|Umur kopi/i.test(x.textContent)).length, 0, 'tanpa duplikat roasting/umur di rincian');
  assert(/Roasting \d+ \w+ \d{4}/.test(text(dom)), 'tanggal roasting tetap ada di kartu umur');
  const rasioRaw = data.seduhan.find(x => /^\d+:\d+\.\d+$/.test(String(x['Rasio']))), rasioId = rasioRaw['ID Biji'];
  dom = await render({ backend: URL_B, hash: '#/biji/' + rasioId, handler: dataHandler() });
  assert(!/\d:\d+\.\d/.test(text(dom)), 'rasio tanpa titik'); assert(/\d:\d+,\d/.test(text(dom)), 'rasio bertanda koma');
  dom = await render({ backend: URL_B, hash: '#/seduhan', handler: dataHandler() }); assert(/Rasio \d+:\d+,\d/.test(text(dom)));
  dom = await render({ backend: URL_B, hash: '#/', handler: dataHandler() }); assert(/\d,\d/.test($(dom, '.cards').textContent) && !/\d\.\d/.test($(dom, '.cards').textContent), 'rata-rata berkoma');

  // berkas statis: favicon, manifest, ikon, theme-color; target sentuh & font form di CSS
  assert(/<link rel="icon" href="data:image\/svg\+xml/.test(html) && /<meta name="theme-color"/.test(html) && /<link rel="manifest" href="manifest\.json">/.test(html) && /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/.test(html));
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert(man.name && man.start_url && man.theme_color && man.icons.length >= 2); man.icons.forEach(i => assert(fs.existsSync(path.join(root, i.src)), i.src)); assert(fs.existsSync(path.join(root, 'apple-touch-icon.png')));
  assert(/min-height:44px/.test(html) && /textarea\{[^}]*font:inherit/.test(html) && /input\[type=text\][^{]*\{[^}]*font-size:16px/.test(html));
  assert(/--blue-d:#0072ab/.test(html) && !/nav a\.active\{background:var\(--blue\)/.test(html));

  console.log('jsdom UI tests ok');
})().catch(e => { console.error(e); process.exit(1); });
