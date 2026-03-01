import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@libsql/client";

// ── Database setup ──────────────────────────────────────────────────────────
// Uses Turso (libSQL) for persistent storage on Netlify.
// Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Netlify environment variables.
// For local dev, use a local libSQL file via: TURSO_DATABASE_URL=file:local.db
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDB() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      account_code TEXT UNIQUE,
      role TEXT CHECK(role IN ('admin', 'pj')),
      group_name TEXT,
      member_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS class_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      pj_id INTEGER
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
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS absent_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      member_id INTEGER,
      name TEXT,
      reason TEXT
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT,
      day TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS file_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE,
      data TEXT,
      mime_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default settings
  const defaults = [
    ["report_time_limit", "07:00"],
    ["testing_mode", "false"],
    ["edit_time_limit_minutes", "15"],
  ];
  for (const [k, v] of defaults) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
      args: [k, v],
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function generateCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++)
    result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function json(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}

// Parse multipart form data (base64 encoded files)
function parseMultipart(event: HandlerEvent): {
  fields: Record<string, string>;
  file?: { filename: string; data: string; mimeType: string };
} {
  const contentType = event.headers["content-type"] || "";
  const fields: Record<string, string> = {};
  let file: { filename: string; data: string; mimeType: string } | undefined;

  if (contentType.includes("multipart/form-data")) {
    const boundary = contentType.split("boundary=")[1];
    if (!boundary) return { fields };

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "");

    const parts = bodyBuffer
      .toString("binary")
      .split(`--${boundary}`)
      .filter((p) => p.includes("Content-Disposition"));

    for (const part of parts) {
      const [headerSection, ...bodyParts] = part.split("\r\n\r\n");
      const body = bodyParts.join("\r\n\r\n").replace(/\r\n$/, "");
      const nameMatch = headerSection.match(/name="([^"]+)"/);
      const filenameMatch = headerSection.match(/filename="([^"]+)"/);
      const ctMatch = headerSection.match(/Content-Type: ([^\r\n]+)/);

      if (!nameMatch) continue;
      const fieldName = nameMatch[1];

      if (filenameMatch) {
        const filename = `${Date.now()}-${filenameMatch[1]}`;
        const mimeType = ctMatch ? ctMatch[1] : "application/octet-stream";
        const data = Buffer.from(body, "binary").toString("base64");
        file = { filename, data, mimeType };
      } else {
        fields[fieldName] = body;
      }
    }
  } else if (contentType.includes("application/json")) {
    try {
      Object.assign(fields, JSON.parse(event.body || "{}"));
    } catch {}
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    new URLSearchParams(event.body || "").forEach((v, k) => {
      fields[k] = v;
    });
  }

  return { fields, file };
}

