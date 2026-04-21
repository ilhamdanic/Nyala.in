'use strict';
require('dotenv').config();
const express      = require('express');
const path         = require('path');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');
const bcrypt       = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const { marked }   = require('marked');
const slugify      = require('slugify');
const { getDb, seedIfEmpty } = require('./db');

// ── Init ──
const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nyalain_dev_secret_change_in_production';

// ── Middleware ──
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rate limiting
const apiLimiter  = rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10,  standardHeaders: true, message: { error: 'Terlalu banyak percobaan login' } });
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);

// ── Helpers ──
function ok(res, data, status=200)  { res.status(status).json({ success:true,  ...data }); }
function err(res, msg, status=400)  { res.status(status).json({ success:false, error: msg }); }
function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { err(res, e.array()[0].msg, 400); return false; }
  return true;
}
function genCode() {
  return 'NYL-' + Date.now().toString(36).toUpperCase().slice(-6);
}
function slugify_(str) {
  return slugify(str, { lower:true, strict:true, locale:'id' });
}
function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : '';
}

// ── Auth middleware ──
function authRequired(req, res, next) {
  const token = (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return err(res, 'Unauthorized', 401);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { err(res, 'Token invalid atau kadaluarsa', 401); }
}

// ══════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════

// ── Settings public ──
app.get('/api/settings', (req,res) => {
  const keys = ['site_name','tagline','phone','whatsapp','email','address','instagram','youtube','hours','meta_desc'];
  const rows = getDb().prepare(`SELECT key,value FROM settings WHERE key IN (${keys.map(()=>'?').join(',')})`).all(...keys);
  const s = Object.fromEntries(rows.map(r=>[r.key,r.value]));
  ok(res, { settings:s });
});

// ── Packages public ──
app.get('/api/packages', (req,res) => {
  const pkgs = getDb().prepare('SELECT * FROM packages WHERE active=1 ORDER BY sort_order').all();
  ok(res, { packages: pkgs.map(parsePkg) });
});

// ── Testimonials public ──
app.get('/api/testimonials', (req,res) => {
  const rows = getDb().prepare('SELECT * FROM testimonials WHERE approved=1 ORDER BY created_at DESC').all();
  ok(res, { testimonials: rows });
});

// ── Blog public ──
app.get('/api/posts', (req,res) => {
  const page  = Math.max(1, +(req.query.page||1));
  const limit = +(req.query.limit||6);
  const offset = (page-1)*limit;
  const tag   = req.query.tag;
  let where = 'WHERE published=1';
  const params = [];
  if (tag) { where += ' AND tags LIKE ?'; params.push(`%${tag}%`); }
  const total = getDb().prepare(`SELECT COUNT(*) as c FROM posts ${where}`).get(...params).c;
  const posts = getDb().prepare(`SELECT id,title,slug,excerpt,cover_url,tags,views,created_at FROM posts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  ok(res, { posts: posts.map(p=>({...p, tags:JSON.parse(p.tags||'[]')})), total, page, pages: Math.ceil(total/limit) });
});
app.get('/api/posts/:slug', (req,res) => {
  const post = getDb().prepare('SELECT * FROM posts WHERE slug=? AND published=1').get(req.params.slug);
  if (!post) return err(res, 'Post tidak ditemukan', 404);
  // increment views
  getDb().prepare('UPDATE posts SET views=views+1 WHERE id=?').run(post.id);
  ok(res, { post: { ...post, tags:JSON.parse(post.tags||'[]'), html: marked(post.content||'') } });
});

// ── Orders ──
app.post('/api/orders',
  body('name').trim().notEmpty().withMessage('Nama wajib diisi'),
  body('phone').trim().notEmpty().withMessage('Nomor WhatsApp wajib diisi'),
  (req,res) => {
    if (!validate(req,res)) return;
    const { name, phone, email='', package_id='', budget='', notes='' } = req.body;
    const code  = genCode();
    const timeline = JSON.stringify([{ status:'pending', note:'Pesanan diterima & menunggu konfirmasi', time: new Date().toISOString() }]);
    const row = getDb().prepare(
      'INSERT INTO orders (tracking_code,name,phone,email,package_id,budget,notes,timeline) VALUES (?,?,?,?,?,?,?,?)'
    ).run(code, name, phone, email, package_id||null, budget, notes, timeline);
    ok(res, {
      order: { id:row.lastInsertRowid, tracking_code:code, status:'pending' }
    }, 201);
  }
);

app.get('/api/orders/track/:code', (req,res) => {
  const o = getDb().prepare('SELECT * FROM orders WHERE tracking_code=?').get(req.params.code.toUpperCase());
  if (!o) return err(res, 'Kode pesanan tidak ditemukan', 404);
  let pkg = null;
  if (o.package_id) pkg = getDb().prepare('SELECT name,emoji,price_label FROM packages WHERE id=?').get(o.package_id);
  ok(res, { order:{
    tracking_code: o.tracking_code,
    name: o.name,
    status: o.status,
    package: pkg ? `${pkg.emoji} ${pkg.name}` : (o.budget ? 'Custom – '+o.budget : 'Custom'),
    timeline: JSON.parse(o.timeline||'[]'),
    created_at: o.created_at,
  }});
});

// ── Submit testimonial ──
app.post('/api/testimonials',
  body('name').trim().notEmpty().withMessage('Nama wajib'),
  body('text').trim().isLength({min:10}).withMessage('Ulasan minimal 10 karakter'),
  (req,res) => {
    if (!validate(req,res)) return;
    const { name, role='Pelanggan', rating=5, text } = req.body;
    getDb().prepare('INSERT INTO testimonials (name,role,rating,text) VALUES (?,?,?,?)').run(name, role, Math.min(5,Math.max(1,+rating)), text);
    ok(res, { message:'Terima kasih! Ulasan kamu sedang diverifikasi.' }, 201);
  }
);

// ── WhatsApp Webhook ──
app.post('/api/webhook/whatsapp', (req,res) => {
  const { from, body:msg='' } = req.body;
  const text  = (msg||'').toLowerCase().trim();
  const tpls  = getDb().prepare('SELECT * FROM wa_templates WHERE active=1').all();
  const match = tpls.find(t => text.includes(t.trigger));
  const greeting = getSetting('wa_greeting');
  const reply = match ? match.response : greeting;
  ok(res, { reply, from });
});

// WhatsApp verify (GET) – Twilio / WA Business webhook verification
app.get('/api/webhook/whatsapp', (req,res) => {
  const mode  = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WA_VERIFY_TOKEN || 'nyalain_wa_verify';
  if (mode==='subscribe' && token===verifyToken) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// ══════════════════════════════════════════════
// ADMIN API  (auth required)
// ══════════════════════════════════════════════

// ── Login ──
app.post('/api/auth/login', async (req,res) => {
  const { username, password } = req.body;
  if (!username || !password) return err(res, 'Username & password wajib');
  const admin = getDb().prepare('SELECT * FROM admins WHERE username=?').get(username);
  if (!admin || !(await bcrypt.compare(password, admin.password))) return err(res, 'Username atau password salah', 401);
  const token = jwt.sign({ id:admin.id, username:admin.username, role:admin.role }, JWT_SECRET, { expiresIn:'7d' });
  ok(res, { token, user:{ id:admin.id, username:admin.username, name:admin.name, role:admin.role } });
});
app.get('/api/auth/me', authRequired, (req,res) => ok(res, { user: req.user }));

// ── Dashboard ──
app.get('/api/admin/dashboard', authRequired, (req,res) => {
  const d = getDb();
  const orderStats  = d.prepare("SELECT status, COUNT(*) as c FROM orders GROUP BY status").all();
  const statsMap    = Object.fromEntries(orderStats.map(r=>[r.status, r.c]));
  const recentOrders= d.prepare("SELECT o.*,p.name as pkg_name,p.emoji FROM orders o LEFT JOIN packages p ON p.id=o.package_id ORDER BY o.created_at DESC LIMIT 8").all();
  ok(res, {
    stats: {
      orders_total:   d.prepare('SELECT COUNT(*) as c FROM orders').get().c,
      orders_pending: statsMap.pending  || 0,
      orders_proc:    statsMap.processing||0,
      orders_testing: statsMap.testing  || 0,
      orders_done:    statsMap.done     || 0,
      orders_cancel:  statsMap.cancelled|| 0,
      packages:       d.prepare('SELECT COUNT(*) as c FROM packages WHERE active=1').get().c,
      testi_pending:  d.prepare('SELECT COUNT(*) as c FROM testimonials WHERE approved=0').get().c,
      posts_total:    d.prepare('SELECT COUNT(*) as c FROM posts').get().c,
    },
    recent_orders: recentOrders.map(o=>({...o, timeline:JSON.parse(o.timeline||'[]')})),
  });
});

// ── Packages CRUD ──
app.get('/api/admin/packages', authRequired, (req,res) => {
  const pkgs = getDb().prepare('SELECT * FROM packages ORDER BY sort_order').all();
  ok(res, { packages: pkgs.map(parsePkg) });
});
app.post('/api/admin/packages', authRequired,
  body('name').trim().notEmpty().withMessage('Nama wajib'),
  body('price_label').trim().notEmpty().withMessage('Label harga wajib'),
  (req,res) => {
    if (!validate(req,res)) return;
    const { name,emoji='📦',category='custom',price_from=0,price_label,badge='',description='',features=[],wa_msg='',sort_order=99,active=true } = req.body;
    const row = getDb().prepare(
      'INSERT INTO packages (name,emoji,category,price_from,price_label,badge,description,features,wa_msg,sort_order,active) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(name,emoji,category,+price_from,price_label,badge,description,JSON.stringify(features),wa_msg,+sort_order,active?1:0);
    const pkg = getDb().prepare('SELECT * FROM packages WHERE id=?').get(row.lastInsertRowid);
    ok(res, { package: parsePkg(pkg) }, 201);
  }
);
app.put('/api/admin/packages/:id', authRequired, (req,res) => {
  const { name,emoji,category,price_from,price_label,badge,description,features,wa_msg,sort_order,active } = req.body;
  const existing = getDb().prepare('SELECT * FROM packages WHERE id=?').get(req.params.id);
  if (!existing) return err(res,'Paket tidak ditemukan',404);
  getDb().prepare(
    'UPDATE packages SET name=?,emoji=?,category=?,price_from=?,price_label=?,badge=?,description=?,features=?,wa_msg=?,sort_order=?,active=?,updated_at=datetime("now") WHERE id=?'
  ).run(
    name||existing.name, emoji||existing.emoji, category||existing.category,
    price_from!=null?+price_from:existing.price_from, price_label||existing.price_label,
    badge!=null?badge:existing.badge, description||existing.description,
    features?JSON.stringify(features):existing.features, wa_msg||existing.wa_msg,
    sort_order!=null?+sort_order:existing.sort_order,
    active!=null?(active?1:0):existing.active, req.params.id
  );
  ok(res, { package: parsePkg(getDb().prepare('SELECT * FROM packages WHERE id=?').get(req.params.id)) });
});
app.delete('/api/admin/packages/:id', authRequired, (req,res) => {
  getDb().prepare('DELETE FROM packages WHERE id=?').run(req.params.id);
  ok(res, { deleted:true });
});

// ── Orders ──
app.get('/api/admin/orders', authRequired, (req,res) => {
  const { status, q, page=1, limit=20 } = req.query;
  let where='', params=[];
  if (status) { where='WHERE o.status=?'; params.push(status); }
  if (q) {
    where = where ? where+' AND (o.name LIKE ? OR o.tracking_code LIKE ? OR o.phone LIKE ?)' : 'WHERE (o.name LIKE ? OR o.tracking_code LIKE ? OR o.phone LIKE ?)';
    params.push(`%${q}%`,`%${q}%`,`%${q}%`);
  }
  const offset = (Math.max(1,+page)-1)*(+limit);
  const total  = getDb().prepare(`SELECT COUNT(*) as c FROM orders o ${where}`).get(...params).c;
  const rows   = getDb().prepare(`SELECT o.*,p.name as pkg_name,p.emoji as pkg_emoji FROM orders o LEFT JOIN packages p ON p.id=o.package_id ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  ok(res, { orders: rows.map(o=>({...o, timeline:JSON.parse(o.timeline||'[]')})), total, page:+page, pages:Math.ceil(total/+limit) });
});
app.put('/api/admin/orders/:id/status', authRequired,
  body('status').isIn(['pending','processing','testing','done','cancelled']).withMessage('Status tidak valid'),
  (req,res) => {
    if (!validate(req,res)) return;
    const { status, note='' } = req.body;
    const o = getDb().prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!o) return err(res,'Order tidak ditemukan',404);
    const timeline = JSON.parse(o.timeline||'[]');
    timeline.push({ status, note, time: new Date().toISOString() });
    getDb().prepare('UPDATE orders SET status=?,timeline=?,admin_notes=?,updated_at=datetime("now") WHERE id=?').run(status, JSON.stringify(timeline), note, req.params.id);
    ok(res, { order: {...getDb().prepare('SELECT * FROM orders WHERE id=?').get(req.params.id), timeline} });
  }
);
app.put('/api/admin/orders/:id/notes', authRequired, (req,res) => {
  getDb().prepare('UPDATE orders SET admin_notes=? WHERE id=?').run(req.body.notes||'', req.params.id);
  ok(res, { updated:true });
});

// ── Testimonials ──
app.get('/api/admin/testimonials', authRequired, (req,res) => {
  const rows = getDb().prepare('SELECT * FROM testimonials ORDER BY created_at DESC').all();
  ok(res, { testimonials: rows });
});
app.put('/api/admin/testimonials/:id/approve', authRequired, (req,res) => {
  getDb().prepare('UPDATE testimonials SET approved=1 WHERE id=?').run(req.params.id);
  ok(res, { approved:true });
});
app.put('/api/admin/testimonials/:id/reject', authRequired, (req,res) => {
  getDb().prepare('UPDATE testimonials SET approved=0 WHERE id=?').run(req.params.id);
  ok(res, { rejected:true });
});
app.delete('/api/admin/testimonials/:id', authRequired, (req,res) => {
  getDb().prepare('DELETE FROM testimonials WHERE id=?').run(req.params.id);
  ok(res, { deleted:true });
});

// ── Blog CRUD ──
app.get('/api/admin/posts', authRequired, (req,res) => {
  const rows = getDb().prepare('SELECT id,title,slug,excerpt,tags,published,views,created_at FROM posts ORDER BY created_at DESC').all();
  ok(res, { posts: rows.map(p=>({...p,tags:JSON.parse(p.tags||'[]')})) });
});
app.get('/api/admin/posts/:id', authRequired, (req,res) => {
  const post = getDb().prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post) return err(res,'Post tidak ditemukan',404);
  ok(res, { post: {...post, tags:JSON.parse(post.tags||'[]')} });
});
app.post('/api/admin/posts', authRequired,
  body('title').trim().notEmpty().withMessage('Judul wajib'),
  (req,res) => {
    if (!validate(req,res)) return;
    const { title, excerpt='', content='', cover_url='', tags=[], published=false } = req.body;
    const slug = slugify_(title) + '-' + Date.now().toString(36);
    const row  = getDb().prepare(
      'INSERT INTO posts (title,slug,excerpt,content,cover_url,tags,published,author_id) VALUES (?,?,?,?,?,?,?,?)'
    ).run(title, slug, excerpt, content, cover_url, JSON.stringify(tags), published?1:0, req.user.id);
    ok(res, { post: { id:row.lastInsertRowid, slug } }, 201);
  }
);
app.put('/api/admin/posts/:id', authRequired, (req,res) => {
  const p = getDb().prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!p) return err(res,'Post tidak ditemukan',404);
  const { title, excerpt, content, cover_url, tags, published } = req.body;
  const newSlug = title ? slugify_(title)+'-'+Date.now().toString(36) : p.slug;
  getDb().prepare(
    'UPDATE posts SET title=?,slug=?,excerpt=?,content=?,cover_url=?,tags=?,published=?,updated_at=datetime("now") WHERE id=?'
  ).run(
    title||p.title, newSlug, excerpt!=null?excerpt:p.excerpt,
    content!=null?content:p.content, cover_url!=null?cover_url:p.cover_url,
    tags?JSON.stringify(tags):p.tags, published!=null?(published?1:0):p.published, req.params.id
  );
  ok(res, { post: getDb().prepare('SELECT id,title,slug,published FROM posts WHERE id=?').get(req.params.id) });
});
app.delete('/api/admin/posts/:id', authRequired, (req,res) => {
  getDb().prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
  ok(res, { deleted:true });
});

