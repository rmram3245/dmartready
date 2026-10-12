'use strict';
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'server-data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const UPLOAD_DIR = path.resolve(ROOT, process.env.UPLOAD_DIR || './uploads/apk');
const MAX_APK_BYTES = Math.max(1, Number(process.env.MAX_APK_SIZE_MB || 500)) * 1024 * 1024;
const MAX_ATTEMPTS = Math.max(1, Number(process.env.LOGIN_MAX_ATTEMPTS || 5));
const WINDOW_MS = Math.max(60000, Number(process.env.LOGIN_WINDOW_MS || 900000));
const TOKEN_TTL = Math.max(60, Number(process.env.ADMIN_TOKEN_TTL || 86400));
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || '';

if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'your_strong_password_here') {
  console.error('ERROR: Set a real ADMIN_PASSWORD in .env before starting.'); process.exit(1);
}
if (TOKEN_SECRET.length < 32 || TOKEN_SECRET === 'change_this_to_a_long_random_string') {
  console.error('ERROR: Set ADMIN_TOKEN_SECRET to a random string of at least 32 characters in .env.'); process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const defaultStore = () => ({ apk: null, pixels: { pixel: process.env.FB_PIXEL_ID || '', pixel2: process.env.FB_PIXEL2_ID || '' }, passwordHash: null, downloadEvents: [], visitors: {}, loginAttempts: [] });
let store;
try { store = fs.existsSync(STORE_FILE) ? { ...defaultStore(), ...JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) } : defaultStore(); }
catch (e) { console.error('Could not read server-data/store.json:', e.message); process.exit(1); }
function save() { const tmp = STORE_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 }); fs.renameSync(tmp, STORE_FILE); }
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function passwordMatches(candidate) {
  if (store.passwordHash) return crypto.timingSafeEqual(Buffer.from(sha(candidate)), Buffer.from(store.passwordHash));
  const a = Buffer.from(sha(candidate)), b = Buffer.from(sha(process.env.ADMIN_PASSWORD));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function tokenFor() {
  const payload = Buffer.from(JSON.stringify({ sub: 'admin', exp: Math.floor(Date.now()/1000) + TOKEN_TTL, nonce: crypto.randomBytes(12).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url'); return `${payload}.${sig}`;
}
function auth(req, res, next) {
  const token = String(req.get('x-admin-token') || '').split('.');
  if (token.length !== 2) return res.status(401).json({ error: 'Admin session expired. Please sign in again.' });
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(token[0]).digest('base64url');
  if (expected.length !== token[1].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token[1]))) return res.status(401).json({ error: 'Invalid admin token.' });
  try { const payload = JSON.parse(Buffer.from(token[0], 'base64url').toString()); if (payload.sub !== 'admin' || payload.exp < Date.now()/1000) return res.status(401).json({ error: 'Admin session expired. Please sign in again.' }); }
  catch { return res.status(401).json({ error: 'Invalid admin token.' }); }
  next();
}
function getIP(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 100); }
function recentAttempts(ip) { const since = Date.now() - WINDOW_MS; return store.loginAttempts.filter(x => x.ipAddress === ip && Date.parse(x.attemptedAt) > since && !x.success).length; }
function addAttempt(req, success) {
  store.loginAttempts.unshift({ id: crypto.randomUUID(), ipAddress: getIP(req), userAgent: String(req.get('user-agent') || '').slice(0, 300), attemptedAt: new Date().toISOString(), success });
  store.loginAttempts = store.loginAttempts.slice(0, 200); save();
}
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
// Only allow configured browser origins when cross-origin requests are used.
app.use((req, res, next) => {
  const origin = req.get('origin'); const allowed = (process.env.CORS_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); }
  if (req.method === 'OPTIONS') return res.sendStatus(204); next();
});

