// Menjalankan transformasi getData() dari Code.gs (Apps Script) di Node terhadap isi sheet,
// lalu menulis data.json. Pakai: TZ=Asia/Jakarta node tools/build-data.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const pad = n => String(n).padStart(2, '0');
const Utilities = { formatDate(d, tz, f) {
  const y = d.getFullYear(), m = pad(d.getMonth() + 1), dd = pad(d.getDate());
  if (f === 'HH:mm:ss') return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if (f === 'yyyy-MM-dd') return `${y}-${m}-${dd}`;
  return `${y}-${m}-${dd}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+07:00`;
} };
const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function mkSheet(vals, disp) { return { getLastRow: () => vals.length, getLastColumn: () => vals[0].length,
  getRange: () => ({ getValues: () => vals, getDisplayValues: () => disp || vals.map(r => r.map(c => c instanceof Date ? Utilities.formatDate(c, '', 'yyyy-MM-dd') : String(c))) }) }; }

const HB = ['ID Biji','Nama Biji / Lot','Roastery','Negara','Region / Terroir','Farm / Produsen','Ketinggian (mdpl)','Spesies','Varietas','Proses Pasca Panen','Profil Roasting','Tanggal Roasting','Tanggal Beli','Berat (g)','Harga','Catatan Roastery (flavor notes)','Catatan Pribadi'];
const biji = [HB,
 ['B01','[CONTOH] Guji Uraga Natural','Roastery Fiktif A','Ethiopia','Guji, Uraga','Smallholders Uraga',2100,'Arabica','Heirloom Ethiopia','Natural','Light roast, filter',D('2026-09-10'),D('2026-09-14'),200,185000,'Blueberry, jasmine, honey','Contoh data fiktif'],
 ['B02','[CONTOH] Kerinci Honey','Roastery Fiktif B','Indonesia','Kerinci, Jambi','Kelompok Tani Fiktif',1400,'Arabica','Sigarar Utang','Red Honey','Medium-light, filter',D('2026-09-18'),D('2026-09-22'),200,120000,'Brown sugar, orange, cacao','Contoh data fiktif.']];
const HS = ['ID Seduhan','Tanggal Seduh','ID Biji','Hari Sejak Roasting','Dripper','Kertas Filter','Merek Air','Suhu Air (C)','Dosis Kopi (g)','Air Total (g)','Rasio','Grinder','Setting Grind','Pouring Interval (detik per langkah)','Total Brew Time','Aroma (1-5)','Flavor (1-5)','Aftertaste (1-5)','Acidity (1-5)','Sweetness (1-5)','Body (1-5)','Balance (1-5)','Deskriptor Rasa / Notes','Skor Keseluruhan (1-10)','Catatan Pribadi','Tweak Berikutnya'];
const V60 = ['Hario V60 02','Hario tabbed white','Aqua'], KAL = ['Kalita Wave 185','Kalita wave filter','Le Minerale'];
const row = (id, tgl, b, hari, eq, suhu, dose, water, grind, pour, time, sc, desk, skor, cat, tw) =>
  [id, D(tgl), b, hari, ...eq, suhu, dose, water, '1:16', 'Comandante C40', grind, pour, time, ...sc, desk, skor, cat, tw];
const seduhan = [HS,
 row('S01','2026-09-20','B01',10,V60,93,15,240,'24 klik','45s bloom, 40s, 40s','2:45',[4,4,4,4,4,3,4],'Blueberry, jasmine, madu; acidity cerah',8,'Enak, sedikit tipis','Grind lebih halus 2 klik'),
 row('S02','2026-09-25','B01',15,V60,93,15,240,'22 klik','45s bloom, 40s, 40s','3:05',[4,5,4,4,5,4,5],'Blueberry matang, jasmine, manis madu; body lebih tebal',9,'Terbaik sejauh ini','Pertahankan'),
 row('S03','2026-09-26','B02',8,KAL,92,16,256,'26 klik','40s bloom, 45s, 45s','3:10',[3,4,3,3,4,4,4],'Gula merah, jeruk, cokelat; clean',7,'Agak flat di akhir','Suhu naik 1-2 derajat'),
 row('S04','2026-09-29','B02',11,KAL,94,16,256,'26 klik','40s bloom, 45s, 45s','3:00',[4,4,4,4,4,4,4],'Gula merah, jeruk manis, cokelat; lebih hidup',8,'Lebih baik dari S03','Coba grind 24 klik')];
const sheets = { Biji: mkSheet(biji), Seduhan: mkSheet(seduhan) };
const ss = { getSheetByName: n => sheets[n] || null, getSheets: () => [], getSpreadsheetTimeZone: () => 'Asia/Jakarta', getName: () => 'Jurnal Kopi' };
const ctx = { Utilities, Session: { getScriptTimeZone: () => 'Asia/Jakarta' }, HtmlService: {},
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss }, Date, Object, String, Number, isFinite, isNaN, parseFloat, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), ctx);
const out = ctx.getData();
fs.writeFileSync(path.join(__dirname, '..', 'data.json'), JSON.stringify(JSON.parse(JSON.stringify(out)), null, 2) + '\n');
console.log('data.json ditulis:', out.biji.length, 'biji,', out.seduhan.length, 'seduhan');
