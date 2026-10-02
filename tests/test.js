// Uji: index.html dirender jsdom dengan data.json (fetch dimock dari berkas lokal).
// Jalankan: npm i jsdom && node tests/test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
// index.html di repo sudah berisi BACKEND_URL asli; uji ini mensimulasikan 'belum dipasang' dengan mengosongkannya.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/var BACKEND_URL = '[^']*';/, "var BACKEND_URL = '';");
const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
assert(/name="viewport"/.test(html)); assert(!/google\.script/.test(html));
assert(data.biji.length && data.seduhan.length && data.meta);
const { JSDOM } = require('jsdom');
function render(payload, hash, status = 200) {
  return new Promise(res => {
    const dom = new JSDOM(html.replace(/<script src[^>]*><\/script>/, ''), { runScripts: 'dangerously', url: 'http://x/' + (hash || ''), pretendToBeVisual: true,
      beforeParse(w) {
        w.scrollTo = () => {};
        w.Chart = function (el, cfg) { this.destroy = () => {}; (w.__charts = w.__charts || []).push(cfg); };
        w.fetch = url => { w.__url = url; return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(payload) }); };
      } });
    setTimeout(() => res(dom), 80);
  });
}
(async () => {
  let dom = await render(data, '#/');
  assert(/^data\.json\?\d+/.test(dom.window.__url), 'fetch data.json');
  let t = dom.window.document.getElementById('app').textContent;
  assert(/Total seduhan/.test(t) && !/Gagal/.test(t), t.slice(0, 200));
  assert(dom.window.__charts.length === 1);
  for (const h of ['#/seduhan', '#/biji', '#/biji/B01', '#/biji/B02', '#/grafik']) {
    dom = await render(data, h);
    t = dom.window.document.getElementById('app').textContent;
    assert(!/Gagal/.test(t), h + ': ' + t.slice(0, 200));
    assert(/CONTOH/.test(t) || h === '#/grafik', h);
    const vis = (dom.window.document.getElementById('nav').textContent + ' ' + dom.window.document.getElementById('app').textContent).replace(/tab "Biji"|ID Biji|Nama Biji/gi, '');
    assert(!/\bbiji\b/i.test(vis), h + ': teks UI masih memakai "biji": ' + (/.{20}\bbiji\b.{20}/i.exec(vis) || [''])[0]);
  }
  dom = await render(data, '#/biji/B01');
  assert(dom.window.document.querySelectorAll('td.diff').length > 0);
  assert.equal(dom.window.__charts.length, 2);
  dom = await render({ biji: [], seduhan: [], meta: {} }, '#/');
  assert(/Belum ada data/.test(dom.window.document.getElementById('app').textContent));
  dom = await render(null, '#/', 404);
  assert(/Gagal memuat data\.json/.test(dom.window.document.body.textContent));
  console.log('jsdom render ok');
})().catch(e => { console.error(e); process.exit(1); });