// ── WA Templates ──
app.get('/api/admin/wa-templates', authRequired, (req,res) => {
  ok(res, { templates: getDb().prepare('SELECT * FROM wa_templates ORDER BY id').all() });
});
app.post('/api/admin/wa-templates', authRequired,
  body('trigger').trim().notEmpty(),
  body('response').trim().notEmpty(),
  (req,res) => {
    if (!validate(req,res)) return;
    const { trigger, response } = req.body;
    try {
      const row = getDb().prepare('INSERT INTO wa_templates (trigger,response) VALUES (?,?)').run(trigger.toLowerCase(), response);
      ok(res, { template: getDb().prepare('SELECT * FROM wa_templates WHERE id=?').get(row.lastInsertRowid) }, 201);
    } catch { err(res, 'Trigger sudah ada'); }
  }
);
app.put('/api/admin/wa-templates/:id', authRequired, (req,res) => {
  const { trigger, response, active } = req.body;
  getDb().prepare('UPDATE wa_templates SET trigger=COALESCE(?,trigger), response=COALESCE(?,response), active=COALESCE(?,active) WHERE id=?')
    .run(trigger?.toLowerCase()||null, response||null, active!=null?(active?1:0):null, req.params.id);
  ok(res, { updated:true });
});
app.delete('/api/admin/wa-templates/:id', authRequired, (req,res) => {
  getDb().prepare('DELETE FROM wa_templates WHERE id=?').run(req.params.id);
  ok(res, { deleted:true });
});

