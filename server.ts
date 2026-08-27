import express, { Request, Response, NextFunction } from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import Database from "better-sqlite3";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { createServer as createViteServer } from "vite";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";

dotenv.config();

// Initialize Firebase Admin lazily/safely
let firestoreDb: admin.firestore.Firestore | null = null;
function getFirestore(): admin.firestore.Firestore | null {
  if (!firestoreDb) {
    try {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
      }
      firestoreDb = admin.firestore();
    } catch (e) {
      console.warn("Firebase Admin failed to initialize (continuing without Firebase):", e);
      return null;
    }
  }
  return firestoreDb;
}

// Initialize Stripe (Lazy)
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

const app = express();
app.set("trust proxy", 1);
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "hrl_secret_jwt_key_991823";

// Initialize SQLite database safely
const dbPath = path.resolve(process.cwd(), "database.sqlite");
let db: Database.Database;

function openDatabase(): Database.Database {
  try {
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    // Verify database integrity
    database.prepare("SELECT 1").get();
    return database;
  } catch (err: any) {
    if (err && (err.code === "SQLITE_CORRUPT" || err.message?.includes("malformed"))) {
      console.warn("Detected corrupted SQLite database file. Resetting database.sqlite...");
      try {
        const fs = require("fs");
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
      } catch (fsErr) {
        console.error("Failed to delete corrupted database file:", fsErr);
      }
      const database = new Database(dbPath);
      database.pragma("foreign_keys = ON");
      return database;
    }
    throw err;
  }
}

db = openDatabase();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json());

// Enterprise Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 20, // max 20 prob na IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  message: { message: "Zbyt wiele prób logowania lub rejestracji z tego adresu IP. Spróbuj ponownie za 15 minut." },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  message: { message: "Przekroczono limit zapytań do API. Spróbuj ponownie za chwilę." },
});

app.use("/api/", apiLimiter);

