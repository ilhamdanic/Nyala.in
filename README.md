# 🔥 Nyala.in – Fullstack Website v2.0

Website rakitan PC custom Solo — fullstack dengan Express + SQLite + Admin Panel lengkap.

## ✨ Fitur Lengkap

| Fitur | Keterangan |
|-------|------------|
| 🖥️ Frontend | Website publik modern (dark theme, animasi smooth) |
| 📦 Paket Dinamis | Kelola paket & harga dari admin panel |
| 🛒 Form Order | Pelanggan bisa pesan & lacak pesanan |
| ⭐ Testimoni | Submit + moderasi dari admin |
| 📝 Blog/Artikel | Editor Markdown + preview live |
| 💬 WA Auto-reply | Template balasan otomatis + simulator |
| ⚙️ Admin Panel | Dashboard lengkap dengan statistik |
| 🔐 Auth JWT | Login admin dengan token 7 hari |
| 🌐 REST API | API lengkap untuk integrasi |

---

## 🚀 Setup & Jalankan

### 1. Install Node.js (jika belum ada)
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cek versi (harus >= 18)
node --version
```

### 2. Install dependencies
```bash
cd nyalain_v2
npm install
```

### 3. Konfigurasi environment
```bash
cp .env.example .env
# Edit .env — WAJIB ganti JWT_SECRET!
nano .env
```

### 4. Jalankan
```bash
npm start
# atau untuk development (auto-reload):
npm run dev
```

### 5. Buka browser
- **Website**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin
- **API Docs**: lihat bagian API di bawah

---

## 🔐 Login Admin Default

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `nyalain2025` |

> ⚠️ **WAJIB** ganti password setelah pertama login di menu **Pengaturan**!

---

## 📁 Struktur Project

```
nyalain_v2/
├── .env.example          # Template environment variables
├── package.json
├── README.md
├── db/
│   └── nyalain.db        # SQLite database (auto-dibuat saat pertama run)
├── src/
│   ├── server.js         # Main Express server + semua route API
│   └── db.js             # Database layer (schema, seed, helpers)
├── public/
│   └── index.html        # Frontend website utama
└── admin/
    └── index.html        # Admin panel SPA
```

---

## 🌐 API Endpoints

### Public (tanpa auth)
```
GET  /api/packages              → Daftar paket aktif
GET  /api/testimonials          → Testimoni yang sudah disetujui
GET  /api/settings              → Informasi toko publik
GET  /api/posts                 → List blog post
GET  /api/posts/:slug           → Detail blog post (+ increment views)
POST /api/orders                → Buat pesanan baru
GET  /api/orders/track/:code    → Lacak pesanan dengan kode
POST /api/testimonials          → Submit testimoni (perlu moderasi)
POST /api/webhook/whatsapp      → WhatsApp webhook (auto-reply)
GET  /api/webhook/whatsapp      → WhatsApp webhook verification
```

### Admin (butuh header: `Authorization: Bearer <token>`)
```
POST /api/auth/login                          → Login, dapat token
GET  /api/auth/me                             → Info user login

GET  /api/admin/dashboard                     → Stats dashboard

GET  /api/admin/packages                      → Semua paket
POST /api/admin/packages                      → Tambah paket
PUT  /api/admin/packages/:id                  → Edit paket
DEL  /api/admin/packages/:id                  → Hapus paket

GET  /api/admin/orders                        → List pesanan (filter, search, paginasi)
PUT  /api/admin/orders/:id/status             → Update status pesanan
PUT  /api/admin/orders/:id/notes              → Update catatan internal

GET  /api/admin/testimonials                  → Semua testimoni
PUT  /api/admin/testimonials/:id/approve      → Setujui testimoni
PUT  /api/admin/testimonials/:id/reject       → Tolak testimoni
DEL  /api/admin/testimonials/:id              → Hapus testimoni

GET  /api/admin/posts                         → Semua artikel
GET  /api/admin/posts/:id                     → Detail artikel
POST /api/admin/posts                         → Buat artikel baru
PUT  /api/admin/posts/:id                     → Edit artikel
DEL  /api/admin/posts/:id                     → Hapus artikel

GET  /api/admin/wa-templates                  → Semua template WA
POST /api/admin/wa-templates                  → Tambah template
PUT  /api/admin/wa-templates/:id              → Edit template
DEL  /api/admin/wa-templates/:id              → Hapus template

PUT  /api/admin/settings                      → Update semua settings
```

---

## 💬 Integrasi WhatsApp Auto-reply

### Menggunakan Twilio WhatsApp
1. Daftar di [twilio.com](https://twilio.com) dan aktifkan WhatsApp Sandbox
2. Set webhook URL ke: `https://domain-kamu.com/api/webhook/whatsapp`
3. Set `WA_VERIFY_TOKEN` di `.env` sesuai verify token Twilio

### Menggunakan WA Business API (Meta)
1. Buat app di [developers.facebook.com](https://developers.facebook.com)
2. Aktifkan WhatsApp Business API
3. Set webhook URL: `https://domain-kamu.com/api/webhook/whatsapp`
4. Set verify token sesuai `WA_VERIFY_TOKEN` di `.env`

### Format request webhook
```json
POST /api/webhook/whatsapp
{ "from": "6281234567890", "body": "menu" }
```

### Format response
```json
{ "success": true, "reply": "🔥 Menu Layanan Nyala.in...", "from": "..." }
```

---

## 🌍 Deploy ke Production

### Railway (Paling Mudah — Gratis)
```bash
# 1. Push ke GitHub
git init && git add . && git commit -m "nyalain v2"
git remote add origin https://github.com/username/nyalain.git
git push -u origin main

# 2. Buka railway.app → New Project → Deploy from GitHub
# 3. Add environment variables di Railway dashboard:
#    JWT_SECRET = string_random_panjang_aman
#    NODE_ENV   = production
#    PORT       = 3000
```

### VPS Ubuntu (Full Control)
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx

# Upload project
scp -r nyalain_v2/ user@vps-ip:/var/www/

# Setup
cd /var/www/nyalain_v2
npm install --production
cp .env.example .env && nano .env  # Isi JWT_SECRET, dll

# Jalankan dengan PM2
npm install -g pm2
pm2 start src/server.js --name nyalain
pm2 save && pm2 startup

# Nginx reverse proxy
sudo nano /etc/nginx/sites-available/nyalain
```

**Nginx config:**
```nginx
server {
    listen 80;
    server_name domain-kamu.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nyalain /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS dengan Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d domain-kamu.com
```

### Render.com
```
Build Command : npm install
Start Command : node src/server.js
Environment   : NODE_ENV=production, JWT_SECRET=..., PORT=10000
```

---

## 🔧 Customization

- **Logo**: Ganti file `public/images/logo.png` dan `admin/images/logo.png`
- **Warna**: Edit CSS variable di `public/index.html` (`:root { --orange, --red, dll }`)
- **Konten**: Edit langsung dari Admin Panel → Pengaturan
- **Paket**: Admin Panel → Paket Harga
- **WA Templates**: Admin Panel → WA Auto-reply

---

Made with 🔥 in Solo, Jawa Tengah  
© 2025 Nyala.in