// ── Settings (admin) ──
app.put('/api/admin/settings', authRequired, async (req,res) => {
  const allowed = ['site_name','tagline','phone','whatsapp','email','address','instagram','youtube','hours','meta_desc','wa_greeting'];
  const d = getDb();
  const upd = d.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
  const tx  = d.transaction(() => allowed.forEach(k => { if (req.body[k]!=null) upd.run(k, req.body[k]); }));
  tx();
  // Change password
  if (req.body.new_password) {
    if (req.body.new_password !== req.body.confirm_password) return err(res,'Password tidak cocok');
    const hash = await bcrypt.hash(req.body.new_password, 10);
    d.prepare('UPDATE admins SET password=? WHERE id=?').run(hash, req.user.id);
  }
  ok(res, { saved:true });
});

// ── Admin panel SPA ──
app.get('/admin*', (req,res) => res.sendFile(path.join(__dirname,'..','admin','index.html')));

// ── 404 fallback → frontend SPA ──
app.get('*', (req,res) => res.sendFile(path.join(__dirname,'..','public','index.html')));

// ── Error handler ──
app.use((error, req, res, _next) => {
  console.error('[ERROR]', error.message);
  err(res, 'Internal server error', 500);
});

// ── Start ──
function parsePkg(p) {
  return { ...p, features: JSON.parse(p.features||'[]'), active: !!p.active };
}

getDb(); // init schema
seedIfEmpty();

app.listen(PORT, () => {
  console.log(`\n🔥 Nyala.in berjalan di http://localhost:${PORT}`);
  console.log(`📦 Frontend  → http://localhost:${PORT}/`);
  console.log(`⚙️  Admin     → http://localhost:${PORT}/admin`);
  console.log(`🔌 API       → http://localhost:${PORT}/api`);
  console.log(`\n🔐 Login: admin / nyalain2025\n`);
});

module.exports = app;