// ── Route handler ────────────────────────────────────────────────────────────
export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  // OPTIONS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  try {
    await initDB();
  } catch (e) {
    console.error("DB init error:", e);
    return json(500, { success: false, message: "Database initialization failed" });
  }

  // Extract path: /.netlify/functions/api/server-time → server-time
  const rawPath = event.path.replace(/^\/.netlify\/functions\/api\/?/, "").replace(/^\//, "");
  const segments = rawPath.split("/");
  const method = event.httpMethod;
  const query = event.queryStringParameters || {};

  try {
    // ── GET /server-time
    if (method === "GET" && segments[0] === "server-time") {
      return json(200, { time: new Date().toISOString() });
    }

    // ── GET /admin-exists
    if (method === "GET" && segments[0] === "admin-exists") {
      const res = await db.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      return json(200, { exists: res.rows.length > 0 });
    }

    // ── POST /setup-admin
    if (method === "POST" && segments[0] === "setup-admin") {
      const res = await db.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      if (res.rows.length > 0) return json(400, { success: false, message: "Admin sudah ada" });
      const code = generateCode(8);
      await db.execute({
        sql: "INSERT INTO users (name, account_code, role) VALUES (?, ?, ?)",
        args: ["Admin Utama", code, "admin"],
      });
      return json(200, { success: true, code });
    }

    // ── GET /settings
    if (method === "GET" && segments[0] === "settings") {
      const res = await db.execute("SELECT * FROM settings");
      const obj = res.rows.reduce<Record<string, string>>((acc, r) => {
        acc[r.key as string] = r.value as string;
        return acc;
      }, {});
      return json(200, obj);
    }

    // ── POST /settings
    if (method === "POST" && segments[0] === "settings") {
      const body = JSON.parse(event.body || "{}");
      await db.execute({
        sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        args: [body.key, body.value.toString()],
      });
      return json(200, { success: true });
    }

    // ── POST /login
    if (method === "POST" && segments[0] === "login") {
      const { account_code } = JSON.parse(event.body || "{}");
      const res = await db.execute({
        sql: "SELECT * FROM users WHERE account_code = ?",
        args: [account_code],
      });
      if (res.rows.length === 0) return json(401, { success: false, message: "Kode akun tidak valid" });
      const u = res.rows[0];
      return json(200, {
        success: true,
        user: { id: u.id, name: u.name, role: u.role, group_name: u.group_name },
      });
    }

    // ── GET /users
    if (method === "GET" && segments[0] === "users") {
      const res = await db.execute(`
        SELECT u.id, COALESCE(m.name, u.name) as name, u.account_code, u.role, u.group_name, u.member_id 
        FROM users u LEFT JOIN class_members m ON u.member_id = m.id
      `);
      return json(200, res.rows);
    }

    // ── POST /users
    if (method === "POST" && segments[0] === "users" && !segments[1]) {
      const { name, role, group_name, member_id } = JSON.parse(event.body || "{}");
      const code = generateCode(6);
      await db.execute({
        sql: "INSERT INTO users (name, account_code, role, group_name, member_id) VALUES (?, ?, ?, ?, ?)",
        args: [name, code, role || "pj", group_name || null, member_id || null],
      });
      const newUser = await db.execute({ sql: "SELECT id FROM users WHERE account_code = ?", args: [code] });
      return json(200, { success: true, account_code: code, id: newUser.rows[0]?.id });
    }

    // ── DELETE /users/:id
    if (method === "DELETE" && segments[0] === "users" && segments[1]) {
      const id = segments[1];
      await db.execute({ sql: "UPDATE class_members SET pj_id = NULL WHERE pj_id = ?", args: [id] });
      await db.execute({ sql: "UPDATE users SET member_id = NULL WHERE id = ?", args: [id] });
      const reports = await db.execute({ sql: "SELECT id FROM reports WHERE pj_id = ?", args: [id] });
      for (const r of reports.rows)
        await db.execute({ sql: "DELETE FROM absent_members WHERE report_id = ?", args: [r.id as number] });
      await db.execute({ sql: "DELETE FROM reports WHERE pj_id = ?", args: [id] });
      await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
      return json(200, { success: true });
    }

    // ── PUT /users/:id
    if (method === "PUT" && segments[0] === "users" && segments[1]) {
      const id = segments[1];
      const { name, group_name } = JSON.parse(event.body || "{}");
      await db.execute({ sql: "UPDATE users SET name = ?, group_name = ? WHERE id = ?", args: [name, group_name, id] });
      return json(200, { success: true });
    }

    // ── POST /users/:id/regenerate-code
    if (method === "POST" && segments[0] === "users" && segments[2] === "regenerate-code") {
      const id = segments[1];
      const res = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
      if (res.rows.length === 0) return json(404, { success: false, message: "User tidak ditemukan" });
      const u = res.rows[0];
      const code = generateCode(u.role === "admin" ? 8 : 6);
      await db.execute({ sql: "UPDATE users SET account_code = ? WHERE id = ?", args: [code, id] });
      return json(200, { success: true, account_code: code });
    }

    // ── POST /users/reset
    if (method === "POST" && segments[0] === "users" && segments[1] === "reset") {
      await db.execute("UPDATE class_members SET pj_id = NULL");
      await db.execute("DELETE FROM users WHERE role != 'admin'");
      return json(200, { success: true });
    }

    // ── POST /members/reset
    if (method === "POST" && segments[0] === "members" && segments[1] === "reset") {
      await db.execute("UPDATE users SET member_id = NULL");
      await db.execute("DELETE FROM class_members");
      return json(200, { success: true });
    }

    // ── GET /members
    if (method === "GET" && segments[0] === "members" && !segments[1]) {
      const pj_id = query.pj_id;
      let res;
      if (pj_id) {
        res = await db.execute({ sql: "SELECT * FROM class_members WHERE pj_id = ?", args: [pj_id] });
      } else {
        res = await db.execute(`
          SELECT m.*, u1.name as pj_name, u1.group_name as pj_group, u2.group_name as is_pj_group
          FROM class_members m 
          LEFT JOIN users u1 ON m.pj_id = u1.id
          LEFT JOIN users u2 ON m.id = u2.member_id AND u2.role = 'pj'
        `);
      }
      return json(200, res.rows);
    }

    // ── POST /members
    if (method === "POST" && segments[0] === "members" && !segments[1]) {
      const { name, pj_id } = JSON.parse(event.body || "{}");
      await db.execute({ sql: "INSERT INTO class_members (name, pj_id) VALUES (?, ?)", args: [name, pj_id || null] });
      return json(200, { success: true });
    }

    // ── PUT /members/:id
    if (method === "PUT" && segments[0] === "members" && segments[1]) {
      const id = segments[1];
      const { pj_id, name } = JSON.parse(event.body || "{}");
      await db.execute({ sql: "UPDATE class_members SET name = ?, pj_id = ? WHERE id = ?", args: [name, pj_id || null, id] });
      return json(200, { success: true });
    }

    // ── DELETE /members/:id
    if (method === "DELETE" && segments[0] === "members" && segments[1]) {
      const id = segments[1];
      await db.execute({ sql: "UPDATE users SET member_id = NULL WHERE member_id = ?", args: [id] });
      await db.execute({ sql: "DELETE FROM absent_members WHERE member_id = ?", args: [id] });
      await db.execute({ sql: "DELETE FROM class_members WHERE id = ?", args: [id] });
      return json(200, { success: true });
    }

    // ── GET /status/:pj_id
    if (method === "GET" && segments[0] === "status" && segments[1]) {
      const today = new Date().toISOString().split("T")[0];
      const res = await db.execute({
        sql: "SELECT * FROM reports WHERE pj_id = ? AND date = ?",
        args: [segments[1], today],
      });
      return json(200, res.rows[0] || null);
    }

    // ── GET /reports/history/:pj_id
    if (method === "GET" && segments[0] === "reports" && segments[1] === "history" && segments[2]) {
      const res = await db.execute({
        sql: `SELECT r.*, u.name as pj_name, u.group_name as pj_group
              FROM reports r JOIN users u ON r.pj_id = u.id
              WHERE r.pj_id = ? ORDER BY r.date DESC`,
        args: [segments[2]],
      });
      const result = await Promise.all(
        res.rows.map(async (r) => {
          const absents = await db.execute({
            sql: "SELECT * FROM absent_members WHERE report_id = ?",
            args: [r.id as number],
          });
          return { ...r, checkin_photo: toPhotoUrl(r.checkin_photo as string), cleaning_photo: toPhotoUrl(r.cleaning_photo as string), absents: absents.rows };
        })
      );
      return json(200, result);
    }

    // ── POST /attendance (with photo upload)
    if (method === "POST" && segments[0] === "attendance") {
      const { fields, file } = parseMultipart(event);
      const { pj_id, latitude, longitude, time, status } = fields;
      const today = new Date().toISOString().split("T")[0];
      let photoUrl = "";

      if (file) {
        await db.execute({
          sql: "INSERT OR REPLACE INTO file_uploads (filename, data, mime_type) VALUES (?, ?, ?)",
          args: [file.filename, file.data, file.mimeType],
        });
        photoUrl = `/uploads/${file.filename}`;
      }

      const existing = await db.execute({
        sql: "SELECT id FROM reports WHERE pj_id = ? AND date = ?",
        args: [pj_id, today],
      });
      if (existing.rows.length > 0) return json(400, { success: false, message: "Sudah absen hari ini!" });

      await db.execute({
        sql: `INSERT INTO reports (date, pj_id, checkin_photo, checkin_time, status, latitude, longitude, submitted_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [today, pj_id, photoUrl, time, status, latitude, longitude],
      });
      return json(200, { success: true });
    }

    // ── POST /report (cleaning report with photo)
    if (method === "POST" && segments[0] === "report" && !segments[1]) {
      const { fields, file } = parseMultipart(event);
      const { pj_id, description, absentMembers } = fields;
      const today = new Date().toISOString().split("T")[0];
      let photoUrl = "";

      if (file) {
        await db.execute({
          sql: "INSERT OR REPLACE INTO file_uploads (filename, data, mime_type) VALUES (?, ?, ?)",
          args: [file.filename, file.data, file.mimeType],
        });
        photoUrl = `/uploads/${file.filename}`;
      }

      const report = await db.execute({
        sql: "SELECT id FROM reports WHERE pj_id = ? AND date = ?",
        args: [pj_id, today],
      });
      if (report.rows.length === 0)
        return json(400, { success: false, message: "Silakan absen kehadiran terlebih dahulu!" });

      const reportId = report.rows[0].id as number;
      await db.execute({
        sql: `UPDATE reports SET cleaning_photo = ?, cleaning_description = ?, submitted_at = datetime('now') WHERE id = ?`,
        args: [photoUrl, description, reportId],
      });
      await db.execute({ sql: "DELETE FROM absent_members WHERE report_id = ?", args: [reportId] });

      if (absentMembers) {
        const parsed = JSON.parse(absentMembers);
        for (const m of parsed) {
          await db.execute({
            sql: "INSERT INTO absent_members (report_id, member_id, name, reason) VALUES (?, ?, ?, ?)",
            args: [reportId, m.member_id || null, m.name, m.reason],
          });
        }
      }
      return json(200, { success: true });
    }

    // ── POST /report/:report_id/edit-photo
    if (method === "POST" && segments[0] === "report" && segments[2] === "edit-photo") {
      const reportId = segments[1];
      const { file } = parseMultipart(event);
      const report = await db.execute({ sql: "SELECT *, submitted_at FROM reports WHERE id = ?", args: [reportId] });
      if (report.rows.length === 0) return json(404, { success: false, message: "Laporan tidak ditemukan" });

      const r = report.rows[0];
      const settings = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'edit_time_limit_minutes'", args: [] });
      const limitMinutes = parseInt((settings.rows[0]?.value as string) || "15");
      const testMode = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'testing_mode'", args: [] });

      if (testMode.rows[0]?.value !== "true") {
        const submittedAt = new Date(
          (r.submitted_at as string)?.includes("Z") ? (r.submitted_at as string) : (r.submitted_at as string) + "Z"
        );
        const diffMinutes = (Date.now() - submittedAt.getTime()) / 60000;
        if (diffMinutes > limitMinutes)
          return json(403, { success: false, message: `Batas waktu edit (${limitMinutes} menit) telah terlewati` });
      }

      let photoUrl = r.cleaning_photo as string;
      if (file) {
        await db.execute({
          sql: "INSERT OR REPLACE INTO file_uploads (filename, data, mime_type) VALUES (?, ?, ?)",
          args: [file.filename, file.data, file.mimeType],
        });
        photoUrl = `/uploads/${file.filename}`;
      }

      await db.execute({ sql: "UPDATE reports SET cleaning_photo = ? WHERE id = ?", args: [photoUrl, reportId] });
      return json(200, { success: true });
    }

    // ── GET /all-reports
    if (method === "GET" && segments[0] === "all-reports") {
      const res = await db.execute(`
        SELECT r.*, u.name as pj_name, u.group_name as pj_group
        FROM reports r JOIN users u ON r.pj_id = u.id
        ORDER BY r.date DESC, r.submitted_at DESC
      `);
      const result = await Promise.all(
        res.rows.map(async (r) => {
          const absents = await db.execute({
            sql: "SELECT * FROM absent_members WHERE report_id = ?",
            args: [r.id as number],
          });
          return { ...r, checkin_photo: toPhotoUrl(r.checkin_photo as string), cleaning_photo: toPhotoUrl(r.cleaning_photo as string), absents: absents.rows };
        })
      );
      return json(200, result);
    }

    // ── DELETE /reports/:id
    if (method === "DELETE" && segments[0] === "reports" && segments[1]) {
      const id = segments[1];
      await db.execute({ sql: "DELETE FROM absent_members WHERE report_id = ?", args: [id] });
      await db.execute({ sql: "DELETE FROM reports WHERE id = ?", args: [id] });
      return json(200, { success: true });
    }

    // ── POST /reports/reset
    if (method === "POST" && segments[0] === "reports" && segments[1] === "reset") {
      await db.execute("DELETE FROM absent_members");
      await db.execute("DELETE FROM reports");
      return json(200, { success: true });
    }

    // ── GET /schedules
    if (method === "GET" && segments[0] === "schedules") {
      const res = await db.execute(`
        SELECT * FROM schedules ORDER BY 
        CASE day WHEN 'Senin' THEN 1 WHEN 'Selasa' THEN 2 WHEN 'Rabu' THEN 3 WHEN 'Kamis' THEN 4 WHEN 'Jumat' THEN 5 ELSE 6 END
      `);
      return json(200, res.rows);
    }

    // ── POST /schedules
    if (method === "POST" && segments[0] === "schedules" && !segments[1]) {
      const { group_name, day } = JSON.parse(event.body || "{}");
      const existing = await db.execute({ sql: "SELECT id FROM schedules WHERE day = ?", args: [day] });
      if (existing.rows.length > 0) return json(400, { success: false, message: `Hari ${day} sudah memiliki jadwal piket` });
      await db.execute({ sql: "INSERT INTO schedules (group_name, day) VALUES (?, ?)", args: [group_name, day] });
      return json(200, { success: true });
    }

    // ── PUT /schedules/:id
    if (method === "PUT" && segments[0] === "schedules" && segments[1]) {
      const id = segments[1];
      const { group_name, day } = JSON.parse(event.body || "{}");
      const existing = await db.execute({
        sql: "SELECT id FROM schedules WHERE day = ? AND id != ?",
        args: [day, id],
      });
      if (existing.rows.length > 0) return json(400, { success: false, message: `Hari ${day} sudah memiliki jadwal piket` });
      await db.execute({ sql: "UPDATE schedules SET group_name = ?, day = ? WHERE id = ?", args: [group_name, day, id] });
      return json(200, { success: true });
    }

    // ── DELETE /schedules/:id
    if (method === "DELETE" && segments[0] === "schedules" && segments[1]) {
      await db.execute({ sql: "DELETE FROM schedules WHERE id = ?", args: [segments[1]] });
      return json(200, { success: true });
    }

    return json(404, { success: false, message: `Route not found: ${method} /${rawPath}` });
  } catch (err: any) {
    console.error("API error:", err);
    return json(500, { success: false, message: err.message || "Internal server error" });
  }
};

// ── Photo URL helper ─────────────────────────────────────────────────────────
// Photos stored in DB are served via the uploads function
function toPhotoUrl(path: string | null | undefined): string {
  if (!path) return "";
  // Already a full URL or starts with /uploads → keep as-is (served by uploads function)
  return path;
}
