'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const bcrypt   = require('bcryptjs');

const DB_PATH  = path.join(__dirname, '..', 'db', 'nyalain.db');

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- ADMIN
    CREATE TABLE IF NOT EXISTS admins (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      name       TEXT,
      role       TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- PACKAGES
    CREATE TABLE IF NOT EXISTS packages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      emoji       TEXT DEFAULT '📦',
      category    TEXT DEFAULT 'custom',
      price_from  INTEGER DEFAULT 0,
      price_label TEXT NOT NULL,
      badge       TEXT DEFAULT '',
      description TEXT DEFAULT '',
      features    TEXT DEFAULT '[]',
      wa_msg      TEXT DEFAULT '',
      sort_order  INTEGER DEFAULT 0,
      active      INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    -- ORDERS
    CREATE TABLE IF NOT EXISTS orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_code TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL,
      email         TEXT DEFAULT '',
      package_id    INTEGER REFERENCES packages(id),
      budget        TEXT DEFAULT '',
      notes         TEXT DEFAULT '',
      status        TEXT DEFAULT 'pending',
      timeline      TEXT DEFAULT '[]',
      admin_notes   TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    -- TESTIMONIALS
    CREATE TABLE IF NOT EXISTS testimonials (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      role       TEXT DEFAULT 'Pelanggan',
      rating     INTEGER DEFAULT 5,
      text       TEXT NOT NULL,
      approved   INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- BLOG POSTS
    CREATE TABLE IF NOT EXISTS posts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      slug       TEXT UNIQUE NOT NULL,
      excerpt    TEXT DEFAULT '',
      content    TEXT DEFAULT '',
      cover_url  TEXT DEFAULT '',
      tags       TEXT DEFAULT '[]',
      published  INTEGER DEFAULT 0,
      views      INTEGER DEFAULT 0,
      author_id  INTEGER REFERENCES admins(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- SETTINGS
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- WA TEMPLATES
    CREATE TABLE IF NOT EXISTS wa_templates (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger  TEXT UNIQUE NOT NULL,
      response TEXT NOT NULL,
      active   INTEGER DEFAULT 1
    );

    -- INDEXES
    CREATE INDEX IF NOT EXISTS idx_orders_code    ON orders(tracking_code);
    CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_posts_slug     ON posts(slug);
    CREATE INDEX IF NOT EXISTS idx_posts_pub      ON posts(published);
  `);
}

// ── Seed helpers ──
function seedIfEmpty() {
  const d = getDb();

  // Admin
  const adminCount = d.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (!adminCount) {
    const hash = bcrypt.hashSync('nyalain2025', 10);
    d.prepare('INSERT INTO admins (username,password,name,role) VALUES (?,?,?,?)').run('admin', hash, 'Administrator', 'superadmin');
    console.log('✅ Admin default dibuat: admin / nyalain2025');
  }

  // Settings
  const defaults = {
    site_name:     'Nyala.in',
    tagline:       'Rakitan PC Custom Solo',
    phone:         '+62 812-3456-7890',
    whatsapp:      '6281234567890',
    email:         'hello@nyala.in',
    address:       'Solo, Jawa Tengah, Indonesia',
    instagram:     'https://instagram.com/nyala.in',
    youtube:       'https://youtube.com/@nyalain',
    hours:         'Senin–Sabtu: 09.00–20.00 WIB',
    meta_desc:     'Jasa rakitan PC custom terpercaya di Solo.',
    wa_greeting:   'Halo! Selamat datang di Nyala.in 🔥\nKetik *menu* untuk melihat pilihan layanan kami.',
  };
  const insSet = d.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  Object.entries(defaults).forEach(([k,v]) => insSet.run(k, v));

  // Packages
  const pkgCount = d.prepare('SELECT COUNT(*) as c FROM packages').get().c;
  if (!pkgCount) {
    const ins = d.prepare('INSERT INTO packages (name,emoji,category,price_from,price_label,badge,description,features,wa_msg,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
    [
      ['Paket Gaming','🎮','gaming',6000000,'Mulai Rp 6 Jutaan','','Performa gaming 60fps+ hingga 144fps. Ideal untuk game kompetitif & AAA title.',JSON.stringify(['Processor Ryzen 5 / Core i5 Gen terbaru','GPU GTX 1650 / RX 6600 ke atas','RAM 16GB DDR4 Dual Channel','SSD 512GB NVMe PCIe','Konsultasi build gratis','Garansi komponen resmi']),'Halo, saya tertarik Paket Gaming',1],
      ['Paket Desain','🎨','design',8000000,'Mulai Rp 8 Jutaan','POPULER','Optimal untuk Photoshop, Premiere Pro & rendering 3D profesional.',JSON.stringify(['Processor Ryzen 7 / Core i7 Gen terbaru','GPU RTX 3060 / RX 6700 ke atas','RAM 32GB DDR4 Dual Channel','SSD 1TB NVMe + HDD 2TB','Konsultasi build gratis','Garansi komponen resmi']),'Halo, saya tertarik Paket Desain',2],
      ['Paket Kantor','💼','office',4000000,'Mulai Rp 4 Jutaan','','Efisien & handal untuk produktivitas kerja harian tanpa gangguan.',JSON.stringify(['Processor Ryzen 3 / Core i3 Gen terbaru','Integrated GPU / GPU Entry level','RAM 8GB DDR4','SSD 256GB NVMe','Konsultasi build gratis','Garansi komponen resmi']),'Halo, saya tertarik Paket Kantor',3],
      ['Paket Custom','⚙️','custom',0,'Harga Fleksibel','','Spesifikasi 100% sesuai keinginan. Bebas pilih komponen, kami rakit sempurna.',JSON.stringify(['Bebas pilih semua komponen','Konsultasi mendalam tanpa biaya','Cek kompatibilitas lengkap','Cable management rapi & estetik','Foto & video proses rakit','After-sales support']),'Halo, saya mau konsultasi paket custom',4],
    ].forEach(p => ins.run(...p));
    console.log('✅ 4 paket default dibuat');
  }

  // Testimonials
  const testiCount = d.prepare('SELECT COUNT(*) as c FROM testimonials').get().c;
  if (!testiCount) {
    const ins = d.prepare('INSERT INTO testimonials (name,role,rating,text,approved) VALUES (?,?,?,?,1)');
    [
      ['Rizky Pratama','Gamer, Solo',5,'Rakitan PC gaming-ku dari Nyala.in kenceng banget! Bisa mainin game AAA tanpa lag sama sekali. Harga juga pas di kantong, highly recommended!'],
      ['Dinda Ayu','Content Creator, Surakarta',5,'Butuh PC editing buat konten YouTube, dikonsultasikan dulu dan hasilnya luar biasa! Render video 4K sudah sangat lancar. Terima kasih Nyala.in!'],
      ['Budi Santoso','Owner CV Maju Jaya, Solo',5,'Beli PC kantor 5 unit sekaligus. Prosesnya cepat, pengiriman tepat waktu, dan garansi ada semua. Cocok banget buat kebutuhan perusahaan kecil.'],
    ].forEach(t => ins.run(...t));
    console.log('✅ 3 testimoni default dibuat');
  }

  // Blog posts
  const postCount = d.prepare('SELECT COUNT(*) as c FROM posts').get().c;
  if (!postCount) {
    const ins = d.prepare('INSERT INTO posts (title,slug,excerpt,content,tags,published,author_id) VALUES (?,?,?,?,?,1,1)');
    ins.run(
      'Tips Memilih GPU untuk PC Gaming 2025',
      'tips-memilih-gpu-pc-gaming-2025',
      'Bingung pilih GPU? Kami rangkum rekomendasi GPU terbaik untuk berbagai budget di 2025.',
      `# Tips Memilih GPU untuk PC Gaming 2025\n\nMemilih GPU (Graphics Processing Unit) adalah keputusan paling krusial saat merakit PC gaming. Berikut panduan lengkap dari tim Nyala.in.\n\n## Budget 3–5 Juta\n\nDi rentang ini, **RX 6600** dan **GTX 1660 Super** adalah pilihan terbaik. Keduanya mampu menjalankan game AAA di 1080p dengan setting high.\n\n## Budget 6–9 Juta\n\n**RTX 3060** menjadi raja di segmen ini. VRAM 12GB dan dukungan DLSS 3 membuatnya sangat future-proof.\n\n## Budget 10 Juta ke atas\n\n**RTX 4070** adalah sweet spot performa vs harga. Mampu 1440p ultra 60fps+ di semua game terkini.\n\n## Tips Tambahan\n\n- Sesuaikan GPU dengan resolusi monitor\n- Cek kompatibilitas daya (PSU)\n- Pertimbangkan upgrade path ke depan\n\nButuh rekomendasi personal? **Konsultasi gratis** dengan tim kami via WhatsApp!`,
      JSON.stringify(['GPU','Gaming','Tips']),
    );
    ins.run(
      'Perbedaan DDR4 vs DDR5: Mana yang Lebih Baik?',
      'ddr4-vs-ddr5-mana-lebih-baik',
      'DDR5 sudah mulai terjangkau. Tapi apakah worth it untuk upgrade dari DDR4? Simak perbandingan lengkapnya.',
      `# DDR4 vs DDR5: Mana yang Lebih Baik untuk 2025?\n\nPertanyaan ini sering muncul saat pelanggan kami mau merakit PC baru. Jawabannya: **tergantung kebutuhan**.\n\n## DDR4 – Masih Relevan\n\n- Harga lebih terjangkau\n- Ekosistem matang & stabil\n- Cocok untuk platform AM4 (Ryzen 5000) & LGA1200\n- Performa gaming hampir identik dengan DDR5\n\n## DDR5 – Masa Depan\n\n- Bandwidth lebih tinggi (berguna untuk editing & rendering)\n- Dibutuhkan untuk platform AM5 (Ryzen 7000+) & LGA1700\n- Harga makin terjangkau di 2025\n- Future-proof untuk 3–5 tahun ke depan\n\n## Kesimpulan\n\nJika budget terbatas & platform AM4 → **DDR4**\nJika build baru platform terbaru → **DDR5**\n\nKonsultasikan build PC-mu dengan kami untuk rekomendasi terbaik!`,
      JSON.stringify(['RAM','DDR5','Tips']),
    );
    console.log('✅ 2 blog post default dibuat');
  }

  // WA Templates
  const waCount = d.prepare('SELECT COUNT(*) as c FROM wa_templates').get().c;
  if (!waCount) {
    const ins = d.prepare('INSERT INTO wa_templates (trigger,response) VALUES (?,?)');
    [
      ['menu',     '🔥 *Menu Layanan Nyala.in*\n\n1️⃣ *paket* - Lihat paket harga\n2️⃣ *gaming* - Info PC Gaming\n3️⃣ *desain* - Info PC Desain\n4️⃣ *kantor* - Info PC Kantor\n5️⃣ *harga* - Estimasi harga\n6️⃣ *lokasi* - Alamat & jam buka\n7️⃣ *promo* - Promo aktif\n\nKetik angka atau kata kunci di atas!'],
      ['paket',    '📦 *Paket Nyala.in*\n\n🎮 *Gaming* – Mulai Rp 6 Jutaan\n🎨 *Desain* – Mulai Rp 8 Jutaan\n💼 *Kantor* – Mulai Rp 4 Jutaan\n⚙️ *Custom* – Harga Fleksibel\n\nSemua paket sudah termasuk:\n✅ Ongkos rakit\n✅ Konsultasi gratis\n✅ Garansi komponen resmi\n\nMau konsultasi lebih lanjut? Ketik jenis paket yang diminati!'],
      ['gaming',   '🎮 *Paket Gaming Nyala.in*\n\nHarga mulai *Rp 6 Jutaan*\n\nSpesifikasi contoh:\n• CPU: Ryzen 5 7600 / Core i5-13600K\n• GPU: RX 6600 / RTX 3060\n• RAM: 16GB DDR4/DDR5\n• SSD: 512GB NVMe\n\nSiap main game apa? Beritahu kami & kami buatkan build terbaik! 🕹️'],
      ['desain',   '🎨 *Paket Desain Nyala.in*\n\nHarga mulai *Rp 8 Jutaan*\n\nSpesifikasi contoh:\n• CPU: Ryzen 7 7700 / Core i7-13700K\n• GPU: RTX 3060 12GB\n• RAM: 32GB DDR4\n• SSD: 1TB NVMe + HDD 2TB\n\nCocok untuk Premiere, Photoshop, After Effects, Blender. Mau render lebih cepat? 🚀'],
      ['kantor',   '💼 *Paket Kantor Nyala.in*\n\nHarga mulai *Rp 4 Jutaan*\n\nSpesifikasi contoh:\n• CPU: Ryzen 3 4100 / Core i3-12100\n• GPU: Integrated\n• RAM: 8GB DDR4\n• SSD: 256GB NVMe\n\nCocok untuk Office, Zoom, browsing, & multitasking ringan. Butuh berapa unit? 📋'],
      ['harga',    '💰 *Estimasi Harga*\n\n• PC Kantor: Rp 4–6 Juta\n• PC Gaming Entry: Rp 6–8 Juta\n• PC Gaming Mid: Rp 8–12 Juta\n• PC Gaming High: Rp 12–20 Juta+\n• PC Desain: Rp 8–15 Juta\n• PC Custom: Sesuai permintaan\n\n_Harga dapat berubah sesuai ketersediaan komponen_\nMau konsultasi lebih detail? 😊'],
      ['lokasi',   '📍 *Lokasi Nyala.in*\n\nSolo, Jawa Tengah, Indonesia\n\n⏰ Jam Buka:\nSenin–Sabtu: 09.00–20.00 WIB\n\n📱 WhatsApp: +62 812-3456-7890\n📧 Email: hello@nyala.in\n\nBisa juga konsultasi & pesan via chat ini! 🔥'],
    ].forEach(([trigger, response]) => ins.run(trigger, response));
    console.log('✅ WA templates default dibuat');
  }

  console.log('✅ Database ready!');
}

module.exports = { getDb, seedIfEmpty };