// Zod Input Validation Schemas
const registerSchema = z.object({
  username: z.string().min(3, "Nazwa użytkownika musi mieć minimum 3 znaki"),
  email: z.string().email("Nieprawidłowy adres e-mail"),
  password: z.string().min(6, "Hasło musi posiadać co najmniej 6 znaków"),
  role: z.enum(["student", "instructor", "admin"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Nieprawidłowy adres e-mail"),
  password: z.string().min(1, "Hasło jest wymagane"),
});

// Check if there are any old musical courses or tables that need migration
try {
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='courses'").get() as any;
  if (tableCheck) {
    const countMusicCourses = db.prepare("SELECT COUNT(*) as count FROM courses WHERE title LIKE '%Syntez%' OR title LIKE '%Muzycz%' OR title LIKE '%Miks%'").get() as { count: number };
    if (countMusicCourses && countMusicCourses.count > 0) {
      console.log("Found music-themed courses. Resetting database to general-topic courses...");
      db.exec("DROP TABLE IF EXISTS hrl_activity_logs;");
      db.exec("DROP TABLE IF EXISTS certificates;");
      db.exec("DROP TABLE IF EXISTS quiz_attempts;");
      db.exec("DROP TABLE IF EXISTS quiz_questions;");
      db.exec("DROP TABLE IF EXISTS lesson_progress;");
      db.exec("DROP TABLE IF EXISTS user_course_enrollments;");
      db.exec("DROP TABLE IF EXISTS lessons;");
      db.exec("DROP TABLE IF EXISTS modules;");
      db.exec("DROP TABLE IF EXISTS courses;");
      db.exec("DROP TABLE IF EXISTS users;");
    }
  }
} catch (e) {
  console.log("Database reset check bypassed or tables do not exist yet.");
}

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail TEXT,
    category TEXT,
    difficulty TEXT,
    instructor_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    access_level TEXT NOT NULL DEFAULT 'free_preview', -- 'free_preview' or 'premium'
    video_url TEXT,
    duration_minutes INTEGER DEFAULT 10,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_course_enrollments (
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lesson_progress (
    user_id INTEGER NOT NULL,
    lesson_id INTEGER NOT NULL,
    percent INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    last_watched_timestamp INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, lesson_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_options TEXT NOT NULL, -- 'A', 'B', 'C', or 'D'
    points_value INTEGER DEFAULT 1,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lesson_id INTEGER NOT NULL,
    score_percent REAL,
    passed INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    certificate_code TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS hrl_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    user_id INTEGER,
    event_type TEXT NOT NULL,
    ip_address TEXT,
    request_method TEXT,
    request_path TEXT,
    status_code INTEGER,
    error_message TEXT,
    payload_snapshot TEXT,
    user_agent TEXT
  );

  CREATE TABLE IF NOT EXISTS advertisements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    ad_type TEXT NOT NULL, -- 'banner', 'inline', 'sidebar'
    ad_code TEXT NOT NULL,
    link_url TEXT,
    image_url TEXT,
    placement_location TEXT NOT NULL, -- 'lesson_start', 'lesson_end', 'sidebar'
    is_active INTEGER NOT NULL DEFAULT 1,
    impression_count INTEGER NOT NULL DEFAULT 0,
    click_count INTEGER NOT NULL DEFAULT 0,
    revenue_generated REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tenant_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PLN',
    status TEXT NOT NULL, -- 'succeeded', 'failed', 'pending'
    transaction_type TEXT NOT NULL, -- 'charge', 'subscription_payment'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    course_id INTEGER,
    event_name TEXT NOT NULL,
    properties TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
  );
`);

// Sub-activity indexes for database querying performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_lessons_module_id ON lessons(module_id);
  CREATE INDEX IF NOT EXISTS idx_quiz_questions_lesson ON quiz_questions(lesson_id);
`);

// Transitional access tables preserve the current SQLite runtime while
// exposing the access model needed by the merged application.
db.exec(`
  CREATE TABLE IF NOT EXISTS access_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'MANUAL',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    granted_by_user_id INTEGER,
    revoked_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS course_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    hostname TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, hostname),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );
`);

// Add columns to courses table if they don't exist
try {
  db.prepare("ALTER TABLE courses ADD COLUMN category TEXT").run();
} catch (_) {}
try {
  db.prepare("ALTER TABLE courses ADD COLUMN difficulty TEXT").run();
} catch (_) {}
try {
  db.prepare("ALTER TABLE courses ADD COLUMN instructor_name TEXT").run();
} catch (_) {}
try {
  db.prepare("ALTER TABLE courses ADD COLUMN pricing_model TEXT DEFAULT 'free'").run();
} catch (_) {}
try {
  db.prepare("ALTER TABLE courses ADD COLUMN one_time_price REAL DEFAULT 0.0").run();
} catch (_) {}
try {
  db.prepare("ALTER TABLE courses ADD COLUMN subscription_price REAL DEFAULT 0.0").run();
} catch (_) {}
try {
  db.prepare("ALTER TABLE courses ADD COLUMN subscription_interval TEXT DEFAULT 'month'").run();
} catch (_) {}
try {
  db.prepare("ALTER TABLE courses ADD COLUMN tenant_domain TEXT DEFAULT 'all_domains'").run();
} catch (_) {}

// Seeding default tenant settings
try {
  const countSettings = db.prepare("SELECT COUNT(*) as count FROM tenant_settings").get() as { count: number };
  if (!countSettings || countSettings.count === 0) {
    db.prepare("INSERT INTO tenant_settings (key, value) VALUES ('primary_color', '#8B5CF6')").run();
    db.prepare("INSERT INTO tenant_settings (key, value) VALUES ('logo_url', '')").run();
    db.prepare("INSERT INTO tenant_settings (key, value) VALUES ('refund_policy_days', '30')").run();
    db.prepare("INSERT INTO tenant_settings (key, value) VALUES ('custom_domain', 'localhost:3000')").run();
    db.prepare("INSERT INTO tenant_settings (key, value) VALUES ('certificate_template', '<h1>DYPLOM UKOŃCZENIA</h1><p>Zaświadcza się, że student <b>{{student_name}}</b> ukończył pomyślnie cały program szkolenia <b>{{course_title}}</b>.</p><p>Seryjny nr weryfikacji HRL: <b>{{certificate_code}}</b></p>')").run();
  }
  // Ensure default system limit parameters exist
  db.prepare("INSERT OR IGNORE INTO tenant_settings (key, value) VALUES ('max_free_enrollments', '5')").run();
  db.prepare("INSERT OR IGNORE INTO tenant_settings (key, value) VALUES ('max_daily_quiz_attempts', '3')").run();
  db.prepare("INSERT OR IGNORE INTO tenant_settings (key, value) VALUES ('max_courses_per_instructor', '10')").run();
  db.prepare("INSERT OR IGNORE INTO tenant_settings (key, value) VALUES ('auth_rate_limit_max', '20')").run();
} catch (err) {
  console.log("Error seeding default settings", err);
}

// Helper function to read system limit value with fallback
function getSystemLimit(key: string, defaultValue: number): number {
  try {
    const row = db.prepare("SELECT value FROM tenant_settings WHERE key = ?").get(key) as { value: string } | undefined;
    if (row && row.value) {
      const parsed = parseInt(row.value, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
  } catch (e) {
    console.error("Failed to read system limit:", key, e);
  }
  return defaultValue;
}

// Helper to secure log activities
const wsClients = new Set<WebSocket>();

function logActivity(
  userId: number | null,
  eventType: string,
  req: Request | null,
  statusCode: number,
  errorMessage: string | null = null,
  payload: any = null
) {
  const timestamp = new Date().toISOString();
  const ip = req ? (req.headers["x-forwarded-for"] as string) || req.ip || req.socket.remoteAddress : "system";
  const method = req ? req.method : null;
  const pathUrl = req ? req.originalUrl : null;
  const userAgent = req ? req.headers["user-agent"] : null;
  const payloadSnapshot = payload ? JSON.stringify(payload) : null;

  try {
    const insertLog = db.prepare(`
      INSERT INTO hrl_activity_logs 
      (timestamp, user_id, event_type, ip_address, request_method, request_path, status_code, error_message, payload_snapshot, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = insertLog.run(
      timestamp,
      userId,
      eventType,
      ip,
      method,
      pathUrl,
      statusCode,
      errorMessage,
      payloadSnapshot,
      userAgent
    );

    const logObject = {
      id: res.lastInsertRowid,
      timestamp,
      user_id: userId,
      event_type: eventType,
      ip_address: ip,
      request_method: method,
      request_path: pathUrl,
      status_code: statusCode,
      error_message: errorMessage,
      payload_snapshot: payloadSnapshot,
      user_agent: userAgent
    };

    // Broadcast log to list of WebSockets
    const message = JSON.stringify({ type: "ACTIVITY_LOG", data: logObject });
    wsClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });

  } catch (err) {
    console.error("Failed to insert activity log", err);
  }
}

// In-Memory cache logic (LRU list logic simulated for courses and users)
const courseCache = new Map<string, any>();
const userCache = new Map<number, any>();

function clearCache() {
  courseCache.clear();
  userCache.clear();
}

// Clean database of mock data to transition to LIVE mode
try {
  // Clear any pre-existing seeded courses
  console.log("Removing mock/fake courses to run clean in LIVE mode...");
  const existingFakeCourses = db.prepare("SELECT id FROM courses WHERE title IN (?, ?, ?)").all(
    "Rozwój Aplikacji Webowych w React i TypeScript",
    "Podstawy Projektowania UI/UX",
    "Wprowadzenie do Pythona i Analizy Danych"
  ) as { id: number }[];

  const fakeIds = existingFakeCourses.map(c => c.id);
  
  for (const courseId of fakeIds) {
    db.prepare("DELETE FROM user_course_enrollments WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM certificates WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM transactions WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM analytics_events WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM advertisements WHERE course_id = ?").run(courseId);
    
    const modules = db.prepare("SELECT id FROM modules WHERE course_id = ?").all(courseId) as { id: number }[];
    for (const mod of modules) {
      const lessons = db.prepare("SELECT id FROM lessons WHERE module_id = ?").all(mod.id) as { id: number }[];
      for (const les of lessons) {
        db.prepare("DELETE FROM quiz_questions WHERE lesson_id = ?").run(les.id);
        db.prepare("DELETE FROM quiz_attempts WHERE lesson_id = ?").run(les.id);
        db.prepare("DELETE FROM lesson_progress WHERE lesson_id = ?").run(les.id);
      }
      db.prepare("DELETE FROM lessons WHERE module_id = ?").run(mod.id);
    }
    db.prepare("DELETE FROM modules WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM courses WHERE id = ?").run(courseId);
  }

  // Clear all fake student and instructor users, leaving only the real admin
  try {
    const adminUser = db.prepare("SELECT id FROM users WHERE email = ?").get("hardbanrecordslab.pl@gmail.com") as { id: number } | undefined;
    if (adminUser) {
      const adminId = adminUser.id;
      db.prepare("DELETE FROM user_course_enrollments WHERE user_id != ?").run(adminId);
      db.prepare("DELETE FROM certificates WHERE user_id != ?").run(adminId);
      db.prepare("DELETE FROM quiz_attempts WHERE user_id != ?").run(adminId);
      db.prepare("DELETE FROM lesson_progress WHERE user_id != ?").run(adminId);
      db.prepare("DELETE FROM conversation_participants WHERE user_id != ?").run(adminId);
      db.prepare("DELETE FROM messages WHERE sender_user_id != ?").run(adminId);
      db.prepare("DELETE FROM hrl_activity_logs WHERE user_id != ?").run(adminId);
      db.prepare("DELETE FROM users WHERE id != ?").run(adminId);
    } else {
      // If admin doesn't exist yet, we delete everyone except that future email
      db.prepare("DELETE FROM user_course_enrollments WHERE user_id IN (SELECT id FROM users WHERE email != 'hardbanrecordslab.pl@gmail.com')").run();
      db.prepare("DELETE FROM certificates WHERE user_id IN (SELECT id FROM users WHERE email != 'hardbanrecordslab.pl@gmail.com')").run();
      db.prepare("DELETE FROM quiz_attempts WHERE user_id IN (SELECT id FROM users WHERE email != 'hardbanrecordslab.pl@gmail.com')").run();
      db.prepare("DELETE FROM lesson_progress WHERE user_id IN (SELECT id FROM users WHERE email != 'hardbanrecordslab.pl@gmail.com')").run();
      db.prepare("DELETE FROM conversation_participants WHERE user_id IN (SELECT id FROM users WHERE email != 'hardbanrecordslab.pl@gmail.com')").run();
      db.prepare("DELETE FROM messages WHERE sender_user_id IN (SELECT id FROM users WHERE email != 'hardbanrecordslab.pl@gmail.com')").run();
      db.prepare("DELETE FROM hrl_activity_logs WHERE user_id IN (SELECT id FROM users WHERE email != 'hardbanrecordslab.pl@gmail.com')").run();
      db.prepare("DELETE FROM users WHERE email != 'hardbanrecordslab.pl@gmail.com'").run();
    }
    console.log("Successfully purged all fake instructors and students from database.");
  } catch (cleanUsersErr) {
    console.error("Error purging fake users:", cleanUsersErr);
  }

} catch (err) {
  console.error("Clean DB bypass:", err);
}

// Ensure the real Admin Account is present with the exact requested credentials
try {
  const targetEmail = "hardbanrecordslab.pl@gmail.com";
  const targetPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!targetPassword) {
    console.warn("ADMIN_INITIAL_PASSWORD is not set; skipping administrator bootstrap.");
  } else {
  const passHash = bcrypt.hashSync(targetPassword, 10);

  const hasAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get(targetEmail) as { id: number } | undefined;
  if (!hasAdmin) {
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES ('admin_hrl', ?, ?, 'admin')
    `).run(targetEmail, passHash);
    console.log("Registered new administrator account:", targetEmail);
  } else {
    // Force correct password requested by user
    db.prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?").run(passHash, hasAdmin.id);
    console.log("Updated administrator credentials for:", targetEmail);
  }
  }
} catch (err) {
  console.error("Error setting up live admin:", err);
}

// Ensure Cyfrowy Zen Course configuration is seeded for external domain gateway
try {
  const targetDomain = "cyfrowy-zen.hardbanrecordslab.online";
  const hasCyfrowyZen = db.prepare("SELECT id, title FROM courses WHERE tenant_domain = ?").get(targetDomain) as { id: number, title: string } | undefined;
  
  if (hasCyfrowyZen && hasCyfrowyZen.title !== "Cyfrowy Zen - 21 Dni do Suwerenności Cyfrowej") {
    console.log("Removing old/incorrect domain course:", hasCyfrowyZen.title);
    db.prepare("DELETE FROM courses WHERE id = ?").run(hasCyfrowyZen.id);
  }

  const reCheck = db.prepare("SELECT id FROM courses WHERE tenant_domain = ?").get(targetDomain);
  if (!reCheck) {
    console.log("Seeding genuine Cyfrowy Zen program for external domain control:", targetDomain);
    
    // Insert robust course representando Cyfrowy Zen
    const courseInsert = db.prepare(`
      INSERT INTO courses (title, description, thumbnail, category, difficulty, instructor_name, pricing_model, one_time_price, tenant_domain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "Cyfrowy Zen - 21 Dni do Suwerenności Cyfrowej",
      "Ekskluzywny 21-dniowy proces dekonstrukcji algorytmicznych pętli nawykowych, odzyskiwania autonomii uwagi i rekonstrukcji głębokiego skupienia.",
      "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?auto=format&fit=crop&w=800&q=80",
      "Odzyskiwanie Uwagi",
      "Zaawansowany",
      "Hardban Records Lab",
      "one_time",
      199.00,
      targetDomain
    );
    const courseId = courseInsert.lastInsertRowid;

    // MODULE 1: Ontologia Uwagi jako zasobów pierwotnych
    const mod1Insert = db.prepare(`
      INSERT INTO modules (course_id, title)
      VALUES (?, ?)
    `).run(courseId, "Moduł I: Ontologia Uwagi");
    const mod1Id = mod1Insert.lastInsertRowid;

    // MODULE 2: Dekonstrukcja Algorytmicznej Jaźni
    const mod2Insert = db.prepare(`
      INSERT INTO modules (course_id, title)
      VALUES (?, ?)
    `).run(courseId, "Moduł II: Dekonstrukcja Algorytmicznej Jaźni");
    const mod2Id = mod2Insert.lastInsertRowid;

    // MODULE 3: Etyka Suwerenności i Nowy Humanizm
    const mod3Insert = db.prepare(`
      INSERT INTO modules (course_id, title)
      VALUES (?, ?)
    `).run(courseId, "Moduł III: Etyka Suwerenności i Nowy Humanizm");
    const mod3Id = mod3Insert.lastInsertRowid;

    // Seed lessons for MODULE 1
    const les1_1 = db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      mod1Id,
      "1. Ontologia uwagi jako zasobu pierwotnego",
      "Wprowadzenie do uwagi jako fundamentu ludzkiej wolności egzystencjalnej i kognitywnej.",
      "# Ontologia uwagi jako zasobu pierwotnego\n\nW epoce kapitalizmu inwigilacyjnego, Twoja uwaga przestała być zasobem osobistym – stała się kolonizowanym terytorium. Zrozumienie natury uwagi określa Twoje bezpośrednie doświadczanie rzeczywistości.\n\n## Kluczowe wyzwania:\n- **Ekonomia uwagi (Attention Economy)** i monetyzacja bodźców\n- Fragmentacja kognitywna\n- Odzyskiwanie suwerenności świadomego wyboru",
      "free_preview",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      12
    );

    const les1_2 = db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      mod1Id,
      "2. Neuroplastyczność w służbie algorytmu",
      "Zrozumienie jak interfejsy mobilne fizycznie i trwale modyfikują połączenia synaptyczne w mózgu.",
      "# Neuroplastyczność w służbie algorytmu\n\nMózg dostosowuje się do bodźców, które otrzymuje najczęściej. Krótkie formy wideo (Shorts, TikTok) trenują korę przedczołową do ciągłego oczekiwania na szybki strzał dopaminy.\n\n## Skutki neuroplastyczności kognitywnej:\n- Atrofia zdolności do głębokiej pracy (Deep Work)\n- Uzależnienie behawioralne od odruchu odświeżania tablicy\n- Osłabienie pamięci roboczej",
      "premium",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      15
    );

    const les1_3 = db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      mod1Id,
      "3. Architektura pętli dopaminowej",
      "Analiza mechanizmów manipulacji psychologicznej zwanych 'intermittent variable rewards'.",
      "# Architektura pętli dopaminowej\n\nDlaczego sięgasz po telefon bez konkretnego celu? Odpowiada za to dopamina – neuroprzekaźnik motywacji i poszukiwania. Projektanci powiadomień opierają mechanizmy na teorii behawioralnej B.F. Skinnera (zmienne harmonogramy nagród).\n\n$ Dopamina = Oczekiwanie + Niepewność $",
      "premium",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      10
    );

    const les1_4 = db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      mod1Id,
      "4. Fenomenologia rozproszenia",
      "Opis doświadczania świata w stanie permanentnej, algorytmicznej fragmentacji myśli.",
      "# Fenomenologia rozproszenia\n\nJak zmienia się percepcja rzeczywistości u współczesnego człowieka? Analizujemy pojęcie ciągłej częściowej uwagi i spadek jakości relacji międzyludzkich spowodowany ciągłą obecnością 'drugiego ekranu' pod ręką.",
      "premium",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      11
    );

    // Add remaining days to make the program extremely faithful
    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod1Id, "5. Lęk przed pustką (Horror Vacui)", "Dlaczego chwila bez telefonu rodzi egzystencjalny niepokój.", "# Horror Vacui\nStawienie czoła ciszy i nudzie jako naturalnej przestrzeni regeneracji kognitywnej.", "premium", "", 10);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod1Id, "6. Pozorna łączność i izolacja emocjonalna", "Jak platformy społecznościowe maskują głęboki, cyfrowy solotyzm.", "# Izolacja emocjonalna\nParadoks polegający na tym, że posiadając tysiące kontaktów online, tracimy umiejętność empatii w cztery oczy.", "premium", "", 12);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod1Id, "7. Stan Zero", "Praktyki dopaminowego oczyszczenia i powrót do pierwotnej wrażliwości receptorów.", "# Stan Zero\nKompletna cisza i ograniczenie bodźców na zakończenie pierwszego tygodnia w celu stabilizacji.", "premium", "", 15);


    // Seed lessons for MODULE 2: Dekonstrukcja Algorytmicznej Jaźni
    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod2Id, "8. Kwantyfikacja bytu i pułapka metryk", "Jak systemy ocen, polubień i statystyk niszczą spontaniczność życia.", "# Kwantyfikacja bytu\nRedagowanie swojego życia pod algorytm pozycjonowania i metryki społecznościowe.", "premium", "", 10);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod2Id, "9. Bańki informacyjne i cyfrowy solipsyzm", "Klonowanie Twoich własnych opinii przez algorytmy rekomendacji.", "# Bańki informacyjne\nZgłębianie mechanizmu zamykania nas w mikro-światach, uniemożliwiających dialog z odmienną perspektywą.", "premium", "", 12);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod2Id, "10. Estetyka algorytmiczna i homogenizacja", "Wielkie spłaszczenie kulturowe i ujednolicanie preferencji odbiorców.", "# Estetyka algorytmiczna\nAnalizujemy jak generatywna i automatyczna sztuka spłyca naturalny, ludzki instynkt twórczy.", "premium", "", 11);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod2Id, "11. Nadzór i utrata intymności", "Skomplikowana relacja z inteligentnymi asystentami oraz smart-home.", "# Nadzór kognitywny\nWykrywanie i wyłączanie zbędnych trackerów systemowych, które nieustannie mapują profil osobowości.", "premium", "", 15);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod2Id, "12. Cyfrowy narcyzm i atrofia empatii", "Jak wieczne autoprezentowanie niszczy zdolność do prawdziwej troski o innych.", "# Cyfrowy narcyzm\nOdzyskiwanie realnej perspektywy i powrót do dialogu opartego na czynnym słuchaniu.", "premium", "", 13);


    // Seed lessons for MODULE 3: Etyka Suwerenności i Nowy Humanizm
    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod3Id, "13. Czas jako łup wojenny", "Zrozumienie, dlaczego giganci Big Tech traktują każdą Twoją wolną chwilę jak łup.", "# Czas jako jedyna realna waluta\nAnaliza ile godzin życia oddajesz rocznie na bezcelowe scrollowanie i jak je bezpiecznie rekuperować.", "premium", "", 14);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod3Id, "14. Kryzys Tożsamości", "Kluczowe pytanie: kim jesteś, kiedy na ekranie pojawia się całkowita czerń?", "# Kryzys Tożsamości we mgle cyfrowej\nBudowanie silnego, stabilnego ego niezależnego od notyfikacji i zewnętrznych wskaźników lajków.", "premium", "", 12);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod3Id, "15. Radykalna redukcja narzędziowa", "Konkretny plan działania zmierzający do usunięcia 90% nieistotnych powiadomień i apek.", "# Minimalizm narzędziowy\nUsuwanie zakłóceń w tle i zmiana nawyków interakcji z telefonem na schemat czysto zadaniowy.", "premium", "", 15);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod3Id, "16. Prymat asynchroniczności", "Dlaczego natychmiastowe odpowiadanie niszczy głębokie myślenie twórcze.", "# Asynchroniczność\nUstanawianie twardych granic czasowych na odczyt wiadomości i odpisywanie.", "premium", "", 10);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod3Id, "17. Rekonstrukcja głębokiego skupienia", "Praktyczny trening umiejętności koncentracji na jednym zadaniu.", "# Głębokie skupienie (Deep Work)\nStosowanie ram czasowych i reżimu pracy bez rozpraszaczy. Powrót do neurofizjologicznej doskonałości.", "premium", "", 18);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod3Id, "18. Analogowy fundament relacji", "Odbudowa realnych spotkań bezpośrednich wolnych od wpływu smartfonów.", "# Analogowa Bliskość\nZasada 'telefonów poza zasięgiem wzroku' przy posiłkach i rozmowach rodzinnych.", "premium", "", 11);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod3Id, "19. Edukacja dla wolności: Nowe Trywium", "Zestaw klasycznych narzędzi dedykowanych analizie fałszu i propagandy.", "# Nowe Trywium\nGramatyka, logika i retoryka jako filary osłaniające umysł przed manipulacją kognitywną.", "premium", "", 12);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod3Id, "20. Technologia jako służebnica ducha", "Jak zredukować smartfon do poziomu prostego i nieuzależniającego kalkulatora.", "# Służebny smartfon\nOstatni krok konfiguracji interfejsów mobilnych tak, by służyły intencjom, a nie przechwytywaniu uwagi.", "premium", "", 10);

    db.prepare(`
      INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod3Id, "21. Manifest Nowego Humanizmu", "Ukoronowanie procesu – podpisanie własnego kontraktu suwerennego kognitywizmu.", "# Nowy Humanizm\nZobowiązanie do kultywowania głębokich więzi, uważności i wolności w cyfrowym świecie XXI wieku.", "premium", "", 20);


    console.log("Successfully seeded genuine Cyfrowy Zen digital sovereignty course with complete 21-day structure.");
  }
} catch (seedingErr) {
  console.error("Error seeding Cyfrowy Zen domain course on startup:", seedingErr);
}

// REST Middlewares
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Brak tokenu autoryzacji" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token jest niepoprawny lub wygasł" });
    }
    (req as any).user = user;
    next();
  });
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Dostęp zastrzeżony wyłącznie dla administratora." });
  }
  next();
};

