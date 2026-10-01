/**
 * Dashboard Jurnal Seduh Kopi - Google Apps Script web app (read-only).
 * Script terikat (container-bound) ke Google Sheet dengan tab "Biji" dan "Seduhan".
 */

var SPREADSHEET_ID = '172P-b3gbzfHpvnb_FmPYXdMYCoYsOdcypxc8LyXv0kU'; // fallback bila tidak container-bound
var SHEET_BIJI = 'Biji';
var SHEET_SEDUHAN = 'Seduhan';

var COL = {
  // Biji
  BIJI_ID: 'ID Biji',
  ROAST_DATE: 'Tanggal Roasting',
  // Seduhan
  SEDUH_DATE: 'Tanggal Seduh',
  HARI: 'Hari Sejak Roasting',
  DOSE: 'Dosis Kopi (g)',
  WATER: 'Air Total (g)',
  RATIO: 'Rasio'
};

// Kolom yang selalu dibaca sebagai teks tampilan (agar "1:16" atau "3:30" tidak dianggap jam/tanggal).
var DISPLAY_TEXT_COLS = {
  'Rasio': true,
  'Total Brew Time': true,
  'Pouring Interval (detik per langkah)': true
};

// Kolom angka: nilai berupa teks ("92,5" / "1.200") dicoba diubah menjadi angka.
var NUMERIC_COLS = {
  'Ketinggian (mdpl)': true,
  'Berat (g)': true,
  'Harga': true,
  'Hari Sejak Roasting': true,
  'Suhu Air (C)': true,
  'Dosis Kopi (g)': true,
  'Air Total (g)': true,
  'Aroma (1-5)': true,
  'Flavor (1-5)': true,
  'Aftertaste (1-5)': true,
  'Acidity (1-5)': true,
  'Sweetness (1-5)': true,
  'Body (1-5)': true,
  'Balance (1-5)': true,
  'Skor Keseluruhan (1-10)': true
};

var ID_COLS = { 'ID Biji': true, 'ID Seduhan': true };

/** Menyajikan Index.html. */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Jurnal Seduh Kopi')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Ambil spreadsheet: container-bound dulu, fallback openById. */
function getSpreadsheet_() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    ss = null;
  }
  if (!ss) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss;
}

function findSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  var want = String(name).toLowerCase();
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].getName()).trim().toLowerCase() === want) return all[i];
  }
  return null;
}

/**
 * Dipanggil dari klien: google.script.run.getData().
 * @return {{biji:Object[], seduhan:Object[], meta:Object}}
 */
function getData() {
  var ss = getSpreadsheet_();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Jakarta';
  var warnings = [];

  var shBiji = findSheet_(ss, SHEET_BIJI);
  var shSeduhan = findSheet_(ss, SHEET_SEDUHAN);
  if (!shBiji) warnings.push('Tab "' + SHEET_BIJI + '" tidak ditemukan.');
  if (!shSeduhan) warnings.push('Tab "' + SHEET_SEDUHAN + '" tidak ditemukan.');

  var biji = readSheet_(shBiji, tz);
  var seduhan = readSheet_(shSeduhan, tz);

  enrichSeduhan_(biji, seduhan);

  return {
    biji: biji,
    seduhan: seduhan,
    meta: {
      generatedAt: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
      timeZone: tz,
      spreadsheetName: ss.getName(),
      warnings: warnings
    }
  };
}

/** Baca satu tab menjadi array objek (kunci = header baris 1). Baris kosong dilewati. */
function readSheet_(sheet, tz) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var range = sheet.getRange(1, 1, lastRow, lastCol);
  var values = range.getValues();
  var display = range.getDisplayValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var blank = true;
    for (var c0 = 0; c0 < row.length; c0++) {
      if (row[c0] !== '' && row[c0] !== null) { blank = false; break; }
    }
    if (blank) continue;

    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var key = headers[c];
      if (!key) continue;
      obj[key] = convertCell_(key, row[c], display[r][c], tz);
    }
    obj._row = r + 1; // nomor baris di sheet
    out.push(obj);
  }
  return out;
}

function convertCell_(key, value, displayValue, tz) {
  if (value === '' || value === null || value === undefined) return null;

  if (DISPLAY_TEXT_COLS[key]) {
    var d = String(displayValue).trim();
    return d === '' ? null : d;
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return null;
    // Sel berformat jam/durasi (tahun 1899) -> pakai teks tampilan.
    if (value.getFullYear() < 1901) {
      var t = String(displayValue).trim();
      return t === '' ? null : t;
    }
    return serializeDate_(value, tz);
  }

  if (ID_COLS[key]) return String(value).trim();

  if (NUMERIC_COLS[key]) return toNumber_(value);

  if (typeof value === 'string') {
    var s = value.trim();
    return s === '' ? null : s;
  }
  return value;
}

/** Date -> string ISO 8601. Tanggal murni (tanpa jam) menjadi "yyyy-MM-dd". */
function serializeDate_(d, tz) {
  var time = Utilities.formatDate(d, tz, 'HH:mm:ss');
  if (time === '00:00:00') return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Angka dari number atau teks ("92,5", "1.200", "Rp 150.000"). Kembali null bila tidak bisa. */
function toNumber_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).trim();
  if (s === '') return null;
  s = s.replace(/[^0-9,.\-]/g, '');
  if (s === '' || s === '-') return null;
  if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
    // format Indonesia "1.234,5" atau US "1,234.5": pemisah terakhir = desimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.indexOf(',') !== -1) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1 || /^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}

/** Selisih hari kalender antara dua string "yyyy-MM-dd..." (b - a). null bila tidak valid. */
function dayDiff_(a, b) {
  var ma = /^(\d{4})-(\d{2})-(\d{2})/.exec(a || '');
  var mb = /^(\d{4})-(\d{2})-(\d{2})/.exec(b || '');
  if (!ma || !mb) return null;
  var ua = Date.UTC(+ma[1], +ma[2] - 1, +ma[3]);
  var ub = Date.UTC(+mb[1], +mb[2] - 1, +mb[3]);
  return Math.round((ub - ua) / 86400000);
}

/** Hitung Hari Sejak Roasting (bila kosong) dan Rasio (bila kosong) pada tiap seduhan. */
function enrichSeduhan_(biji, seduhan) {
  var roastById = {};
  biji.forEach(function (b) {
    var id = b[COL.BIJI_ID];
    if (id !== null && id !== undefined) roastById[id] = b[COL.ROAST_DATE] || null;
  });

  seduhan.forEach(function (s) {
    var hari = s[COL.HARI];
    if (hari === null || hari === undefined) {
      var roast = roastById[s[COL.BIJI_ID]];
      var diff = dayDiff_(roast, s[COL.SEDUH_DATE]);
      if (diff !== null && diff >= 0) {
        s[COL.HARI] = diff;
        s._hariDihitung = true;
      } else {
        s[COL.HARI] = null;
      }
    }
    if (s[COL.RATIO] === null || s[COL.RATIO] === undefined) {
      var dose = s[COL.DOSE], water = s[COL.WATER];
      if (typeof dose === 'number' && typeof water === 'number' && dose > 0) {
        s[COL.RATIO] = '1:' + (Math.round(water / dose * 10) / 10);
        s._rasioDihitung = true;
      }
    }
  });
}