const api = express.Router();
api.get('/health', (req,res) => res.json({ ok: true, service: 'dmart-backend', time: new Date().toISOString() }));
api.post('/admin/login', (req,res) => {
  const ip = getIP(req); const used = recentAttempts(ip);
  if (used >= MAX_ATTEMPTS) return res.status(429).json({ error: `Too many failed attempts. Please wait ${Math.ceil(WINDOW_MS/60000)} minutes.` });
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const success = password.length <= 1024 && passwordMatches(password);
  addAttempt(req, success);
  if (!success) return res.status(401).json({ error: 'Wrong admin password.' });
  return res.json({ token: tokenFor() });
});
api.post('/admin/logout', auth, (req,res) => res.sendStatus(204));
api.post('/admin/change-password', auth, (req,res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !passwordMatches(currentPassword)) return res.status(401).json({ error: 'Current password is incorrect.' });
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) return res.status(400).json({ error: 'New password must be 8–200 characters long.' });
  store.passwordHash = sha(newPassword); save(); res.json({ ok: true });
});
api.get('/admin/login-attempts', auth, (req,res) => res.json(store.loginAttempts.slice(0, 100)));
api.get('/admin/stats', auth, (req,res) => {
  const today = new Date(); today.setHours(0,0,0,0); const todayMs = today.getTime();
  for (const [id,v] of Object.entries(store.visitors)) if (v.lastSeen < Date.now() - 90000) delete store.visitors[id];
  const events = store.downloadEvents;
  res.json({ liveVisitors: Object.keys(store.visitors).length, downloadClicks: { today: events.filter(t => Date.parse(t) >= todayMs).length, total: events.length } });
});
api.get('/apk/info', (req,res) => {
  if (!store.apk || !fs.existsSync(path.join(UPLOAD_DIR, store.apk.filename))) return res.status(404).json({ error: 'No APK uploaded yet.' });
  res.json({ originalName: store.apk.originalName, fileSize: store.apk.fileSize, uploadedAt: store.apk.uploadedAt });
});
const upload = multer({ storage: multer.diskStorage({ destination: (req,file,cb) => cb(null, UPLOAD_DIR), filename: (req,file,cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.apk`) }), limits: { fileSize: MAX_APK_BYTES, files: 1 }, fileFilter: (req,file,cb) => { if (!/\.apk$/i.test(file.originalname)) return cb(new Error('Only .apk files are allowed.')); cb(null,true); } });
api.post('/admin/apk/upload', auth, (req,res,next) => upload.single('apk')(req,res,err => {
  if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File exceeds the ${process.env.MAX_APK_SIZE_MB || 500} MB limit.` : err.message || 'Upload failed.' });
  if (!req.file) return res.status(400).json({ error: 'Choose an APK file first.' });
  const old = store.apk; store.apk = { filename: req.file.filename, originalName: path.basename(req.file.originalname).slice(0, 180), fileSize: req.file.size, uploadedAt: new Date().toISOString() }; save();
  if (old?.filename && old.filename !== store.apk.filename) { try { fs.unlinkSync(path.join(UPLOAD_DIR, old.filename)); } catch {} }
  res.status(201).json({ originalName: store.apk.originalName, fileSize: store.apk.fileSize, uploadedAt: store.apk.uploadedAt });
}));
api.delete('/admin/apk', auth, (req,res) => { if (store.apk?.filename) { try { fs.unlinkSync(path.join(UPLOAD_DIR, store.apk.filename)); } catch {} } store.apk = null; save(); res.sendStatus(204); });
api.get('/apk/download', (req,res) => {
  if (!store.apk) return res.status(404).send('No app download is available yet.');
  const file = path.join(UPLOAD_DIR, store.apk.filename);
  if (!fs.existsSync(file)) return res.status(404).send('No app download is available yet.');
  res.download(file, store.apk.originalName);
});
function getPixel(key) { const id = store.pixels[key] || ''; return id ? { pixelId: id, updatedAt: store.pixels[key + 'UpdatedAt'] || new Date(0).toISOString() } : null; }
for (const [route,key] of [['pixel','pixel'],['pixel2','pixel2']]) {
  api.get(`/settings/${route}`, (req,res) => { const value = getPixel(key); return value ? res.json(value) : res.status(404).json({ error: 'Pixel not configured.' }); });
  api.post(`/admin/settings/${route}`, auth, (req,res) => { const id = String(req.body?.pixelId || '').trim(); if (id && !/^\d{5,20}$/.test(id)) return res.status(400).json({ error: 'Pixel ID must contain 5–20 digits.' }); store.pixels[key] = id; store.pixels[key + 'UpdatedAt'] = new Date().toISOString(); save(); const value = getPixel(key); return value ? res.json(value) : res.status(200).json({ pixelId: '', updatedAt: store.pixels[key + 'UpdatedAt'] }); });
  api.delete(`/admin/settings/${route}`, auth, (req,res) => { store.pixels[key] = ''; store.pixels[key + 'UpdatedAt'] = new Date().toISOString(); save(); res.sendStatus(204); });
}
api.post('/stats/download-click', (req,res) => { store.downloadEvents.push(new Date().toISOString()); if (store.downloadEvents.length > 50000) store.downloadEvents = store.downloadEvents.slice(-50000); save(); res.sendStatus(204); });
function parseBeacon(req) { if (req.body && typeof req.body === 'object') return req.body; if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch {} } return {}; }
api.post('/stats/ping', (req,res) => { const body = parseBeacon(req); const id = String(body.sessionId || '').slice(0,160); if (id) { store.visitors[id] = { lastSeen: Date.now() }; save(); } res.sendStatus(204); });
api.post('/stats/leave', express.text({ type: '*/*', limit: '10kb' }), (req,res) => { const body = parseBeacon(req); const id = String(body.sessionId || '').slice(0,160); if (id && store.visitors[id]) { delete store.visitors[id]; save(); } res.sendStatus(204); });
app.use('/api', api);
// Never expose server code, environment secrets, or uploaded files through static hosting.
app.use((req,res,next) => { if (/^\/(?:server\.js|package\.json|package-lock\.json|\.env(?:\..*)?|server-data)(?:\/|$)/i.test(req.path) || req.path.startsWith('/uploads/')) return res.sendStatus(404); next(); });
// Static files and the existing React SPA, including its /admin route.
app.use(express.static(ROOT, { index: 'index.html', dotfiles: 'ignore', setHeaders(res, filePath) { if (filePath.endsWith('.apk')) res.setHeader('X-Content-Type-Options','nosniff'); } }));
app.get(['/admin', '/admin/*'], (req,res) => res.sendFile(path.join(ROOT,'index.html')));
app.get('*', (req,res) => { if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found.' }); res.sendFile(path.join(ROOT,'index.html')); });
app.use((err,req,res,next) => { console.error(err); if (res.headersSent) return next(err); res.status(500).json({ error: 'Unexpected server error.' }); });
app.listen(PORT, '0.0.0.0', () => console.log(`DMart website running at http://localhost:${PORT} (admin: /admin)`));
