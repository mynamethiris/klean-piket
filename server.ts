import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("sistem_piket.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    account_code TEXT UNIQUE,
    role TEXT CHECK(role IN ('admin', 'pj')),
    group_name TEXT,
    member_id INTEGER,
    FOREIGN KEY (member_id) REFERENCES class_members(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS class_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    pj_id INTEGER,
    FOREIGN KEY (pj_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    pj_id INTEGER,
    checkin_photo TEXT,
    checkin_time TEXT,
    status TEXT,
    latitude REAL,
    longitude REAL,
    cleaning_photo TEXT,
    cleaning_description TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pj_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS absent_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER,
    member_id INTEGER,
    name TEXT,
    reason TEXT,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES class_members(id)
  );
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT,
    day TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations
const migrations = [
  ["submitted_at FROM reports", "ALTER TABLE reports ADD COLUMN submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP"],
  ["account_code FROM users", "ALTER TABLE users ADD COLUMN account_code TEXT"],
  ["group_name FROM users", "ALTER TABLE users ADD COLUMN group_name TEXT"],
  ["member_id FROM users", "ALTER TABLE users ADD COLUMN member_id INTEGER REFERENCES class_members(id)"],
  ["pj_id FROM class_members", "ALTER TABLE class_members ADD COLUMN pj_id INTEGER REFERENCES users(id)"],
  ["member_id FROM absent_members", "ALTER TABLE absent_members ADD COLUMN member_id INTEGER REFERENCES class_members(id)"],
];
for (const [check, alter] of migrations) {
  try { db.prepare(`SELECT ${check} LIMIT 1`).get(); } 
  catch { try { db.exec(alter); } catch {} }
}

// Generate codes for users without account_code
const usersWithoutCode = db.prepare("SELECT id, role FROM users WHERE account_code IS NULL OR account_code = ''").all() as any[];
for (const u of usersWithoutCode) {
  const len = u.role === 'admin' ? 8 : 6;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  try { db.prepare("UPDATE users SET account_code = ? WHERE id = ?").run(code, u.id); } catch {}
}

// Seed default settings
const defaultSettings = [
  ['report_time_limit', '07:00'],
  ['testing_mode', 'false'],
  ['edit_time_limit_minutes', '15']
];
for (const [k, v] of defaultSettings) {
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(k, v);
}

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());
  app.use("/uploads", express.static(uploadDir));

  app.get("/api/server-time", (req, res) => res.json({ time: new Date().toISOString() }));

  app.get("/api/admin-exists", (req, res) => {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
    res.json({ exists: !!admin });
  });

  app.post("/api/setup-admin", (req, res) => {
    const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
    if (adminExists) return res.status(400).json({ success: false, message: "Admin sudah ada" });
    const code = generateCode(8);
    db.prepare("INSERT INTO users (name, account_code, role) VALUES (?, ?, ?)").run("Admin Utama", code, "admin");
    res.json({ success: true, code });
  });

  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const obj = settings.reduce((acc: any, s: any) => { acc[s.key] = s.value; return acc; }, {});
    res.json(obj);
  });

  app.post("/api/settings", (req, res) => {
    const { key, value } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value.toString());
    res.json({ success: true });
  });

  app.post("/api/login", (req, res) => {
    const { account_code } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE account_code = ?").get(account_code) as any;
    if (user) {
      res.json({ success: true, user: { id: user.id, name: user.name, role: user.role, group_name: user.group_name } });
    } else {
      res.status(401).json({ success: false, message: "Kode akun tidak valid" });
    }
  });

  app.get("/api/users", (req, res) => {
    const users = db.prepare(`
      SELECT u.id, COALESCE(m.name, u.name) as name, u.account_code, u.role, u.group_name, u.member_id 
      FROM users u LEFT JOIN class_members m ON u.member_id = m.id
    `).all();
    res.json(users);
  });

  app.post("/api/users", (req, res) => {
    const { name, role, group_name, member_id } = req.body;
    const code = generateCode(6);
    try {
      db.prepare("INSERT INTO users (name, account_code, role, group_name, member_id) VALUES (?, ?, ?, ?, ?)").run(name, code, role || 'pj', group_name || null, member_id || null);
      const newUser = db.prepare("SELECT id FROM users WHERE account_code = ?").get(code) as any;
      res.json({ success: true, account_code: code, id: newUser?.id });
    } catch (e) {
      res.status(400).json({ success: false, message: "Gagal membuat akun" });
    }
  });

  app.delete("/api/users/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE class_members SET pj_id = NULL WHERE pj_id = ?").run(id);
    db.prepare("UPDATE users SET member_id = NULL WHERE id = ?").run(id);
    const userReports = db.prepare("SELECT id FROM reports WHERE pj_id = ?").all(id) as any[];
    for (const r of userReports) db.prepare("DELETE FROM absent_members WHERE report_id = ?").run(r.id);
    db.prepare("DELETE FROM reports WHERE pj_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.put("/api/users/:id", (req, res) => {
    const { id } = req.params;
    const { name, group_name } = req.body;
    db.prepare("UPDATE users SET name = ?, group_name = ? WHERE id = ?").run(name, group_name, id);
    res.json({ success: true });
  });

  app.post("/api/users/:id/regenerate-code", (req, res) => {
    const { id } = req.params;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    const code = generateCode(user.role === 'admin' ? 8 : 6);
    db.prepare("UPDATE users SET account_code = ? WHERE id = ?").run(code, id);
    res.json({ success: true, account_code: code });
  });

  app.post("/api/users/reset", (req, res) => {
    db.prepare("UPDATE class_members SET pj_id = NULL").run();
    db.prepare("DELETE FROM users WHERE role != 'admin'").run();
    res.json({ success: true });
  });

  app.post("/api/members/reset", (req, res) => {
    db.prepare("UPDATE users SET member_id = NULL").run();
    db.prepare("DELETE FROM class_members").run();
    res.json({ success: true });
  });

  app.get("/api/members", (req, res) => {
    const { pj_id } = req.query;
    let members;
    if (pj_id) {
      members = db.prepare("SELECT * FROM class_members WHERE pj_id = ?").all(pj_id);
    } else {
      members = db.prepare(`
        SELECT m.*, u1.name as pj_name, u1.group_name as pj_group, u2.group_name as is_pj_group
        FROM class_members m 
        LEFT JOIN users u1 ON m.pj_id = u1.id
        LEFT JOIN users u2 ON m.id = u2.member_id AND u2.role = 'pj'
      `).all();
    }
    res.json(members);
  });

  app.post("/api/members", (req, res) => {
    const { name, pj_id } = req.body;
    db.prepare("INSERT INTO class_members (name, pj_id) VALUES (?, ?)").run(name, pj_id || null);
    res.json({ success: true });
  });

  app.put("/api/members/:id", (req, res) => {
    const { pj_id, name } = req.body;
    const { id } = req.params;
    db.prepare("UPDATE class_members SET name = ?, pj_id = ? WHERE id = ?").run(name, pj_id || null, id);
    res.json({ success: true });
  });

  app.delete("/api/members/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE users SET member_id = NULL WHERE member_id = ?").run(id);
    db.prepare("DELETE FROM absent_members WHERE member_id = ?").run(id);
    db.prepare("DELETE FROM class_members WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/status/:pj_id", (req, res) => {
    const today = new Date().toISOString().split("T")[0];
    const report = db.prepare("SELECT * FROM reports WHERE pj_id = ? AND date = ?").get(req.params.pj_id, today);
    res.json(report || null);
  });

  app.get("/api/reports/history/:pj_id", (req, res) => {
    const reports = db.prepare(`
      SELECT r.*, u.name as pj_name, u.group_name as pj_group
      FROM reports r JOIN users u ON r.pj_id = u.id
      WHERE r.pj_id = ? ORDER BY r.date DESC
    `).all(req.params.pj_id) as any[];
    const result = reports.map(r => ({ ...r, absents: db.prepare("SELECT * FROM absent_members WHERE report_id = ?").all(r.id) }));
    res.json(result);
  });

  app.post("/api/attendance", upload.single("photo"), (req, res) => {
    const { pj_id, latitude, longitude, time, status } = req.body;
    const today = new Date().toISOString().split("T")[0];
    const photo = req.file ? `/uploads/${req.file.filename}` : "";
    const existing = db.prepare("SELECT * FROM reports WHERE pj_id = ? AND date = ?").get(pj_id, today);
    if (existing) return res.status(400).json({ success: false, message: "Sudah absen hari ini!" });
    db.prepare(`INSERT INTO reports (date, pj_id, checkin_photo, checkin_time, status, latitude, longitude, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(today, pj_id, photo, time, status, latitude, longitude);
    res.json({ success: true });
  });

  app.post("/api/report", upload.single("photo"), (req, res) => {
    const { pj_id, description, absentMembers } = req.body;
    const today = new Date().toISOString().split("T")[0];
    const photo = req.file ? `/uploads/${req.file.filename}` : "";
    const report = db.prepare("SELECT id FROM reports WHERE pj_id = ? AND date = ?").get(pj_id, today) as any;
    if (!report) return res.status(400).json({ success: false, message: "Silakan absen kehadiran terlebih dahulu!" });
    db.prepare(`UPDATE reports SET cleaning_photo = ?, cleaning_description = ?, submitted_at = datetime('now') WHERE id = ?`).run(photo, description, report.id);
    db.prepare("DELETE FROM absent_members WHERE report_id = ?").run(report.id);
    if (absentMembers) {
      const parsed = JSON.parse(absentMembers);
      const insertAbsent = db.prepare("INSERT INTO absent_members (report_id, member_id, name, reason) VALUES (?, ?, ?, ?)");
      parsed.forEach((m: any) => insertAbsent.run(report.id, m.member_id || null, m.name, m.reason));
    }
    res.json({ success: true });
  });

  app.post("/api/report/:report_id/edit-photo", upload.single("photo"), (req, res) => {
    const { report_id } = req.params;
    const photo = req.file ? `/uploads/${req.file.filename}` : "";
    const report = db.prepare("SELECT *, submitted_at FROM reports WHERE id = ?").get(report_id) as any;
    if (!report) return res.status(404).json({ success: false, message: "Laporan tidak ditemukan" });
    const settings = db.prepare("SELECT value FROM settings WHERE key = 'edit_time_limit_minutes'").get() as any;
    const limitMinutes = parseInt(settings?.value || '15');
    const testMode = db.prepare("SELECT value FROM settings WHERE key = 'testing_mode'").get() as any;
    if (testMode?.value !== 'true') {
      const submittedAt = new Date((report.submitted_at || '').includes('Z') ? report.submitted_at : report.submitted_at + 'Z');
      const diffMinutes = (Date.now() - submittedAt.getTime()) / 60000;
      if (diffMinutes > limitMinutes) return res.status(403).json({ success: false, message: `Batas waktu edit (${limitMinutes} menit) telah terlewati` });
    }
    db.prepare("UPDATE reports SET cleaning_photo = ? WHERE id = ?").run(photo, report_id);
    res.json({ success: true });
  });

  app.get("/api/all-reports", (req, res) => {
    const reports = db.prepare(`
      SELECT r.*, u.name as pj_name, u.group_name as pj_group
      FROM reports r JOIN users u ON r.pj_id = u.id
      ORDER BY r.date DESC, r.submitted_at DESC
    `).all() as any[];
    const result = reports.map(r => ({ ...r, absents: db.prepare("SELECT * FROM absent_members WHERE report_id = ?").all(r.id) }));
    res.json(result);
  });

  app.delete("/api/reports/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM absent_members WHERE report_id = ?").run(id);
    db.prepare("DELETE FROM reports WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.post("/api/reports/reset", (req, res) => {
    db.prepare("DELETE FROM absent_members").run();
    db.prepare("DELETE FROM reports").run();
    res.json({ success: true });
  });

  app.get("/api/schedules", (req, res) => {
    const schedules = db.prepare("SELECT * FROM schedules ORDER BY CASE day WHEN 'Senin' THEN 1 WHEN 'Selasa' THEN 2 WHEN 'Rabu' THEN 3 WHEN 'Kamis' THEN 4 WHEN 'Jumat' THEN 5 ELSE 6 END").all();
    res.json(schedules);
  });

  app.post("/api/schedules", (req, res) => {
    const { group_name, day } = req.body;
    const existing = db.prepare("SELECT id FROM schedules WHERE day = ?").get(day);
    if (existing) return res.status(400).json({ success: false, message: `Hari ${day} sudah memiliki jadwal piket` });
    db.prepare("INSERT INTO schedules (group_name, day) VALUES (?, ?)").run(group_name, day);
    res.json({ success: true });
  });

  app.put("/api/schedules/:id", (req, res) => {
    const { id } = req.params;
    const { group_name, day } = req.body;
    const existing = db.prepare("SELECT id FROM schedules WHERE day = ? AND id != ?").get(day, id);
    if (existing) return res.status(400).json({ success: false, message: `Hari ${day} sudah memiliki jadwal piket` });
    db.prepare("UPDATE schedules SET group_name = ?, day = ? WHERE id = ?").run(group_name, day, id);
    res.json({ success: true });
  });

  app.delete("/api/schedules/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM schedules WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.all("/api/*", (req, res) => {
    res.status(404).json({ success: false, message: `API route not found: ${req.method} ${req.url}` });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
