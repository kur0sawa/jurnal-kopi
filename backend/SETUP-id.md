# Pasang backend (Apps Script) – ±5 menit

1. Buka Google Sheet jurnal → **Extensions (Ekstensi) › Apps Script**.
2. Ganti isi `Code.gs` dengan isi `backend/Code.gs`. Di **Project Settings** centang *Show "appsscript.json" manifest file in editor*, lalu ganti isi `appsscript.json` dengan `backend/appsscript.json`. Simpan.
3. **Project Settings › Script Properties › Add script property**, tambahkan:
   - `AI_API_KEY` = kunci API Sumopod-mu (berawalan `sk-...`)
   - `APP_PIN` = PIN rahasia pilihanmu (dipakai di halaman Catat)
   - *(opsional)* `AI_BASE_URL` (default `https://ai.sumopod.com/v1`), `MODEL_PARSE` dan `MODEL_ANALYZE` (default keduanya `claude-haiku-4-5`; ganti bila akunmu memakai model lain, mis. `gpt-4o-mini`)
   - *(opsional, bila ingin Anthropic langsung)* `AI_PROVIDER` = `anthropic` dan `ANTHROPIC_API_KEY`. Bila hanya `ANTHROPIC_API_KEY` yang diisi, otomatis memakai Anthropic.
4. **Beri izin koneksi eksternal:** di editor pilih fungsi **`izinkan`** (menu dropdown di atas) › **Run**, lalu setujui izin yang muncul (Review permissions › pilih akun › Advanced › Allow). Cukup sekali.
5. **Deploy › New deployment › Select type: Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy**, setujui izin akses (Sheets + koneksi eksternal), lalu **salin URL** web app (berakhiran `/exec`).
6. Tempel URL itu ke `BACKEND_URL` di bagian atas `index.html` (lalu commit & push), **atau** kirim URL-nya ke asisten agar dipasang.
7. Uji: buka `<URL>?action=data` di browser → harus tampil JSON data. Lalu buka dasbor › **Catat**.

**Cek model yang boleh dipakai kunci-mu:** kirim POST ke URL `/exec` dengan body teks `{"action":"models","pin":"PIN-MU"}` (mis. `curl -L -X POST -H "Content-Type: text/plain" -d '{"action":"models","pin":"PIN-MU"}' <URL>`). Hasilnya daftar id model; isi `MODEL_PARSE` / `MODEL_ANALYZE` dengan salah satunya. Bila pesan galat menyebut 401/403/404, detail dari Sumopod ikut ditampilkan.

Opsional bila gateway menolak parameter: `AI_JSON_MODE` = `off` (tanpa response_format), `AI_TEMPERATURE` = `off` (tanpa temperature).

**Penting:** setelah mengubah kode `Code.gs` (atau menambah izin), buat versi baru: **Deploy › Manage deployments › ✏️ Edit › Version: New version › Deploy**. URL tetap sama. Mengubah Script Properties tidak perlu deploy ulang.

Catatan: jangan bagikan `AI_API_KEY` (atau `ANTHROPIC_API_KEY`) dan `APP_PIN`; keduanya hanya ada di Script Properties, bukan di repo. Batas pemakaian AI: 30 permintaan/jam.
