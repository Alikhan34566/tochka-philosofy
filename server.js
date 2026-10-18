// Запуск: npm i express pg express-rate-limit cors && DATABASE_URL=... ADMIN_TOKEN=... node server.js
const express = require('express'), cors = require('cors'), rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const url = process.env.DATABASE_URL || '';
const db = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } }); // Supabase требует SSL
const app = express();
app.use(cors()); app.use(express.json({ limit: '10kb' }));
app.use(express.static('public')); // сайт лежит в public/index.html

const STOP = ['дурак', 'идиот', 'спам'];            // вынесите в таблицу или конфиг
function check(text) {                              // та же логика, что в демо, но на сервере
  const t = String(text || '').trim();
  if (t.length < 5 || t.length > 1500) return { status: 'rejected', reason: 'short' };
  if (/https?:\/\/|www\./i.test(t)) return { status: 'rejected', reason: 'link' };
  if (STOP.some(w => t.toLowerCase().includes(w))) return { status: 'pending', reason: 'stopword' };
  return { status: 'published' };
}
const postLimit = rateLimit({ windowMs: 60_000, max: 3, handler: (_, res) => res.status(429).json({ status: 'rejected', reason: 'rate' }) });

app.get('/api/poets', async (_, res) => res.json((await db.query('select * from poets order by years')).rows));
app.get('/api/poets/:id', async (req, res) => {
  const p = (await db.query('select * from poets where id=$1', [req.params.id])).rows[0];
  if (!p) return res.sendStatus(404);
  const [works, links] = await Promise.all([
    db.query('select * from works where poet_id=$1', [p.id]),
    db.query('select * from poet_links where from_id=$1 or to_id=$1', [p.id])]);
  res.json({ ...p, works: works.rows, links: links.rows });
});
app.get('/api/thoughts', async (req, res) => {       // ответ: массив строк, как ждёт сайт
  const r = await db.query("select body from thoughts where target=$1 and status='published' order by created_at desc limit 50", [req.query.target || '']);
  res.json(r.rows.map(x => x.body));
});
app.post('/api/thoughts', postLimit, async (req, res) => {
  const { target = '', text } = req.body, v = check(text);
  if (v.status === 'rejected') return res.json(v);
  const t = await db.query('insert into thoughts(target, body, status) values($1,$2,$3) returning id', [target, text.trim(), v.status]);
  if (v.status === 'pending') await db.query('insert into moderation_queue(thought_id, reason) values($1,$2)', [t.rows[0].id, v.reason]);
  res.json({ status: v.status });
});
const admin = (req, res, next) => req.get('x-admin-token') === process.env.ADMIN_TOKEN ? next() : res.sendStatus(401);
app.get('/api/admin/queue', admin, async (_, res) => res.json((await db.query("select q.id, t.body, q.reason from moderation_queue q join thoughts t on t.id=q.thought_id where q.decision is null")).rows));
app.post('/api/admin/queue/:id', admin, async (req, res) => {   // {decision:'published'|'rejected'}
  const d = req.body.decision === 'published' ? 'published' : 'rejected';
  const q = (await db.query('update moderation_queue set decision=$1, reviewed_at=now() where id=$2 returning thought_id', [d, req.params.id])).rows[0];
  if (q) await db.query('update thoughts set status=$1 where id=$2', [d, q.thought_id]);
  res.sendStatus(204);
});
app.listen(process.env.PORT || 3000, () => console.log('ok'));