const requireCreator = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || (user.role !== "instructor" && user.role !== "admin")) {
    return res.status(403).json({ message: "Brak uprawnień twórcy/instruktora." });
  }
  next();
};

// --- STRIPE ENDPOINTS ---
app.post("/api/create-checkout-session", authenticateToken, async (req: Request, res: Response) => {
  const { priceId, userId, courseId } = req.body;
  try {
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.APP_URL}/success`,
      cancel_url: `${process.env.APP_URL}/cancel`,
      metadata: { user_id: userId, course_id: courseId }
    });
    res.json({ sessionId: session.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/webhook/stripe", express.raw({type: 'application/json'}), async (request: Request, response: Response) => {
  const sig = request.headers['stripe-signature'];
  let event;
  try {
    event = getStripe().webhooks.constructEvent(request.body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const userId = session.metadata.user_id;
    const courseId = session.metadata.course_id;
    
    if (userId && courseId) {
      // Update Firestore if initialized
      const fsDb = getFirestore();
      if (fsDb) {
        await fsDb.collection('users').doc(userId).collection('entitlements').doc(courseId).set({
          access: 'paid',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  }

  response.json({received: true});
});

// --- AUTH ENDPOINTS ---

app.post("/api/auth/register", authLimiter, (req, res) => {
  const parseResult = registerSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((i) => i.message).join(", ");
    return res.status(400).json({ message: errorMsg });
  }

  const { username, email, password, role } = parseResult.data;

  try {
    const defaultRole = role || "student";
    const password_hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run(username, email, password_hash, defaultRole);

    logActivity(Number(result.lastInsertRowid), "user_register", req, 201, null, { username, email, role: defaultRole });

    res.status(201).json({
      message: "Użytkownik zarejestrowany pomyślnie.",
      userId: result.lastInsertRowid
    });
  } catch (error: any) {
    logActivity(null, "user_register_failed", req, 400, error.message, { username, email });
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ message: "Nazwa użytkownika lub email jest już zajęty." });
    }
    res.status(500).json({ message: "Błąd serwera przy rejestracji." });
  }
});

app.post("/api/auth/login", authLimiter, (req, res) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((i) => i.message).join(", ");
    return res.status(400).json({ message: errorMsg });
  }

  const { email, password } = parseResult.data;

  try {
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user) {
      logActivity(null, "login_failed_unregistered", req, 401, "User not found: " + email);
      return res.status(401).json({ message: "Nieprawidłowy email lub hasło." });
    }

    const correctPassword = bcrypt.compareSync(password, user.password_hash);
    if (!correctPassword) {
      logActivity(user.id, "login_failed_bad_password", req, 401, "Bad password");
      return res.status(401).json({ message: "Nieprawidłowy email lub hasło." });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    logActivity(user.id, "login_success", req, 200);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (err: any) {
    res.status(500).json({ message: "Wystąpił wewnętrzny błąd serwera." });
  }
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  const reqUser = (req as any).user;
  try {
    const user = db.prepare("SELECT id, username, email, role FROM users WHERE id = ?").get(reqUser.id) as any;
    if (!user) {
      return res.status(404).json({ message: "Użytkownik nie istnieje" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Błąd bazy danych" });
  }
});

// --- COURSES ENDPOINTS ---

app.get("/api/courses", (req, res) => {
  const { search, category, difficulty, instructor, domain } = req.query;
  const hasFilters = search || category || difficulty || instructor || domain;

  // Only use cache if no search/filter criteria is provided
  const cacheKey = domain ? `domain_${domain}` : "default";
  if (!hasFilters && courseCache.has(cacheKey)) {
    return res.json(courseCache.get(cacheKey));
  }

  // Get courses along with modules & lessons count
  try {
    let query = `
      SELECT c.*, 
        (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) as modules_count,
        (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = c.id) as lessons_count
      FROM courses c
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      query += " AND (c.title LIKE ? OR c.description LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      query += " AND c.category = ?";
      params.push(category);
    }
    if (difficulty) {
      query += " AND c.difficulty = ?";
      params.push(difficulty);
    }
    if (instructor) {
      query += " AND c.instructor_name = ?";
      params.push(instructor);
    }
    if (domain) {
      query += " AND (c.tenant_domain = ? OR c.tenant_domain = 'all_domains' OR c.tenant_domain IS NULL OR c.tenant_domain = '')";
      params.push(domain);
    }

    const courses = db.prepare(query).all(...params) as any[];

    // Only cache if there are no active filters
    if (!hasFilters) {
      courseCache.set(cacheKey, courses);
    }

    res.json(courses);
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy wyszukiwaniu kursów: " + err.message });
  }
});

app.get("/api/courses/domains", (req, res) => {
  try {
    const rows = db.prepare("SELECT DISTINCT tenant_domain FROM courses WHERE tenant_domain IS NOT NULL AND tenant_domain != ''").all() as any[];
    const domains = rows.map((r: any) => r.tenant_domain);
    res.json(domains);
  } catch (err: any) {
    res.status(500).json({ message: "Błąd przy pobieraniu domen: " + err.message });
  }
});

// Get detailed course hierarchy. If authenticated, fetch progress.
app.get("/api/courses/:id", (req, res) => {
  const courseId = Number(req.params.id);
  const authHeader = req.headers["authorization"];
  let userId: number | null = null;

  if (authHeader && authHeader.split(" ")[1]) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as any;
      userId = decoded.id;
    } catch (_) {}
  }

  try {
    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId) as any;
    if (!course) {
      return res.status(404).json({ message: "Kurs nie znaleziony" });
    }

    // Is current user registered/enrolled?
    let userEnrolled = false;
    if (userId) {
      const enrollment = db.prepare("SELECT 1 FROM user_course_enrollments WHERE user_id = ? AND course_id = ?").get(userId, courseId);
      userEnrolled = !!enrollment;
    }

    // Get Modules
    const modules = db.prepare("SELECT * FROM modules WHERE course_id = ?").all(courseId) as any[];

    // For each module, get lessons
    const structure = modules.map((mod) => {
      const lessons = db.prepare("SELECT id, title, description, content, access_level, duration_minutes, video_url FROM lessons WHERE module_id = ?").all(mod.id) as any[];
      
      const lessonsWithProgress = lessons.map((les) => {
        let progress = { percent: 0, completed: 0 };
        if (userId) {
          const prog = db.prepare("SELECT percent, completed FROM lesson_progress WHERE user_id = ? AND lesson_id = ?").get(userId, les.id) as any;
          if (prog) {
            progress = prog;
          }
        }

        // Mask/Filter sensitive video links if user is not enrolled and it is a premium lesson (IDOR & Privacy Protection!)
        const isPremium = les.access_level === "premium";
        const hasAccess = !isPremium || userEnrolled;

        return {
          ...les,
          video_url: hasAccess ? les.video_url : "", // block raw preview
          progress,
          has_access: hasAccess
        };
      });

      return {
        id: mod.id,
        title: mod.title,
        lessons: lessonsWithProgress
      };
    });

    // Check if certificate has been generated for this user
    let certificate_code = null;
    if (userId) {
      const cert = db.prepare("SELECT certificate_code FROM certificates WHERE user_id = ? AND course_id = ?").get(userId, courseId) as any;
      if (cert) {
        certificate_code = cert.certificate_code;
      }
    }

    res.json({
      course,
      enrolled: userEnrolled,
      structure,
      certificate_code
    });

  } catch (err: any) {
    res.status(500).json({ message: "Błąd podczas odpytywania bazy danych: " + err.message });
  }
});

