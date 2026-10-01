# Pasang backend (Apps Script) – ±5 menit

1. Buka Google Sheet jurnal → **Extensions (Ekstensi) › Apps Script**.
2. Ganti isi `Code.gs` dengan isi `backend/Code.gs`. Di **Project Settings** centang *Show "appsscript.json" manifest file in editor*, lalu ganti isi `appsscript.json` dengan `backend/appsscript.json`. Simpan.
3. **Project Settings › Script Properties › Add script property**, tambahkan dua:
   - `ANTHROPIC_API_KEY` = kunci API Anthropic-mu
   - `APP_PIN` = PIN rahasia pilihanmu (dipakai di halaman Catat)
4. **Deploy › New deployment › Select type: Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy**, setujui izin akses (Sheets + koneksi eksternal), lalu **salin URL** web app (berakhiran `/exec`).
5. Tempel URL itu ke `BACKEND_URL` di bagian atas `index.html` (lalu commit & push), **atau** kirim URL-nya ke asisten agar dipasang.
6. Uji: buka `<URL>?action=data` di browser → harus tampil JSON data. Lalu buka dasbor › **Catat**.

**Penting:** setelah mengubah kode `Code.gs`, buat versi baru: **Deploy › Manage deployments › ✏️ Edit › Version: New version › Deploy**. URL tetap sama. Mengubah Script Properties tidak perlu deploy ulang.

Catatan: jangan bagikan `ANTHROPIC_API_KEY` dan `APP_PIN`; keduanya hanya ada di Script Properties, bukan di repo. Batas pemakaian AI: 30 permintaan/jam.
