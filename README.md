# Jurnal Seduh Kopi

Dashboard statis jurnal seduh kopi (biji dan seduhan), di-host lewat GitHub Pages.

- `index.html` – dashboard (baca-saja, tampilan responsif untuk HP). Membaca `data.json` lewat `fetch`.
- `data.json` – data biji dan seduhan, bentuknya sama dengan keluaran `getData()` di Apps Script (`biji`, `seduhan`, `meta`).

## Memperbarui data

`data.json` **diperbarui setiap kali ada seduhan baru dicatat** (atau data biji berubah): ubah isinya, lalu `git commit` dan `git push` ke branch `main`. GitHub Pages akan membangun ulang situs dalam satu–dua menit, dan halaman selalu mengambil `data.json` terbaru.

Data awal di repo ini adalah **contoh fiktif** (diberi label `[CONTOH]`). Sumber aslinya adalah Google Sheet jurnal kopi (tab `Biji` dan `Seduhan`); logika transformasinya ada di `tools/Code.gs` dan dijalankan ulang oleh `tools/build-data.js`.

## Uji

```
npm i jsdom
node tests/test.js
```

Grafik memakai Chart.js dari CDN (butuh internet).