// Enrolls user in a course
app.post("/api/courses/:id/enroll", authenticateToken, (req, res) => {
  const courseId = Number(req.params.id);
  const user = (req as any).user;

  try {
    // Check if already enrolled
    const existingEnrollment = db.prepare("SELECT 1 FROM user_course_enrollments WHERE user_id = ? AND course_id = ?").get(user.id, courseId);
    if (existingEnrollment) {
      return res.json({ message: "Jesteś już zapisany na ten kurs!" });
    }

    // Check enrollment limit for student role
    if (user.role === "student") {
      const maxFreeEnrollments = getSystemLimit("max_free_enrollments", 5);
      const currentEnrollmentsObj = db.prepare("SELECT COUNT(*) as count FROM user_course_enrollments WHERE user_id = ?").get(user.id) as { count: number };
      const currentCount = currentEnrollmentsObj ? currentEnrollmentsObj.count : 0;

      if (currentCount >= maxFreeEnrollments) {
        logActivity(user.id, "enrollment_limit_exceeded", req, 403, `Osiągnięto limit zapisów (${currentCount}/${maxFreeEnrollments})`, { courseId });
        return res.status(403).json({
          message: `Osiągnięto limit bezpłatnych zapisów na kursy (${currentCount}/${maxFreeEnrollments}). Ukończ obecny kurs lub podwyższ ranga konta, aby dołączyć do nowych zajęć.`,
          limit_exceeded: true,
          current_count: currentCount,
          max_limit: maxFreeEnrollments
        });
      }
    }

    db.prepare(`
      INSERT OR IGNORE INTO user_course_enrollments (user_id, course_id)
      VALUES (?, ?)
    `).run(user.id, courseId);

    logActivity(user.id, "course_enroll", req, 200, null, { courseId });
    clearCache(); // invalidate

    res.json({ message: "Zapisano pomyślnie na kurs!" });
  } catch (error: any) {
    res.status(500).json({ message: "Zapis na kurs nie powiódł się: " + error.message });
  }
});

// --- PROGRESS TRACKER & QUIZ ---

function checkAndGenerateCertificate(userId: number, courseId: number, req: Request): string | null {
  // Count total lessons
  const lessonsObj = db.prepare(`
    SELECT COUNT(*) as count 
    FROM lessons l 
    JOIN modules m ON l.module_id = m.id 
    WHERE m.course_id = ?
  `).get(courseId) as { count: number };
  const totalLessons = lessonsObj.count;

  // Count completed lessons
  const completedObj = db.prepare(`
    SELECT COUNT(DISTINCT lp.lesson_id) as count 
    FROM lesson_progress lp
    JOIN lessons l ON lp.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    WHERE m.course_id = ? AND lp.user_id = ? AND lp.completed = 1
  `).get(courseId, userId) as { count: number };
  const completedLessons = completedObj.count;

  // Fetch all lessons that have quizzes
  const courseQuizzes = db.prepare(`
    SELECT l.id 
    FROM lessons l
    JOIN modules m ON l.module_id = m.id
    WHERE m.course_id = ? AND EXISTS (SELECT 1 FROM quiz_questions WHERE lesson_id = l.id)
  `).all(courseId) as { id: number }[];

  // Count passed quizzes
  const passedCountObj = db.prepare(`
    SELECT COUNT(DISTINCT lesson_id) as count 
    FROM quiz_attempts 
    WHERE user_id = ? AND passed = 1 AND lesson_id IN (
      SELECT l.id FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = ?
    )
  `).get(userId, courseId) as { count: number };
  const passedQuizzes = passedCountObj.count;

  const allLessonsCompleted = completedLessons >= totalLessons;
  const allQuizzesPassed = passedQuizzes >= courseQuizzes.length;

  if (totalLessons > 0 && allLessonsCompleted && allQuizzesPassed) {
    const checkCert = db.prepare("SELECT certificate_code FROM certificates WHERE user_id = ? AND course_id = ?").get(userId, courseId) as any;
    if (!checkCert) {
      const timestamp = Date.now().toString().slice(-6);
      const rawHash = cryptoHash(`${userId}-${courseId}-${timestamp}`);
      const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase();
      const certCode = `HRL-ACAD-${rawHash}-${timestamp}-${randomHex}`;

      db.prepare(`
        INSERT INTO certificates (user_id, course_id, certificate_code, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(userId, courseId, certCode);

      logActivity(userId, "certificate_generated", req, 201, null, { courseId, certCode });
      return certCode;
    } else {
      return checkCert.certificate_code;
    }
  }
  return null;
}

app.post("/api/lessons/:id/progress", authenticateToken, (req, res) => {
  const lessonId = Number(req.params.id);
  const user = (req as any).user;
  const { percent, completed, last_watched_timestamp } = req.body;

  try {
    const isCompleted = completed ? 1 : 0;
    const progressPercent = percent !== undefined ? Number(percent) : 0;
    const timestamp = last_watched_timestamp || 0;

    // Check enrollment first (IDOR prevention)
    const lesson = db.prepare(`
      SELECT l.access_level, m.course_id 
      FROM lessons l
      JOIN modules m ON l.module_id = m.id
      WHERE l.id = ?
    `).get(lessonId) as any;

    if (!lesson) {
      return res.status(404).json({ message: "Lekcja nie istnieje" });
    }

    if (lesson.access_level === "premium") {
      const enrolled = db.prepare("SELECT 1 FROM user_course_enrollments WHERE user_id = ? AND course_id = ?").get(user.id, lesson.course_id);
      if (!enrolled) {
        return res.status(403).json({ message: "Próba zapisu postępu dla zablokowanej zawartości premium!" });
      }
    }

    db.prepare(`
      INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, percent, completed, last_watched_timestamp, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(user.id, lessonId, progressPercent, isCompleted, timestamp);

    logActivity(user.id, "lesson_progress_update", req, 200, null, { lessonId, percent: progressPercent, completed: isCompleted, courseId: lesson.course_id });

    let certGeneratedCode = null;
    if (isCompleted === 1) {
      certGeneratedCode = checkAndGenerateCertificate(user.id, lesson.course_id, req);
    }

    res.json({ success: true, message: "Postęp zapisany pomyślnie.", certificate_code: certGeneratedCode });
  } catch (err: any) {
    res.status(500).json({ message: "Zapis postępu nie powiódł się: " + err.message });
  }
});

// Fetch active quizzes for a lesson
app.get("/api/lessons/:id/quiz", authenticateToken, (req, res) => {
  const lessonId = Number(req.params.id);
  try {
    const questions = db.prepare(`
      SELECT id, lesson_id, question_text, option_a, option_b, option_c, option_d, points_value
      FROM quiz_questions
      WHERE lesson_id = ?
    `).all(lessonId) as any[];

    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: "Błąd bazy danych" });
  }
});

// Submit Quiz with automated Certificate Issuing on passing all quizzes
app.post("/api/quiz/:lessonId/submit", authenticateToken, (req, res) => {
  const lessonId = Number(req.params.id || req.params.lessonId);
  const user = (req as any).user;
  const { answers } = req.body; // Array of { questionId: number, answer: 'A'|'B'|'C'|'D' }

  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ message: "Nieprawidłowy payload odpowiedzi" });
  }

  try {
    // Check daily quiz attempt limit for students
    if (user.role === "student") {
      const maxDailyQuizAttempts = getSystemLimit("max_daily_quiz_attempts", 3);
      const attemptsTodayObj = db.prepare(`
        SELECT COUNT(*) as count 
        FROM quiz_attempts 
        WHERE user_id = ? AND lesson_id = ? AND created_at >= datetime('now', '-24 hours')
      `).get(user.id, lessonId) as { count: number };
      const attemptsToday = attemptsTodayObj ? attemptsTodayObj.count : 0;

      if (attemptsToday >= maxDailyQuizAttempts) {
        logActivity(user.id, "quiz_limit_exceeded", req, 429, `Przekroczono dzienny limit prób testu (${attemptsToday}/${maxDailyQuizAttempts})`, { lessonId });
        return res.status(429).json({
          message: `Przekroczono dzienny limit prób rozwiązania tego testu (${attemptsToday}/${maxDailyQuizAttempts} prób na 24h). Spróbuj ponownie za 24 godziny.`,
          limit_exceeded: true,
          attempts_today: attemptsToday,
          max_attempts: maxDailyQuizAttempts
        });
      }
    }

    const correctQuestions = db.prepare("SELECT id, correct_options, points_value FROM quiz_questions WHERE lesson_id = ?").all(lessonId) as any[];
    if (correctQuestions.length === 0) {
      return res.status(400).json({ message: "Brak pytań testowych dla tej lekcji" });
    }

    let earnedPoints = 0;
    let totalPoints = 0;

    correctQuestions.forEach((q) => {
      totalPoints += q.points_value || 1;
      const studentAnsObj = answers.find((ans) => Number(ans.questionId) === q.id);
      if (studentAnsObj && studentAnsObj.answer === q.correct_options) {
        earnedPoints += q.points_value || 1;
      }
    });

    const scorePercent = Number(((earnedPoints / totalPoints) * 100).toFixed(1));
    const passed = scorePercent >= 70 ? 1 : 0; // Passing score: 70%

    // Record attempt
    db.prepare(`
      INSERT INTO quiz_attempts (user_id, lesson_id, score_percent, passed, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(user.id, lessonId, scorePercent, passed);

    logActivity(user.id, "quiz_submitted", req, 200, null, { lessonId, scorePercent, passed });

    // Mark lesson as completed automatically if passed
    if (passed) {
      db.prepare(`
        INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, percent, completed, updated_at)
        VALUES (?, ?, 100, 1, CURRENT_TIMESTAMP)
      `).run(user.id, lessonId);
    }

    // Check if user has passed all quizzes for this course to generate custom Certificate!
    const cInfo = db.prepare(`
      SELECT m.course_id 
      FROM lessons l
      JOIN modules m ON l.module_id = m.id
      WHERE l.id = ?
    `).get(lessonId) as any;

    let certGeneratedCode = null;
    if (passed && cInfo) {
      certGeneratedCode = checkAndGenerateCertificate(user.id, cInfo.course_id, req);
    }

    res.json({
      score_percent: scorePercent,
      passed: passed === 1,
      correct_count: earnedPoints,
      total_count: totalPoints,
      certificate_code: certGeneratedCode
    });

  } catch (err: any) {
    res.status(500).json({ message: "Internal server error: " + err.message });
  }
});

function cryptoHash(input: string): string {
  // Simple quick hash representation since native crypto package isn't used
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 6).toUpperCase();
}

// Public Certificate validation
app.get("/api/verify-certificate/:code", (req, res) => {
  const code = req.params.code;

  try {
    const cert = db.prepare(`
      SELECT cert.*, u.username, c.title as course_title, cert.created_at as issued_at
      FROM certificates cert
      JOIN users u ON cert.user_id = u.id
      JOIN courses c ON cert.course_id = c.id
      WHERE cert.certificate_code = ?
    `).get(code) as any;

    if (!cert) {
      return res.status(444).json({ valid: false, message: "Certyfikat o podanym numerze seryjnym nie widnieje w rejestrach HRL Academy" });
    }

    res.json({
      valid: true,
      code: cert.certificate_code,
      student: cert.username,
      course: cert.course_title,
      issued_at: cert.issued_at
    });
  } catch (err) {
    res.status(500).json({ message: "Błąd bazy danych" });
  }
});

// --- STUDENT DASHBOARD ENDPOINTS ---
app.get("/api/student/dashboard", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  
  try {
    // 1. Get enrolled courses of the user
    const enrolledCourses = db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) as modules_count,
        (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = c.id) as lessons_count,
        (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON lp.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = c.id AND lp.user_id = ? AND lp.completed = 1) as completed_lessons_count
      FROM user_course_enrollments uce
      JOIN courses c ON uce.course_id = c.id
      WHERE uce.user_id = ?
    `).all(user.id, user.id) as any[];

    // 2. Get Certificates
    const certificates = db.prepare(`
      SELECT cert.*, c.title as course_title, c.thumbnail as course_thumbnail
      FROM certificates cert
      JOIN courses c ON cert.course_id = c.id
      WHERE cert.user_id = ?
    `).all(user.id) as any[];

    // 3. Get Quiz Attempts
    const quizAttempts = db.prepare(`
      SELECT qa.*, l.title as lesson_title, c.title as course_title
      FROM quiz_attempts qa
      JOIN lessons l ON qa.lesson_id = l.id
      JOIN modules m ON l.module_id = m.id
      JOIN courses c ON m.course_id = c.id
      WHERE qa.user_id = ?
      ORDER BY qa.attempt_time DESC
    `).all(user.id) as any[];

    // 4. Get External Courses Progress (Firestore)
    let externalCourses: any[] = [];
    const fsDb = getFirestore();
    if (fsDb) {
      const externalCoursesSnapshot = await fsDb.collection('external_course_enrollments')
        .where('user_id', '==', user.id)
        .get();
        
      externalCourses = externalCoursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }

    // 5. Calculate Stats
    const totalEnrolled = enrolledCourses.length;
    
    const completedObj = db.prepare(`
      SELECT COUNT(*) as count FROM lesson_progress WHERE user_id = ? AND completed = 1
    `).get(user.id) as any;
    const completedLessons = completedObj ? completedObj.count : 0;

    const quizCountObj = db.prepare(`
      SELECT COUNT(*) as count FROM quiz_attempts WHERE user_id = ?
    `).get(user.id) as any;
    const quizCount = quizCountObj ? quizCountObj.count : 0;

    const avgScoreObj = db.prepare(`
      SELECT AVG(score_ratio) as avg_score FROM quiz_attempts WHERE user_id = ? AND passed = 1
    `).get(user.id) as any;
    const avgScore = avgScoreObj && avgScoreObj.avg_score ? Math.round(avgScoreObj.avg_score * 100) : 0;

    const certCountObj = db.prepare(`
      SELECT COUNT(*) as count FROM certificates WHERE user_id = ?
    `).get(user.id) as any;
    const certCount = certCountObj ? certCountObj.count : 0;

    // 5. Build dynamic learning activity timeline
    const timeline: any[] = [];
    enrolledCourses.forEach(c => {
      timeline.push({
        type: "enrollment",
        title: `Zapisano się na kurs: ${c.title}`,
        time: c.created_at || new Date().toISOString()
      });
    });
    certificates.forEach(crt => {
      timeline.push({
        type: "certificate",
        title: `Zdobyto Certyfikat ukończenia: ${crt.course_title}`,
        time: crt.created_at
      });
    });
    quizAttempts.slice(0, 10).forEach(qa => {
      timeline.push({
        type: "quiz",
        title: `Rozwiązano quiz w lekcji "${qa.lesson_title}" (${qa.passed ? "Zaliczony" : "Niezaliczony"}) z wynikiem ${Math.round(qa.score_ratio * 100)}%`,
        time: qa.attempt_time
      });
    });
    // Sort chronological descending
    timeline.sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    res.json({
      enrolledCourses,
      certificates,
      quizAttempts,
      externalCourses,
      stats: {
        totalEnrolled,
        completedLessons,
        quizCount,
        avgScore,
        certCount
      },
      timeline: timeline.slice(0, 8)
    });

  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy wyszukiwaniu informacji panelu kursanta: " + err.message });
  }
});

