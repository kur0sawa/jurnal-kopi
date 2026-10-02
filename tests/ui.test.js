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

  // 5) Biji baru: AI menyarankan biji baru, form biji terbuka, simpan mengirim biji
  dom = await render({ backend: URL_B, hash: '#/catat', handler: dataHandler((url, o, body) => {
    if (body.action === 'parse') return json({ ok: true, draft: { biji: { 'Nama Biji / Lot': 'Gayo Wine', 'Roastery': 'RC' }, seduhan: { 'Tanggal Seduh': '2026-10-01' } } });
    if (body.action === 'save') return json({ ok: true, ids: { biji: 'B03', seduhan: 'S05', bijiBaru: true }, data: data });
  }) });
  setIn(dom, '#cpin', '1234'); setIn(dom, '#ctext', 'biji baru gayo wine'); click(dom, '#cai'); await sleep(50);
  assert.equal($(dom, '#cbiji').value, '__new'); assert.equal($(dom, '#cnew').style.display, 'block'); assert.equal($(dom, fld('b', 'Nama Biji / Lot')).value, 'Gayo Wine');
  assert.equal(dom.window.localStorage.getItem('jk_pin'), null, 'tanpa centang -> tidak disimpan');
  // validasi sisi klien
  setIn(dom, fld('b', 'Nama Biji / Lot'), ''); click(dom, '#csave'); assert(/Nama biji wajib/.test($(dom, '#csmsg').textContent));
  setIn(dom, fld('b', 'Nama Biji / Lot'), 'Gayo Wine'); setIn(dom, fld('s', 'Tanggal Seduh'), ''); click(dom, '#csave'); assert(/Tanggal seduh wajib/.test($(dom, '#csmsg').textContent));
  assert.equal(dom.calls.filter(c => c.body && c.body.action === 'save').length, 0);
  setIn(dom, fld('s', 'Tanggal Seduh'), '2026-10-01'); click(dom, '#csave'); await sleep(50);
  const sv = dom.calls.find(c => c.body && c.body.action === 'save');
  assert.equal(sv.body.biji['Nama Biji / Lot'], 'Gayo Wine'); assert.equal(sv.body.seduhan['ID Biji'], undefined); assert(/biji baru/.test(text(dom)));

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
  assert.equal(dom.window.document.querySelectorAll('#flist button[data-ai]').length, data.seduhan.length, 'tombol di tiap baris');
  dom.window.document.querySelector('#flist button[data-ai]').click(); await sleep(50);
  assert(pending.seduhanId); assert.equal($(dom, '#airesult').textContent, 'ok');
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

  console.log('jsdom UI tests ok');
})().catch(e => { console.error(e); process.exit(1); });