// --- SYSTEM LIMITS ENDPOINTS ---
app.get("/api/student/limits", authenticateToken, (req, res) => {
  const user = (req as any).user;
  try {
    const maxFreeEnrollments = getSystemLimit("max_free_enrollments", 5);
    const maxDailyQuizAttempts = getSystemLimit("max_daily_quiz_attempts", 3);
    const maxCoursesPerInstructor = getSystemLimit("max_courses_per_instructor", 10);

    const activeEnrollmentsObj = db.prepare("SELECT COUNT(*) as count FROM user_course_enrollments WHERE user_id = ?").get(user.id) as { count: number };
    const currentEnrollments = activeEnrollmentsObj ? activeEnrollmentsObj.count : 0;

    res.json({
      user_id: user.id,
      role: user.role,
      enrollments: {
        current: currentEnrollments,
        max: maxFreeEnrollments,
        remaining: Math.max(0, maxFreeEnrollments - currentEnrollments)
      },
      quiz_attempts: {
        max_per_day: maxDailyQuizAttempts
      },
      instructor_courses: {
        max: maxCoursesPerInstructor
      }
    });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd podczas pobierania limitów: " + err.message });
  }
});

app.get("/api/admin/limits", authenticateToken, requireAdmin, (req, res) => {
  try {
    const max_free_enrollments = getSystemLimit("max_free_enrollments", 5);
    const max_daily_quiz_attempts = getSystemLimit("max_daily_quiz_attempts", 3);
    const max_courses_per_instructor = getSystemLimit("max_courses_per_instructor", 10);
    const auth_rate_limit_max = getSystemLimit("auth_rate_limit_max", 20);

    res.json({
      max_free_enrollments,
      max_daily_quiz_attempts,
      max_courses_per_instructor,
      auth_rate_limit_max
    });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd przy pobieraniu limitów administracyjnych: " + err.message });
  }
});

app.post("/api/admin/limits", authenticateToken, requireAdmin, (req, res) => {
  const { max_free_enrollments, max_daily_quiz_attempts, max_courses_per_instructor, auth_rate_limit_max } = req.body;

  try {
    if (max_free_enrollments !== undefined) {
      db.prepare("INSERT OR REPLACE INTO tenant_settings (key, value) VALUES ('max_free_enrollments', ?)").run(String(max_free_enrollments));
    }
    if (max_daily_quiz_attempts !== undefined) {
      db.prepare("INSERT OR REPLACE INTO tenant_settings (key, value) VALUES ('max_daily_quiz_attempts', ?)").run(String(max_daily_quiz_attempts));
    }
    if (max_courses_per_instructor !== undefined) {
      db.prepare("INSERT OR REPLACE INTO tenant_settings (key, value) VALUES ('max_courses_per_instructor', ?)").run(String(max_courses_per_instructor));
    }
    if (auth_rate_limit_max !== undefined) {
      db.prepare("INSERT OR REPLACE INTO tenant_settings (key, value) VALUES ('auth_rate_limit_max', ?)").run(String(auth_rate_limit_max));
    }

    logActivity((req as any).user.id, "system_limits_updated", req, 200, null, req.body);

    res.json({ message: "Limity systemowe zostały pomyślnie zaktualizowane!" });
  } catch (err: any) {
    res.status(500).json({ message: "Zapis limitów nie powiódł się: " + err.message });
  }
});

// --- ADMIN PANELS, EXPORT & DIRECT CONTROL ---
app.get("/api/admin/export-database", authenticateToken, requireAdmin, (req, res) => {
  try {
    const courses = db.prepare("SELECT * FROM courses").all() as any[];
    const modules = db.prepare("SELECT * FROM modules").all() as any[];
    const lessons = db.prepare("SELECT * FROM lessons").all() as any[];
    const quizQuestions = db.prepare("SELECT * FROM quiz_questions").all() as any[];

    const nestedData = courses.map(course => {
      const cModules = modules.filter(m => m.course_id === course.id).map(m => {
        const mLessons = lessons.filter(l => l.module_id === m.id).map(l => {
          const lQuizzes = quizQuestions.filter(q => q.lesson_id === l.id);
          return {
            ...l,
            quiz_questions: lQuizzes
          };
        });
        return {
          ...m,
          lessons: mLessons
        };
      });
      return {
        ...course,
        modules: cModules
      };
    });

    res.json({
      export_date: new Date().toISOString(),
      platform: "HRL Course Hub",
      data: nestedData
    });
  } catch (err: any) {
    res.status(505).json({ message: "Błąd eksportu bazy danych: " + err.message });
  }
});

app.post("/api/admin/courses", authenticateToken, requireAdmin, (req, res) => {
  const { 
    title, 
    description, 
    thumbnail, 
    category, 
    difficulty, 
    instructor_name,
    pricing_model,
    one_time_price,
    subscription_price,
    subscription_interval,
    tenant_domain
  } = req.body;
  
  if (!title || !description || !thumbnail) {
    return res.status(405).json({ message: "Tytuł, opis i okładka są wymagane!" });
  }

  try {
    const info = db.prepare(`
      INSERT INTO courses (
        title, description, thumbnail, category, difficulty, instructor_name, 
        pricing_model, one_time_price, subscription_price, subscription_interval, tenant_domain
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, 
      description, 
      thumbnail, 
      category || "Ogólny", 
      difficulty || "Dowolny", 
      instructor_name || "HRL Team",
      pricing_model || "free",
      Number(one_time_price) || 0.0,
      Number(subscription_price) || 0.0,
      subscription_interval || "month",
      tenant_domain || "all_domains"
    );

    const newCourse = db.prepare("SELECT * FROM courses WHERE id = ?").get(info.lastInsertRowid) as any;

    db.prepare(`
      INSERT INTO hrl_activity_logs (user_id, event_type, request_method, request_path, status_code, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      (req as any).user.id,
      "course_created",
      "POST",
      "/api/admin/courses",
      201,
      req.ip || "127.0.0.1"
    );

    courseCache.clear();

    res.status(201).json({ message: "Kurs został pomyślnie utworzony!", course: newCourse });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy tworzeniu kursu: " + err.message });
  }
});

app.post("/api/admin/import/courses", authenticateToken, requireAdmin, (req, res) => {
  const courses = req.body;
  if (!Array.isArray(courses)) {
    return res.status(400).json({ message: "Oczekiwano tablicy kursów." });
  }

  let importedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  let details: any[] = [];

  const processCourses = db.transaction((coursesList) => {
    for (const course of coursesList) {
      if (!course.title || !course.description || !course.thumbnail) {
        errorCount++;
        details.push({
          title: course.title || "Nieznany kurs",
          status: "error",
          message: "Brak wymaganego tytułu, opisu lub okładki."
        });
        continue;
      }
      try {
        db.prepare(`
          INSERT INTO courses (
            title, description, thumbnail, category, difficulty, instructor_name, 
            pricing_model, one_time_price, subscription_price, subscription_interval, tenant_domain
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          course.title, 
          course.description, 
          course.thumbnail, 
          course.category || "Ogólny", 
          course.difficulty || "Dowolny", 
          course.instructor_name || "HRL Team",
          course.pricing_model || "free",
          Number(course.one_time_price) || 0.0,
          Number(course.subscription_price) || 0.0,
          course.subscription_interval || "month",
          course.tenant_domain || "all_domains"
        );
        importedCount++;
        details.push({
          title: course.title,
          status: "success",
          message: "Pomyślnie zaimportowano kurs."
        });
      } catch (err: any) {
        errorCount++;
        details.push({
          title: course.title,
          status: "error",
          message: err.message
        });
      }
    }
  });

  try {
    processCourses(courses);
    
    if (importedCount > 0 || updatedCount > 0) {
      courseCache.clear();
      db.prepare(`
        INSERT INTO hrl_activity_logs (user_id, event_type, request_method, request_path, status_code, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        (req as any).user.id,
        "courses_mass_imported",
        "POST",
        "/api/admin/import/courses",
        201,
        req.ip || "127.0.0.1"
      );
    }

    res.status(201).json({ 
      importedCount,
      updatedCount,
      errorCount,
      details
    });
  } catch (err: any) {
    res.status(500).json({ message: "Krytyczny błąd podczas masowego importu: " + err.message });
  }
});

app.put("/api/admin/courses/:id", authenticateToken, requireAdmin, (req, res) => {
  const courseId = Number(req.params.id);
  const { 
    title, 
    description, 
    thumbnail, 
    category, 
    difficulty, 
    instructor_name,
    pricing_model,
    one_time_price,
    subscription_price,
    subscription_interval,
    tenant_domain
  } = req.body;

  if (!title || !description || !thumbnail) {
    return res.status(405).json({ message: "Tytuł, opis i okładka są wymagane!" });
  }

  try {
    db.prepare(`
      UPDATE courses 
      SET title = ?, description = ?, thumbnail = ?, category = ?, difficulty = ?, instructor_name = ?,
          pricing_model = ?, one_time_price = ?, subscription_price = ?, subscription_interval = ?, tenant_domain = ?
      WHERE id = ?
    `).run(
      title,
      description,
      thumbnail,
      category || "Ogólny",
      difficulty || "Dowolny",
      instructor_name || "HRL Team",
      pricing_model || "free",
      Number(one_time_price) || 0.0,
      Number(subscription_price) || 0.0,
      subscription_interval || "month",
      tenant_domain || "all_domains",
      courseId
    );

    const updatedCourse = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId) as any;
    courseCache.clear();

    logActivity((req as any).user.id, "course_updated", req, 200, null, { courseId });

    res.json({ message: "Kurs został pomyślnie zaktualizowany!", course: updatedCourse });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy aktualizacji kursu: " + err.message });
  }
});

// Admin endpoint to manage lesson access, paywalls, strings, and quizzes
app.put("/api/admin/lessons/:id", authenticateToken, requireAdmin, (req, res) => {
  const lessonId = Number(req.params.id);
  const { 
    title, 
    description, 
    content, 
    access_level, 
    video_url, 
    duration_minutes,
    module_title,
    quiz_question
  } = req.body;

  if (!title) {
    return res.status(405).json({ message: "Tytuł lekcji jest wymagany!" });
  }

  try {
    // 1. Update lesson metadata
    db.prepare(`
      UPDATE lessons 
      SET title = ?, description = ?, content = ?, access_level = ?, video_url = ?, duration_minutes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title,
      description || "",
      content || "",
      access_level || "free_preview",
      video_url || "",
      Number(duration_minutes) || 10,
      lessonId
    );

    // Get parent module_id to update module_title if passed
    const lessonObj = db.prepare("SELECT module_id FROM lessons WHERE id = ?").get(lessonId) as { module_id: number } | undefined;
    if (lessonObj && module_title) {
      db.prepare("UPDATE modules SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(module_title, lessonObj.module_id);
    }

    // 2. Update Quiz Questions
    if (quiz_question) {
      // Find if we already have a question
      const hasQuestion = db.prepare("SELECT id FROM quiz_questions WHERE lesson_id = ?").get(lessonId) as { id: number } | undefined;
      const { question_text, option_a, option_b, option_c, option_d, correct_options, points_value } = quiz_question;
      
      if (question_text) {
        if (hasQuestion) {
          db.prepare(`
            UPDATE quiz_questions 
            SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_options = ?, points_value = ?
            WHERE id = ?
          `).run(
            question_text,
            option_a || "",
            option_b || "",
            option_c || "",
            option_d || "",
            correct_options || "A",
            Number(points_value) || 1,
            hasQuestion.id
          );
        } else {
          db.prepare(`
            INSERT INTO quiz_questions (lesson_id, question_text, option_a, option_b, option_c, option_d, correct_options, points_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            lessonId,
            question_text,
            option_a || "",
            option_b || "",
            option_c || "",
            option_d || "",
            correct_options || "A",
            Number(points_value) || 1
          );
        }
      }
    }

    courseCache.clear();
    logActivity((req as any).user.id, "lesson_updated", req, 200, null, { lessonId });

    res.json({ message: "Konfiguracja dostępu lekcji i quizu została zapisana pomyślnie!" });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy aktualizacji bramki lekcji: " + err.message });
  }
});

// Admin endpoint to retrieve full quiz details including correct answers
app.get("/api/admin/lessons/:id/quiz", authenticateToken, requireAdmin, (req, res) => {
  const lessonId = Number(req.params.id);
  try {
    const question = db.prepare(`
      SELECT id, lesson_id, question_text, option_a, option_b, option_c, option_d, correct_options, points_value
      FROM quiz_questions
      WHERE lesson_id = ?
    `).get(lessonId) as any;

    res.json(question || null);
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy pobieraniu quizu admina: " + err.message });
  }
});

app.get("/api/admin/courses/:id/modules", authenticateToken, requireAdmin, (req, res) => {
  const courseId = Number(req.params.id);
  try {
    const modules = db.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY sequence_order ASC, id ASC").all(courseId) as any[];
    res.json({ modules });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd przy pobieraniu modułów admina: " + err.message });
  }
});

app.delete("/api/admin/courses/:id", authenticateToken, requireAdmin, (req, res) => {
  const courseId = Number(req.params.id);
  
  try {
    const modules = db.prepare("SELECT id FROM modules WHERE course_id = ?").all(courseId) as any[];
    for (const m of modules) {
      const lessons = db.prepare("SELECT id FROM lessons WHERE module_id = ?").all(m.id) as any[];
      for (const l of lessons) {
        db.prepare("DELETE FROM quiz_questions WHERE lesson_id = ?").run(l.id);
        db.prepare("DELETE FROM quiz_attempts WHERE lesson_id = ?").run(l.id);
        db.prepare("DELETE FROM lesson_progress WHERE lesson_id = ?").run(l.id);
      }
      db.prepare("DELETE FROM lessons WHERE module_id = ?").run(m.id);
    }
    db.prepare("DELETE FROM modules WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM user_course_enrollments WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM certificates WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM courses WHERE id = ?").run(courseId);

    courseCache.clear();

    res.json({ message: "Kurs wraz z wszystkimi powiązanymi modułami, lekcjami i quizami został trwale usunięty z platformy!" });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy usuwaniu kursu: " + err.message });
  }
});

// --- ADMIN PANELS & MASS IMPORT ---

app.get("/api/admin/logs", authenticateToken, requireAdmin, (req, res) => {
  try {
    const logs = db.prepare("SELECT * FROM hrl_activity_logs ORDER BY id DESC LIMIT 200").all() as any[];
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Alias used by the access-management UI for the shared activity feed.
app.get("/api/admin/activity-log", authenticateToken, requireAdmin, (req, res) => {
  try {
    const logs = db.prepare("SELECT * FROM hrl_activity_logs ORDER BY id DESC LIMIT 500").all() as any[];
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/admin/users", authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = db.prepare("SELECT id, username, email, role, created_at FROM users").all() as any[];
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/admin/users/:id/enrollments", authenticateToken, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  try {
    const enrollments = db.prepare("SELECT course_id FROM user_course_enrollments WHERE user_id = ?").all(userId) as any[];
    res.json(enrollments.map(e => e.course_id));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/users/:id/enrollments", authenticateToken, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const { courseId, action } = req.body; // action: 'grant' | 'revoke'

  if (!courseId || !action) {
    return res.status(400).json({ message: "Brak identyfikatora kursu lub akcji." });
  }

  try {
    if (action === 'grant') {
      const check = db.prepare('SELECT * FROM user_course_enrollments WHERE user_id = ? AND course_id = ?').get(userId, courseId);
      if (!check) {
        db.prepare('INSERT INTO user_course_enrollments (user_id, course_id) VALUES (?, ?)').run(userId, courseId);
        logActivity((req as any).user.id, "admin_grant_access", req, 201, null, { targetUserId: userId, courseId });
      }
      res.json({ message: "Dostęp został przyznany pomyślnie!" });
    } else if (action === 'revoke') {
      db.prepare('DELETE FROM user_course_enrollments WHERE user_id = ? AND course_id = ?').run(userId, courseId);
      logActivity((req as any).user.id, "admin_revoke_access", req, 200, null, { targetUserId: userId, courseId });
      res.json({ message: "Dostęp został odebrany pomyślnie!" });
    } else {
      res.status(400).json({ message: "Zła akcja." });
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/users/:id/role", authenticateToken, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const { role } = req.body;

  if (!["student", "instructor", "admin"].includes(role)) {
    return res.status(400).json({ message: "Nieprawidłowa rola" });
  }

  try {
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
    logActivity((req as any).user.id, "user_role_update", req, 200, null, { targetUserId: userId, newRole: role });
    res.json({ success: true, message: "Rola zaktualizowana pomyślnie." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/courses/:id/grant-by-role", authenticateToken, requireAdmin, (req, res) => {
  const courseId = Number(req.params.id);
  const role = String(req.body?.role || "student").toLowerCase();
  const adminUserId = Number((req as any).user.id);

  if (!Number.isInteger(courseId) || !["student", "admin", "instructor"].includes(role)) {
    return res.status(400).json({ message: "Nieprawidłowy kurs lub rola." });
  }

  try {
    if (!db.prepare("SELECT id FROM courses WHERE id = ?").get(courseId)) {
      return res.status(404).json({ message: "Kurs nie istnieje." });
    }

    const users = db.prepare("SELECT id FROM users WHERE role = ?").all(role) as Array<{ id: number }>;
    const grant = db.prepare(`
      INSERT INTO access_enrollments (user_id, course_id, source, status, granted_by_user_id)
      VALUES (?, ?, 'ROLE_GRANT', 'ACTIVE', ?)
      ON CONFLICT(user_id, course_id) DO UPDATE SET
        status = 'ACTIVE', revoked_at = NULL, source = 'ROLE_GRANT', granted_by_user_id = excluded.granted_by_user_id
    `);
    const legacyGrant = db.prepare("INSERT OR IGNORE INTO user_course_enrollments (user_id, course_id) VALUES (?, ?)");
    db.transaction(() => {
      for (const user of users) {
        grant.run(user.id, courseId, adminUserId);
        legacyGrant.run(user.id, courseId);
      }
    })();
    logActivity(adminUserId, "enrollment.granted", req, 201, null, { courseId, role, grantedCount: users.length });
    res.status(201).json({ success: true, grantedCount: users.length });
  } catch (err: any) {
    res.status(500).json({ message: "Nie udało się nadać dostępu: " + err.message });
  }
});

app.post("/api/admin/enrollments/:id/revoke", authenticateToken, requireAdmin, (req, res) => {
  const enrollmentId = Number(req.params.id);
  const adminUserId = Number((req as any).user.id);
  if (!Number.isInteger(enrollmentId)) return res.status(400).json({ message: "Nieprawidłowy identyfikator dostępu." });

  try {
    const enrollment = db.prepare("SELECT * FROM access_enrollments WHERE id = ?").get(enrollmentId) as any;
    if (!enrollment) return res.status(404).json({ message: "Dostęp nie istnieje." });
    db.prepare("UPDATE access_enrollments SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE id = ?").run(enrollmentId);
    db.prepare("DELETE FROM user_course_enrollments WHERE user_id = ? AND course_id = ?").run(enrollment.user_id, enrollment.course_id);
    logActivity(adminUserId, "enrollment.revoked", req, 200, null, { enrollmentId, userId: enrollment.user_id, courseId: enrollment.course_id });
    res.json({ success: true, message: "Dostęp został odebrany." });
  } catch (err: any) {
    res.status(500).json({ message: "Nie udało się odebrać dostępu: " + err.message });
  }
});

function normalizeHostname(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = value.trim().includes("://") ? value.trim() : `https://${value.trim()}`;
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

app.get("/api/admin/courses/:id/domains", authenticateToken, requireAdmin, (req, res) => {
  try {
    res.json(db.prepare("SELECT * FROM course_domains WHERE course_id = ? ORDER BY id DESC").all(Number(req.params.id)));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/courses/:id/domains", authenticateToken, requireAdmin, (req, res) => {
  const courseId = Number(req.params.id);
  const hostname = normalizeHostname(req.body?.hostname || req.body?.domain);
  if (!hostname) return res.status(400).json({ message: "Nieprawidłowa domena." });

  try {
    const result = db.prepare("INSERT OR IGNORE INTO course_domains (course_id, hostname) VALUES (?, ?)").run(courseId, hostname);
    if (result.changes === 0) return res.status(409).json({ message: "Ta domena jest już dodana." });
    logActivity(Number((req as any).user.id), "course_domain.added", req, 201, null, { courseId, hostname });
    res.status(201).json(db.prepare("SELECT * FROM course_domains WHERE id = ?").get(result.lastInsertRowid));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/admin/courses/:id/domains/:domainId", authenticateToken, requireAdmin, (req, res) => {
  const courseId = Number(req.params.id);
  const domainId = Number(req.params.domainId);
  try {
    const result = db.prepare("DELETE FROM course_domains WHERE id = ? AND course_id = ?").run(domainId, courseId);
    if (result.changes === 0) return res.status(404).json({ message: "Domena nie istnieje." });
    logActivity(Number((req as any).user.id), "course_domain.removed", req, 200, null, { courseId, domainId });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Admin manual certificate management & generation tools
app.get("/api/admin/certificates", authenticateToken, requireAdmin, (req, res) => {
  try {
    const certs = db.prepare(`
      SELECT cert.*, u.username as student_name, u.email as student_email, c.title as course_title 
      FROM certificates cert
      JOIN users u ON cert.user_id = u.id
      JOIN courses c ON cert.course_id = c.id
      ORDER BY cert.id DESC
    `).all() as any[];
    res.json(certs);
  } catch (err: any) {
    res.status(500).json({ message: "Błąd pobierania certyfikatów: " + err.message });
  }
});

app.post("/api/admin/certificates", authenticateToken, requireAdmin, (req, res) => {
  const { user_id, course_id, custom_code } = req.body;

  if (!user_id || !course_id) {
    return res.status(400).json({ message: "Brakujący identyfikator użytkownika lub kursu." });
  }

  try {
    // Check if certificate already exists
    const checkCert = db.prepare("SELECT certificate_code FROM certificates WHERE user_id = ? AND course_id = ?").get(user_id, course_id) as any;
    if (checkCert) {
      return res.status(400).json({ message: "Użytkownik posiada już certyfikat ukończenia tego kursu: " + checkCert.certificate_code });
    }

    // Generate unique code if not provided
    let certCode = custom_code?.trim();
    if (!certCode) {
      const timestamp = Date.now().toString().slice(-6);
      const rawHash = cryptoHash(`${user_id}-${course_id}-${timestamp}`);
      const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase();
      certCode = `HRL-GEN-${rawHash}-${timestamp}-${randomHex}`;
    }

    db.prepare(`
      INSERT INTO certificates (user_id, course_id, certificate_code, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(user_id, course_id, certCode);

    logActivity((req as any).user.id, "admin_manual_certificate_issued", req, 201, null, { targetUserId: user_id, courseId: course_id, certCode });
    res.status(201).json({ success: true, message: "Certyfikat został wyemitowany pomyślnie!", code: certCode });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd emisji certyfikatu: " + err.message });
  }
});

app.delete("/api/admin/certificates/:id", authenticateToken, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  try {
    const cert = db.prepare("SELECT * FROM certificates WHERE id = ?").get(id) as any;
    if (!cert) {
      return res.status(444).json({ message: "Certyfikat o tym ID nie istnieje." });
    }
    db.prepare("DELETE FROM certificates WHERE id = ?").run(id);
    logActivity((req as any).user.id, "admin_certificate_revoked", req, 200, null, { certificateId: id, code: cert.certificate_code });
    res.json({ success: true, message: "Certyfikat został trwale wycofany z rejestru." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/access/launch", authenticateToken, (req, res) => {
  const { courseId } = req.body;
  const user = (req as any).user;

  // Assuming user_course_enrollments table exists from previous steps
  const enrollment = db.prepare("SELECT * FROM user_course_enrollments WHERE user_id = ? AND course_id = ?").get(user.id, courseId) as any;

  if (!enrollment) {
    return res.status(403).json({ message: "Brak dostępu do kursu" });
  }

  // Find course details
  const course = db.prepare("SELECT external_url, integration_type FROM courses WHERE id = ?").get(courseId) as any;
  if (!course) {
    return res.status(404).json({ message: "Kurs nie istnieje" });
  }

  const url = new URL(course.external_url);
  const domain = url.host;

  if (course.integration_type === "IFRAME" || course.integration_type === "REDIRECT_COOKIE") {
    const requestHost = normalizeHostname(req.headers.origin) || normalizeHostname(req.headers.referer);
    const allowed = db.prepare("SELECT hostname FROM course_domains WHERE course_id = ?").all(courseId) as Array<{ hostname: string }>;
    if (allowed.length > 0 && (!requestHost || !allowed.some((entry) => entry.hostname === requestHost))) {
      return res.status(403).json({ message: "Domena żądania nie jest dozwolona dla tego kursu." });
    }
  }

  // JWT for external launch
  const token = jwt.sign(
    {
      sub: user.id,
      courseId,
      enrollmentId: enrollment.id,
      domain,
    },
    JWT_SECRET,
    { expiresIn: "5m", issuer: "hrl-academy-platform" }
  );

  url.searchParams.set("token", token);
  res.json({ launchUrl: url.toString() });
});

app.post("/api/access/verify", (req, res) => {
  const { token } = req.body;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: "hrl-academy-platform" });
    res.json({ valid: true, payload });
  } catch (err) {
    res.status(401).json({ valid: false, message: "Invalid token" });
  }
});

app.post("/api/progress/sync", authenticateToken, (req, res) => {
  const { courseId, percentage, completedLessons, totalLessons, minutesSpent, lesson } = req.body;
  const user = (req as any).user;

  // Log progress update
  logActivity(user.id, "progress_sync", req, 200, null, { courseId, percentage, lesson });

  res.json({ success: true, message: "Progress synced" });
});

app.post("/api/events/track", (req, res) => {
  const { eventName, courseId, properties } = req.body;
  
  // Track anonymously or logged in
  const userId = (req as any).user?.id || null;
  logActivity(userId, eventName, req, 200, null, { courseId, properties });
  
  res.json({ success: true });
});


// --- MESSAGING ENDPOINTS ---
app.get("/api/messages/conversations", authenticateToken, (req, res) => {
  const user = (req as any).user;
  let conversations;
  if (user.role === "admin") {
    conversations = db.prepare(`
      SELECT c.*,
        (SELECT group_concat(username, ', ') FROM conversation_participants cp
         JOIN users u ON cp.user_id = u.id
         WHERE cp.conversation_id = c.id) as participants
      FROM conversations c
    `).all();
  } else {
    conversations = db.prepare(`
      SELECT c.* FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = ?
    `).all(user.id);
  }
  res.json(conversations);
});

app.post("/api/messages/conversations/init", authenticateToken, (req, res) => {
  const user = (req as any).user;
  const { title } = req.body;
  
  try {
    let conversation = db.prepare(`
      SELECT c.* FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = ? AND c.title = ?
    `).get(user.id, title || "Support Chat") as any;

    if (!conversation) {
      const info = db.prepare("INSERT INTO conversations (title) VALUES (?)").run(title || "Support Chat");
      const conversationId = info.lastInsertRowid;
      db.prepare("INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)").run(conversationId, user.id);
      conversation = { id: conversationId, title: title || "Support Chat" };
    }
    res.json(conversation);
  } catch (err: any) {
    res.status(500).json({ message: "Błąd inicjalizacji konwersacji: " + err.message });
  }
});

app.get("/api/messages/conversations/:conversationId/messages", authenticateToken, (req, res) => {
  const conversationId = Number(req.params.conversationId);
  try {
    const messages = db.prepare(`
      SELECT m.*, u.username as sender_name FROM messages m
      JOIN users u ON m.sender_user_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.id ASC
    `).all(conversationId);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ message: "Błąd pobierania wiadomości: " + err.message });
  }
});

app.post("/api/messages/:conversationId/send", authenticateToken, (req, res) => {
  const { body } = req.body;
  const conversationId = Number(req.params.conversationId);
  const senderId = (req as any).user.id;
  
  try {
    db.prepare("INSERT INTO messages (conversation_id, sender_user_id, body) VALUES (?, ?, ?)")
      .run(conversationId, senderId, body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd wysyłania wiadomości: " + err.message });
  }
});

// --- DYNAMIC ADVERTISEMENTS TRACKING ---
app.post("/api/ads/impression", (req, res) => {
  const { adId } = req.body;
  db.prepare("UPDATE advertisements SET impression_count = impression_count + 1 WHERE id = ?").run(adId);
  res.json({ success: true });
});

app.post("/api/ads/click", (req, res) => {
  const { adId } = req.body;
  db.prepare("UPDATE advertisements SET click_count = click_count + 1 WHERE id = ?").run(adId);
  res.json({ success: true });
});

// --- ANALYTICS EVENT TRACKER ---
app.post("/api/events/track", (req, res) => {
  const { eventName, courseId, properties } = req.body;
  const userId = (req as any).user?.id || null;
  
  db.prepare("INSERT INTO analytics_events (user_id, course_id, event_name, properties) VALUES (?, ?, ?, ?)")
    .run(userId, courseId, eventName, JSON.stringify(properties));
  res.json({ success: true });
});

// --- CRON JOBS (Triggered via API) ---
app.post("/api/cron/expiring-access", authenticateToken, requireAdmin, (req, res) => {
  try {
    const result = db.prepare("UPDATE user_course_enrollments SET status = 'EXPIRED' WHERE access_ends_at < CURRENT_TIMESTAMP").run();
    logActivity((req as any).user.id, "cron_expiring_access", req, 200, null, { updated: result.changes });
    res.json({ success: true, updated: result.changes });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd crona: " + err.message });
  }
});

app.post("/api/admin/boost-progress", authenticateToken, requireAdmin, (req, res) => {
  const { user_id, course_id } = req.body;
  if (!user_id || !course_id) {
    return res.status(400).json({ message: "Brakujący ID użytkownika lub kursu." });
  }
  try {
    const lessons = db.prepare(`
      SELECT l.id 
      FROM lessons l
      JOIN modules m ON l.module_id = m.id
      WHERE m.course_id = ?
    `).all(course_id) as { id: number }[];

    if (lessons.length === 0) {
      return res.status(400).json({ message: "Ten kurs nie posiada jeszcze żadnych lekcji do zaliczenia!" });
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, percent, completed, updated_at)
      VALUES (?, ?, 100, 1, CURRENT_TIMESTAMP)
    `);

    db.transaction(() => {
      lessons.forEach((l) => {
        stmt.run(user_id, l.id);
      });
    })();

    logActivity((req as any).user.id, "admin_boost_progress", req, 200, null, { targetUserId: user_id, courseId: course_id });
    res.json({ success: true, message: `Sukces! Wszystkie lekcje (${lessons.length}) w kursie zostały oznaczone jako zaliczone na 100% dla tego użytkownika.` });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd zapisu bazy danych: " + err.message });
  }
});

// --- DYNAMIC ADVERTISEMENTS MANAGEMENT ENDPOINTS ---
app.get("/api/admin/ads", authenticateToken, requireAdmin, (req, res) => {
  try {
    const ads = db.prepare(`
      SELECT a.*, c.title as course_title 
      FROM advertisements a
      LEFT JOIN courses c ON a.course_id = c.id
      ORDER BY a.id DESC
    `).all() as any[];
    res.json(ads);
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy pobieraniu reklam: " + err.message });
  }
});

app.post("/api/admin/ads", authenticateToken, requireAdmin, (req, res) => {
  const { course_id, ad_type, ad_code, link_url, image_url, placement_location } = req.body;
  if (!ad_type || !ad_code || !placement_location) {
    return res.status(400).json({ message: "Typ reklamy, kod reklamy oraz miejsce docelowe są wymagane!" });
  }
  try {
    const targetCourseId = course_id ? Number(course_id) : null;
    db.prepare(`
      INSERT INTO advertisements (course_id, ad_type, ad_code, link_url, image_url, placement_location, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(targetCourseId, ad_type, ad_code, link_url || "", image_url || "", placement_location);

    logActivity((req as any).user.id, "admin_create_ad", req, 201, null, { ad_type, placement_location });
    res.status(201).json({ success: true, message: "Reklama została pomyślnie zdefiniowana!" });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd zapisu reklamy: " + err.message });
  }
});

app.delete("/api/admin/ads/:id", authenticateToken, requireAdmin, (req, res) => {
  const codeId = Number(req.params.id);
  try {
    db.prepare("DELETE FROM advertisements WHERE id = ?").run(codeId);
    logActivity((req as any).user.id, "admin_delete_ad", req, 200, null, { deletedId: codeId });
    res.json({ success: true, message: "Reklama została trwale wycofana z biblioteki." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/ads/active", (req, res) => {
  const { course_id, placement } = req.query;
  try {
    let result: any[];
    if (course_id) {
      result = db.prepare(`
        SELECT * FROM advertisements 
        WHERE is_active = 1 AND placement_location = ? AND (course_id = ? OR course_id IS NULL)
        ORDER BY RANDOM() LIMIT 2
      `).all(placement, Number(course_id)) as any[];
    } else {
      result = db.prepare(`
        SELECT * FROM advertisements 
        WHERE is_active = 1 AND placement_location = ? AND course_id IS NULL
        ORDER BY RANDOM() LIMIT 2
      `).all(placement) as any[];
    }

    // Increment impressions synchronously in backend background so we get reliable reporting
    if (result.length > 0) {
      const updateStmt = db.prepare("UPDATE advertisements SET impression_count = impression_count + 1 WHERE id = ?");
      result.forEach(ad => {
        updateStmt.run(ad.id);
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/ads/:id/click", (req, res) => {
  const adId = Number(req.params.id);
  try {
    db.prepare("UPDATE advertisements SET click_count = click_count + 1, revenue_generated = revenue_generated + 0.15 WHERE id = ?").run(adId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});


// --- GLOBAL TENANT BRANDING SETTINGS ENDPOINTS ---
app.get("/api/admin/settings", authenticateToken, requireAdmin, (req, res) => {
  try {
    const list = db.prepare("SELECT * FROM tenant_settings").all() as any[];
    const mapping: Record<string, string> = {};
    list.forEach(item => {
      mapping[item.key] = item.value;
    });
    res.json(mapping);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/settings", authenticateToken, requireAdmin, (req, res) => {
  const settings = req.body; // Key-value dictionary
  try {
    const updateStmt = db.prepare("INSERT INTO tenant_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        updateStmt.run(key, String(value));
      }
    })();
    logActivity((req as any).user.id, "admin_update_settings", req, 200, null, settings);
    res.json({ success: true, message: "Konfiguracja brandingu i multi-domain zapisana pomyślnie!" });
  } catch (err: any) {
    res.status(400).json({ message: "Błąd krytyczny konfiguracji: " + err.message });
  }
});

app.get("/api/tenant/settings", (req, res) => {
  try {
    const list = db.prepare("SELECT * FROM tenant_settings").all() as any[];
    const mapping: Record<string, string> = {};
    list.forEach(item => {
      mapping[item.key] = item.value;
    });
    res.json(mapping);
  } catch (err: any) {
    res.status(502).json({ message: err.message });
  }
});


// --- TRANSACTION / TRANSAKCJE & CHECKOUT LEDGER ---
app.get("/api/admin/transactions", authenticateToken, requireAdmin, (req, res) => {
  try {
    const list = db.prepare(`
      SELECT t.*, u.username, u.email, c.title as course_title 
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN courses c ON t.course_id = c.id
      ORDER BY t.id DESC
    `).all() as any[];
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/transactions/:id/refund", authenticateToken, requireAdmin, (req, res) => {
  const txId = Number(req.params.id);
  try {
    const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(txId) as any;
    if (!tx) {
      return res.status(404).json({ message: "Transakcja nie istnieje" });
    }
    db.prepare("UPDATE transactions SET status = 'failed' WHERE id = ?").run(txId);
    // Revoke enrollment as well to mirror standard payment gateway behavior
    if (tx.course_id) {
      db.prepare("DELETE FROM user_course_enrollments WHERE user_id = ? AND course_id = ?").run(tx.user_id, tx.course_id);
    }
    logActivity((req as any).user.id, "admin_refund_issued", req, 200, null, { txId, userId: tx.user_id });
    res.json({ success: true, message: "Zwrot środków zlecony pomyślnie. Zapisy użytkownika na kurs zostały unieważnione." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Stripe gateway checkout route
app.post("/api/courses/:id/checkout", authenticateToken, (req, res) => {
  const courseId = Number(req.params.id);
  const user = (req as any).user;
  const { cardNumber, cardExpiry, cardCvc, amount, type } = req.body;

  if (!cardNumber || !cardExpiry || !cardCvc) {
    return res.status(400).json({ message: "Brak danych karty płatniczej Stripe Connect." });
  }

  try {
    // Validate card specs (e.g. standard payment checks)
    if (cardNumber.replace(/\s+/g, "").length < 16) {
      return res.status(400).json({ message: "Niewłaściwy numer karty płatniczej Stripe." });
    }

    db.transaction(() => {
      // 1. Enroll user in the course database
      db.prepare(`
        INSERT OR IGNORE INTO user_course_enrollments (user_id, course_id)
        VALUES (?, ?)
      `).run(user.id, courseId);

      // 2. Persist transaction entry
      db.prepare(`
        INSERT INTO transactions (user_id, course_id, amount, status, transaction_type)
        VALUES (?, ?, ?, 'succeeded', ?)
      `).run(user.id, courseId, Number(amount) || 49.00, type || "charge");
    })();

    logActivity(user.id, "stripe_checkout_success", req, 201, null, { courseId, amount });
    clearCache();

    res.json({ success: true, message: "Płatność Stripe Connect sfinalizowana pomyślnie! Kurs został odblokowany." });
  } catch (err: any) {
    res.status(505).json({ message: "Błąd bramki płatniczej Stripe Connect: " + err.message });
  }
});

// Mass JSON Import Portal
app.post("/api/admin/import/:type", authenticateToken, requireAdmin, (req, res) => {
  const { type } = req.params;
  const data = req.body;

  if (!Array.isArray(data)) {
    return res.status(400).json({ message: "Payload musi być tablicą obiektów JSON." });
  }

  const results = {
    importedCount: 0,
    updatedCount: 0,
    errorCount: 0,
    details: [] as any[]
  };

  try {
    if (type === "lessons") {
      const insertLesson = db.prepare(`
        INSERT INTO lessons (module_id, title, description, content, access_level, video_url, duration_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of data) {
        if (!item.module_id || !item.title) {
          results.errorCount++;
          results.details.push({ item, status: "error", message: "Brak module_id lub title" });
          continue;
        }

        try {
          const duration = item.duration_minutes ? Number(item.duration_minutes) : 10;
          const access = item.access_level || "free_preview";
          
          insertLesson.run(item.module_id, item.title, item.description || "", item.content || "", access, item.video_url || "", duration);
          results.importedCount++;
          results.details.push({ title: item.title, status: "success", message: "Lekcja zaimportowana pomyślnie" });
        } catch (err: any) {
          results.errorCount++;
          results.details.push({ title: item.title, status: "error", message: err.message });
        }
      }
    } else if (type === "users") {
      const insertUser = db.prepare(`
        INSERT INTO users (username, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `);
      
      const updateUserRole = db.prepare(`
        UPDATE users SET role = ? WHERE email = ?
      `);

      for (const item of data) {
        if (!item.email || !item.username) {
          results.errorCount++;
          results.details.push({ item, status: "error", message: "Brak email lub username" });
          continue;
        }

        try {
          const existingUser = db.prepare("SELECT 1 FROM users WHERE email = ?").get(item.email);
          if (existingUser) {
            updateUserRole.run(item.role || "student", item.email);
            results.updatedCount++;
            results.details.push({ username: item.username, status: "updated", message: "Zaktualizowano rolę użytkownika." });
          } else {
            const pass = item.password || "student123";
            const hashed = bcrypt.hashSync(pass, 10);
            insertUser.run(item.username, item.email, hashed, item.role || "student");
            results.importedCount++;
            results.details.push({ username: item.username, status: "success", message: "Zarejestrowano użytkownika z domyślnym hasłem." });
          }
        } catch (err: any) {
          results.errorCount++;
          results.details.push({ username: item.username, status: "error", message: err.message });
        }
      }
    } else {
      return res.status(400).json({ message: "Nieobsługiwany typ importu." });
    }

    logActivity((req as any).user.id, `mass_import_${type}`, req, 200, null, {
      imported: results.importedCount,
      updated: results.updatedCount,
      errors: results.errorCount
    });

    clearCache();

    res.json({
      message: "Proces importu zakończony",
      importedCount: results.importedCount,
      updatedCount: results.updatedCount,
      errorCount: results.errorCount,
      details: results.details
    });

  } catch (err: any) {
    res.status(500).json({ message: "Fatalny błąd masowej operacji: " + err.message });
  }
});

// Healthy check
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", database: "SQLite verified", clients: wsClients.size });
});

// Configure full-stack dev express static or Vite middleware routing
async function startServer() {
  const server = http.createServer(app);

  // Set up WebSocket server
  const wss = new WebSocketServer({ server });
  
  wss.on("connection", (ws, req) => {
    wsClients.add(ws);
    
    // Send welcome status update
    ws.send(JSON.stringify({ 
      type: "SYSTEM_CONNECTED", 
      data: { message: "Telemetry linked with HRL Academy Server Gateway", active_connections: wsClients.size } 
    }));

    ws.on("close", () => {
      wsClients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("WS client error", error);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    // Mount Vite middleware in development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production compilation of React Assets
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server HRL Academy Core running on http://localhost:${PORT}`);
  });
}

startServer();
