import express, { Request, Response, NextFunction } from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import Stripe from "stripe";
import QRCode from "qrcode";
import { createServer as createViteServer } from "vite";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { prisma } from "./src/lib/prisma";

dotenv.config();

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
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || "hrl_secret_jwt_key_991823";

// Routes not yet migrated to Prisma fail explicitly instead of falling back to a local database.
const db = {
  prepare: () => {
    throw new Error("This route still requires the Prisma migration");
  },
  exec: () => {
    throw new Error("This route still requires the Prisma migration");
  },
  transaction: <T extends (...args: any[]) => any>(callback: T): T => callback,
} as any;

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
if (false) {
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

async function getPrismaSystemLimit(key: string, defaultValue: number): Promise<number> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
    const value = typeof setting?.value === "number" ? setting.value : Number(setting?.value);
    return Number.isFinite(value) && value >= 0 ? value : defaultValue;
  } catch (error) {
    console.error("Failed to read Prisma system limit:", key, error);
    return defaultValue;
  }
}

// Helper to secure log activities
const wsClients = new Set<WebSocket>();

function logActivity(
  userId: string | number | null,
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

  void prisma.activityLog.create({
    data: {
      userId: userId === null ? null : String(userId),
      action: eventType,
      targetType: "http",
      targetId: pathUrl,
      metadata: {
        timestamp,
        ip,
        method,
        statusCode,
        errorMessage,
        payload: payload ?? undefined,
        userAgent,
      },
    },
  }).then((createdLog) => {
    const logObject = {
      id: createdLog.id,
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

  }).catch((err) => console.error("Failed to insert activity log", err));
}

// In-Memory cache logic (LRU list logic simulated for courses and users)
const courseCache = new Map<string, any>();
const userCache = new Map<number, any>();

function clearCache() {
  courseCache.clear();
  userCache.clear();
}

// Clean database of mock data to transition to LIVE mode
if (false) {
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

app.get("/api/activity-log", authenticateToken, async (req, res) => {
  const requestedUserId = String(req.query.userId || (req as any).user.id);
  if (requestedUserId !== String((req as any).user.id) && (req as any).user.role !== "admin") {
    return res.status(403).json({ message: "Brak uprawnień do tych logów." });
  }

  try {
    const logs = await prisma.activityLog.findMany({
      where: { userId: requestedUserId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    res.json(logs.map((log) => ({
      id: log.id,
      event_type: log.action,
      description: log.action,
      created_at: log.createdAt,
    })));
  } catch {
    res.status(500).json({ message: "Błąd bazy danych" });
  }
});

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
      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId: String(userId), courseId: String(courseId) } },
        update: { status: "ACTIVE", source: "PURCHASE" },
        create: {
          userId: String(userId),
          courseId: String(courseId),
          source: "PURCHASE",
          status: "ACTIVE",
        },
      });
    }
  }

  response.json({received: true});
});

// --- AUTH ENDPOINTS ---

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const parseResult = registerSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((i) => i.message).join(", ");
    return res.status(400).json({ message: errorMsg });
  }

  const { username, email, password, role } = parseResult.data;

  try {
    const defaultRole = role === "admin" ? "ADMIN" : role === "instructor" ? "INSTRUCTOR" : "STUDENT";
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: defaultRole,
      },
    });

    logActivity(user.id, "user_register", req, 201, null, { username, email, role: defaultRole });

    res.status(201).json({
      message: "Użytkownik zarejestrowany pomyślnie.",
      userId: user.id
    });
  } catch (error: any) {
    logActivity(null, "user_register_failed", req, 400, error.message, { username, email });
    if (error.code === "P2002") {
      return res.status(409).json({ message: "Nazwa użytkownika lub email jest już zajęty." });
    }
    res.status(500).json({ message: "Błąd serwera przy rejestracji." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((i) => i.message).join(", ");
    return res.status(400).json({ message: errorMsg });
  }

  const { email, password } = parseResult.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      logActivity(null, "login_failed_unregistered", req, 401, "User not found: " + email);
      return res.status(401).json({ message: "Nieprawidłowy email lub hasło." });
    }

    const correctPassword = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!correctPassword) {
      logActivity(user.id, "login_failed_bad_password", req, 401, "Bad password");
      return res.status(401).json({ message: "Nieprawidłowy email lub hasło." });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username ?? user.name ?? "", role: user.role.toLowerCase(), email: user.email },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    logActivity(user.id, "login_success", req, 200);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username ?? user.name ?? "",
        email: user.email,
        role: user.role
      }
    });

  } catch (err: any) {
    res.status(500).json({ message: "Wystąpił wewnętrzny błąd serwera." });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  const reqUser = (req as any).user;
  try {
    const user = await prisma.user.findUnique({
      where: { id: String(reqUser.id) },
      select: { id: true, username: true, name: true, email: true, role: true },
    });
    if (!user) {
      return res.status(404).json({ message: "Użytkownik nie istnieje" });
    }
    res.json({ ...user, username: user.username ?? user.name ?? "", role: user.role.toLowerCase() });
  } catch (err) {
    res.status(500).json({ message: "Błąd bazy danych" });
  }
});

// --- COURSES ENDPOINTS ---

function toLegacyCourse(course: any) {
  const translation = course.translations?.[0];
  const activePrices = course.prices?.filter((price: any) => price.isActive) ?? [];
  const oneTime = activePrices.find((price: any) => price.type === "ONE_TIME");
  const subscription = activePrices.find((price: any) => price.type === "SUBSCRIPTION");
  return {
    id: course.id,
    slug: course.slug,
    title: translation?.title ?? course.slug,
    description: translation?.description ?? translation?.shortDescription ?? "",
    thumbnail: course.imageUrl ?? "",
    category: course.tags?.map((tag: any) => tag.tag.slug).join(", ") || "Ogólny",
    difficulty: course.level ?? "Dowolny",
    instructor_name: course.instructorName ?? "HRL Team",
    pricing_model: activePrices[0]?.type?.toLowerCase() ?? "free",
    one_time_price: oneTime?.amount ?? 0,
    subscription_price: subscription?.amount ?? 0,
    subscription_interval: subscription?.billingInterval ?? "month",
    tenant_domain: course.domains?.[0]?.hostname ?? "all_domains",
    external_url: course.externalUrl,
    integration_type: course.integrationType,
    status: course.status,
    created_at: course.createdAt,
    updated_at: course.updatedAt,
    modules_count: course._count?.modules ?? 0,
    lessons_count: course.modules?.reduce((total: number, module: any) => total + (module._count?.lessons ?? 0), 0) ?? 0,
  };
}

const courseListInclude = {
  translations: { where: { locale: "pl" }, take: 1 },
  domains: { select: { hostname: true }, orderBy: { createdAt: "asc" as const } },
  prices: { where: { isActive: true } },
  tags: { include: { tag: { select: { slug: true } } } },
  _count: { select: { modules: true } },
};

app.get("/api/courses", async (req, res) => {
  const { search, category, difficulty, instructor, domain } = req.query;
  const hasFilters = search || category || difficulty || instructor || domain;

  // Only use cache if no search/filter criteria is provided
  const cacheKey = domain ? `domain_${domain}` : "default";
  if (!hasFilters && courseCache.has(cacheKey)) {
    return res.json(courseCache.get(cacheKey));
  }

  // Get courses along with modules & lessons count
  try {
    const normalizedSearch = typeof search === "string" ? search : undefined;
    const normalizedDomain = typeof domain === "string" ? normalizeHostname(domain) : null;
    const courses = await prisma.course.findMany({
      where: {
        status: "PUBLISHED",
        ...(normalizedSearch ? { translations: { some: { locale: "pl", OR: [{ title: { contains: normalizedSearch, mode: "insensitive" } }, { description: { contains: normalizedSearch, mode: "insensitive" } }] } } } : {}),
        ...(typeof difficulty === "string" ? { level: difficulty } : {}),
        ...(typeof instructor === "string" ? { instructorUserId: instructor } : {}),
        ...(normalizedDomain ? { OR: [{ domains: { some: { hostname: normalizedDomain } } }, { domains: { none: {} } }] } : {}),
      },
      include: { ...courseListInclude, modules: { select: { _count: { select: { lessons: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    const legacyCourses = courses.map(toLegacyCourse);

    // Only cache if there are no active filters
    if (!hasFilters) {
      courseCache.set(cacheKey, legacyCourses);
    }

    res.json(legacyCourses);
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy wyszukiwaniu kursów: " + err.message });
  }
});

app.get("/api/courses/domains", async (req, res) => {
  try {
    const rows = await prisma.courseDomain.findMany({ distinct: ["hostname"], select: { hostname: true }, orderBy: { hostname: "asc" } });
    const domains = rows.map((row) => row.hostname);
    res.json(domains);
  } catch (err: any) {
    res.status(500).json({ message: "Błąd przy pobieraniu domen: " + err.message });
  }
});

// Get detailed course hierarchy. If authenticated, fetch progress.
app.get("/api/courses/:id", async (req, res) => {
  const courseId = req.params.id;
  const authHeader = req.headers["authorization"];
  let userId: string | null = null;

  if (authHeader && authHeader.split(" ")[1]) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as any;
      userId = decoded.id;
    } catch (_) {}
  }

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        ...courseListInclude,
        modules: { orderBy: { sortOrder: "asc" }, include: { lessons: { orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (!course) {
      return res.status(404).json({ message: "Kurs nie znaleziony" });
    }

    // Is current user registered/enrolled?
    let userEnrolled = false;
    if (userId) {
      const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
      userEnrolled = enrollment?.status === "ACTIVE";
    }

    // Get Modules
    const progress = userId ? await prisma.lessonProgress.findMany({ where: { userId, lesson: { module: { courseId } } } }) : [];
    const progressByLesson = new Map(progress.map((item) => [item.lessonId, item]));
    const structure = course.modules.map((mod) => {
      const lessonsWithProgress = mod.lessons.map((les) => {
        const lessonProgress = progressByLesson.get(les.id);

        // Mask/Filter sensitive video links if user is not enrolled and it is a premium lesson (IDOR & Privacy Protection!)
        const isPremium = les.accessLevel === "premium";
        const hasAccess = !isPremium || userEnrolled;

        return {
          id: les.id,
          title: les.title,
          description: les.description,
          content: les.content,
          access_level: les.accessLevel,
          duration_minutes: les.durationMinutes,
          video_url: hasAccess ? les.videoUrl : "",
          progress: { percent: lessonProgress?.percent ?? 0, completed: lessonProgress?.completed ? 1 : 0 },
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
      const cert = await prisma.certificate.findFirst({ where: { userId, courseId }, select: { certificateCode: true } });
      if (cert) {
        certificate_code = cert.certificateCode;
      }
    }

    res.json({
      course: toLegacyCourse(course),
      enrolled: userEnrolled,
      structure,
      certificate_code
    });

  } catch (err: any) {
    res.status(500).json({ message: "Błąd podczas odpytywania bazy danych: " + err.message });
  }
});

// Enrolls user in a course
app.post("/api/courses/:id/enroll", authenticateToken, async (req, res) => {
  const courseId = req.params.id;
  const user = (req as any).user;

  try {
    // Check if already enrolled
    const existingEnrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: String(user.id), courseId } } });
    if (existingEnrollment) {
      return res.json({ message: "Jesteś już zapisany na ten kurs!" });
    }

    // Check enrollment limit for student role
    if (user.role === "student") {
      const maxFreeEnrollments = 5;
      const currentCount = await prisma.enrollment.count({ where: { userId: String(user.id), status: "ACTIVE" } });

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

    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) return res.status(404).json({ message: "Kurs nie znaleziony" });
    await prisma.enrollment.create({ data: { userId: String(user.id), courseId, source: "MANUAL", status: "ACTIVE" } });

    logActivity(user.id, "course_enroll", req, 200, null, { courseId });
    clearCache(); // invalidate

    res.json({ message: "Zapisano pomyślnie na kurs!" });
  } catch (error: any) {
    res.status(500).json({ message: "Zapis na kurs nie powiódł się: " + error.message });
  }
});

// --- EXTERNAL COURSE PROGRESS ---

const externalProgressSchema = z.object({
  progressPercent: z.number().int().min(0).max(100),
});

const providerCompletionSchema = z.object({
  userId: z.string().min(1),
  certificateCode: z.string().min(3).max(200).optional(),
  certificateUrl: z.string().url().max(2048).optional(),
});

app.patch("/api/enrollments/:courseId/progress", authenticateToken, async (req, res) => {
  const userId = String((req as any).user.id);
  const courseId = req.params.courseId;
  const parsed = externalProgressSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Postęp musi być liczbą całkowitą od 0 do 100." });

  try {
    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (!enrollment || enrollment.status !== "ACTIVE") return res.status(404).json({ message: "Aktywne zapisanie na kurs nie istnieje." });
    if (enrollment.completedAt) return res.json({ progressPercent: 100, completed: true });

    const progressPercent = Math.min(parsed.data.progressPercent, 99);
    const updated = await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { progressPercent, startedAt: enrollment.startedAt ?? new Date() },
      select: { progressPercent: true, startedAt: true, completedAt: true },
    });
    logActivity(userId, "external_course_progress_updated", req, 200, null, { courseId, progressPercent });
    res.json({ progressPercent: updated.progressPercent, startedAt: updated.startedAt, completed: Boolean(updated.completedAt) });
  } catch (error: any) {
    res.status(500).json({ message: "Nie udało się zapisać postępu: " + error.message });
  }
});

app.post("/api/integrations/courses/:courseId/completion", async (req, res) => {
  const courseId = req.params.courseId;
  const providerSecret = req.header("x-course-completion-secret");
  const parsed = providerCompletionSchema.safeParse(req.body);
  if (!providerSecret || !parsed.success) return res.status(400).json({ message: "Nieprawidłowe potwierdzenie ukończenia kursu." });

  try {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, integrationSecretHash: true } });
    if (!course) return res.status(404).json({ message: "Kurs nie istnieje." });
    if (!course.integrationSecretHash || !(await bcrypt.compare(providerSecret, course.integrationSecretHash))) {
      return res.status(401).json({ message: "Nieprawidłowy sekret integracji." });
    }

    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: parsed.data.userId, courseId } } });
    if (!enrollment || enrollment.status !== "ACTIVE") return res.status(404).json({ message: "Aktywne zapisanie na kurs nie istnieje." });

    const certificateCode = parsed.data.certificateCode ?? `EXT-${courseId}-${parsed.data.userId}-${Date.now()}`;
    const result = await prisma.$transaction(async (tx) => {
      const updatedEnrollment = await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { progressPercent: 100, startedAt: enrollment.startedAt ?? new Date(), completedAt: enrollment.completedAt ?? new Date(), completionSource: "PROVIDER_WEBHOOK" },
      });
      const certificate = await tx.certificate.upsert({
        where: { userId_courseId: { userId: parsed.data.userId, courseId } },
        update: { qrPayloadUrl: parsed.data.certificateUrl },
        create: { userId: parsed.data.userId, courseId, certificateCode, qrPayloadUrl: parsed.data.certificateUrl },
      });
      return { updatedEnrollment, certificate };
    });

    logActivity(parsed.data.userId, "external_course_completed", req, 200, null, { courseId, certificateCode: result.certificate.certificateCode });
    res.json({ success: true, completedAt: result.updatedEnrollment.completedAt, certificateCode: result.certificate.certificateCode });
  } catch (error: any) {
    res.status(500).json({ message: "Nie udało się zatwierdzić ukończenia kursu: " + error.message });
  }
});

app.post("/api/lessons/:id/progress", authenticateToken, async (req, res) => {
  const lessonId = req.params.id;
  const user = (req as any).user;
  const { percent, completed, last_watched_timestamp } = req.body;

  try {
    const isCompleted = Boolean(completed);
    const progressPercent = percent !== undefined ? Number(percent) : 0;
    const timestamp = Number(last_watched_timestamp || 0);

    // Check enrollment first (IDOR prevention)
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { accessLevel: true, module: { select: { courseId: true } } } });

    if (!lesson) {
      return res.status(404).json({ message: "Lekcja nie istnieje" });
    }

    if (lesson.accessLevel === "premium") {
      const enrolled = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: String(user.id), courseId: lesson.module.courseId } }, select: { status: true } });
      if (enrolled?.status !== "ACTIVE") {
        return res.status(403).json({ message: "Próba zapisu postępu dla zablokowanej zawartości premium!" });
      }
    }

    await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: String(user.id), lessonId } },
      create: { userId: String(user.id), lessonId, percent: progressPercent, completed: isCompleted, lastWatchedTimestamp: timestamp },
      update: { percent: progressPercent, completed: isCompleted, lastWatchedTimestamp: timestamp },
    });

    logActivity(user.id, "lesson_progress_update", req, 200, null, { lessonId, percent: progressPercent, completed: isCompleted, courseId: lesson.module.courseId });

    res.json({ success: true, message: "Postęp zapisany pomyślnie.", certificate_code: null });
  } catch (err: any) {
    res.status(500).json({ message: "Zapis postępu nie powiódł się: " + err.message });
  }
});

// Fetch active quizzes for a lesson
app.get("/api/lessons/:id/quiz", authenticateToken, async (req, res) => {
  const lessonId = req.params.id;
  try {
    const questions = await prisma.quizQuestion.findMany({ where: { lessonId }, select: { id: true, lessonId: true, questionText: true, optionA: true, optionB: true, optionC: true, optionD: true, pointsValue: true } });

    res.json(questions.map((question) => ({ id: question.id, lesson_id: question.lessonId, question_text: question.questionText, option_a: question.optionA, option_b: question.optionB, option_c: question.optionC, option_d: question.optionD, points_value: question.pointsValue })));
  } catch (err) {
    res.status(500).json({ message: "Błąd bazy danych" });
  }
});

// Submit Quiz with automated Certificate Issuing on passing all quizzes
app.post("/api/quiz/:lessonId/submit", authenticateToken, async (req, res) => {
  const lessonId = req.params.lessonId;
  const user = (req as any).user;
  const { answers } = req.body; // Array of { questionId: number, answer: 'A'|'B'|'C'|'D' }

  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ message: "Nieprawidłowy payload odpowiedzi" });
  }

  try {
    // Check daily quiz attempt limit for students
    if (user.role === "student") {
      const maxDailyQuizAttempts = await getPrismaSystemLimit("max_daily_quiz_attempts", 3);
      const attemptsToday = await prisma.quizAttempt.count({ where: { userId: String(user.id), lessonId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });

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

    const correctQuestions = await prisma.quizQuestion.findMany({ where: { lessonId }, select: { id: true, correctOptions: true, pointsValue: true } });
    if (correctQuestions.length === 0) {
      return res.status(400).json({ message: "Brak pytań testowych dla tej lekcji" });
    }

    let earnedPoints = 0;
    let totalPoints = 0;

    correctQuestions.forEach((q) => {
      totalPoints += q.pointsValue || 1;
      const studentAnsObj = answers.find((ans: any) => String(ans.questionId) === q.id);
      if (studentAnsObj && studentAnsObj.answer === q.correctOptions) {
        earnedPoints += q.pointsValue || 1;
      }
    });

    const scorePercent = Number(((earnedPoints / totalPoints) * 100).toFixed(1));
    const passed = scorePercent >= 70;

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { module: { select: { courseId: true } } } });
    if (!lesson) return res.status(404).json({ message: "Lekcja nie istnieje" });
    await prisma.$transaction(async (tx) => {
      await tx.quizAttempt.create({ data: { userId: String(user.id), lessonId, scorePercent, passed } });
      if (passed) {
        await tx.lessonProgress.upsert({ where: { userId_lessonId: { userId: String(user.id), lessonId } }, create: { userId: String(user.id), lessonId, percent: 100, completed: true }, update: { percent: 100, completed: true } });
      }
    });

    logActivity(user.id, "quiz_submitted", req, 200, null, { lessonId, scorePercent, passed });

    // Mark lesson as completed automatically if passed; issue a certificate once every
    // quiz-bearing lesson in the course has been passed (checkAndGenerateCertificate is idempotent).
    let certificate: { code: string; needsConsent: boolean } | null = null;
    if (passed) {
      const cert = await checkAndGenerateCertificate(String(user.id), lesson.module.courseId);
      if (cert) {
        certificate = { code: cert.certificateCode, needsConsent: !cert.rodoConsentAt };
      }
    }

    res.json({
      score_percent: scorePercent,
      passed,
      correct_count: earnedPoints,
      total_count: totalPoints,
      certificate_code: certificate?.code ?? null,
      certificate
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

function generateCertificateCode(userId: string, courseId: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const hash = cryptoHash(`${userId}-${courseId}-${timestamp}`);
  const randomSuffix = Math.random().toString(16).substring(2, 6).toUpperCase();
  return `HRL-ACAD-${hash}-${timestamp}-${randomSuffix}`;
}

function buildVerifyUrl(certificateCode: string): string {
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${appUrl}/verify/${certificateCode}`;
}

// Issues a certificate once a student has passed every quiz-bearing lesson in a course.
// Idempotent: safe to call after every quiz submission, returns the existing certificate if already issued.
async function checkAndGenerateCertificate(userId: string, courseId: string) {
  const quizLessons = await prisma.lesson.findMany({
    where: { module: { courseId }, quizQuestions: { some: {} } },
    select: { id: true },
  });
  if (quizLessons.length === 0) return null;

  const passedCount = await prisma.lessonProgress.count({
    where: { userId, completed: true, lessonId: { in: quizLessons.map((l) => l.id) } },
  });
  if (passedCount < quizLessons.length) return null;

  const existing = await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) return existing;

  const certificateCode = generateCertificateCode(userId, courseId);
  const qrPayloadUrl = await QRCode.toDataURL(buildVerifyUrl(certificateCode), { margin: 1, width: 320 });

  try {
    const certificate = await prisma.certificate.create({ data: { userId, courseId, certificateCode, qrPayloadUrl } });
    await prisma.enrollment.updateMany({ where: { userId, courseId, completedAt: null }, data: { completedAt: new Date(), completionSource: "quiz" } });
    logActivity(userId, "certificate.issued", null, 200, null, { courseId, certificateCode });
    return certificate;
  } catch (err: any) {
    // Unique constraint race (two quiz submissions completing the course concurrently) — return the winner's row.
    if (err?.code === "P2002") {
      return prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
    }
    throw err;
  }
}

// Public Certificate validation
app.get("/api/verify-certificate/:code", async (req, res) => {
  const code = req.params.code;

  try {
    const cert = await prisma.certificate.findUnique({ where: { certificateCode: code }, include: { user: { select: { username: true, name: true } }, course: { include: { translations: { where: { locale: "pl" }, take: 1, select: { title: true } } } } } });

    if (!cert) {
      return res.status(444).json({ valid: false, message: "Certyfikat o podanym numerze seryjnym nie widnieje w rejestrach HRL Academy" });
    }

    res.json({
      valid: true,
      code: cert.certificateCode,
      // RODO: student identity is only disclosed once they've consented to the public registry.
      student: cert.isPublic ? (cert.user.username ?? cert.user.name ?? "") : null,
      course: cert.course.translations[0]?.title ?? cert.course.slug,
      issued_at: cert.issuedAt,
      qr_payload_url: cert.qrPayloadUrl,
      is_public: cert.isPublic
    });
  } catch (err) {
    res.status(500).json({ message: "Błąd bazy danych" });
  }
});

// RODO consent for the public graduates registry — checkbox defaults unchecked on the frontend,
// isPublic can only ever become true together with rodoConsentAt (never independently).
const certificateConsentSchema = z.object({ consent: z.boolean() });

app.post("/api/certificates/:code/consent", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const code = req.params.code;
  const parsed = certificateConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Nieprawidłowe dane zgody" });
  }

  try {
    const cert = await prisma.certificate.findUnique({
      where: { certificateCode: code },
      include: { user: { select: { username: true, name: true } }, course: { include: { translations: { where: { locale: "pl" }, take: 1, select: { title: true } } } } }
    });
    if (!cert || cert.userId !== String(user.id)) {
      return res.status(444).json({ message: "Certyfikat nie istnieje lub nie należy do Ciebie." });
    }

    if (parsed.data.consent) {
      const updated = await prisma.certificate.update({
        where: { certificateCode: code },
        data: { isPublic: true, rodoConsentAt: new Date() }
      });
      await prisma.graduateRegistryEntry.upsert({
        where: { certificateCode: code },
        create: {
          certificateCode: code,
          studentDisplayName: cert.user.username ?? cert.user.name ?? "Absolwent",
          courseTitle: cert.course.translations[0]?.title ?? cert.course.slug,
          issuedAt: cert.issuedAt
        },
        update: {}
      });
      logActivity(user.id, "certificate.rodo_consent_granted", req, 200, null, { certificateCode: code });
      return res.json({ success: true, is_public: updated.isPublic });
    }

    await prisma.certificate.update({ where: { certificateCode: code }, data: { isPublic: false } });
    await prisma.graduateRegistryEntry.deleteMany({ where: { certificateCode: code } });
    logActivity(user.id, "certificate.rodo_consent_declined", req, 200, null, { certificateCode: code });
    res.json({ success: true, is_public: false });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd zapisu zgody: " + err.message });
  }
});

// Public, searchable registry — only ever contains entries for certificates with isPublic=true.
app.get("/api/graduates", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const where = q
    ? {
        OR: [
          { studentDisplayName: { contains: q, mode: "insensitive" as const } },
          { courseTitle: { contains: q, mode: "insensitive" as const } }
        ]
      }
    : {};

  try {
    const [items, total] = await Promise.all([
      prisma.graduateRegistryEntry.findMany({ where, orderBy: { issuedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.graduateRegistryEntry.count({ where })
    ]);
    res.json({ items, total, page, limit });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd pobierania rejestru absolwentów: " + err.message });
  }
});

// --- STUDENT DASHBOARD ENDPOINTS ---
app.get("/api/student/dashboard", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  
  try {
    const userId = String(user.id);
    const [enrollments, certificatesData, attempts, completedLessons, certificatesCount] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId, status: "ACTIVE" },
        include: { course: { include: { translations: { where: { locale: "pl" }, take: 1 }, modules: { include: { lessons: { select: { id: true, progress: { where: { userId, completed: true }, select: { id: true } } } } } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.certificate.findMany({ where: { userId }, include: { course: { include: { translations: { where: { locale: "pl" }, take: 1 } } } }, orderBy: { issuedAt: "desc" } }),
      prisma.quizAttempt.findMany({ where: { userId }, include: { lesson: { include: { module: { include: { course: { include: { translations: { where: { locale: "pl" }, take: 1 } } } } } } } }, orderBy: { createdAt: "desc" } }),
      prisma.lessonProgress.count({ where: { userId, completed: true } }),
      prisma.certificate.count({ where: { userId } }),
    ]);

    const enrolledCourses = enrollments.map(({ course }) => {
      const translation = course.translations[0];
      const lessons = course.modules.flatMap((module) => module.lessons);
      return {
        id: course.id,
        title: translation?.title ?? course.slug,
        description: translation?.description ?? translation?.shortDescription ?? "",
        thumbnail: course.imageUrl ?? "",
        category: "Ogólny",
        difficulty: course.level ?? "Dowolny",
        instructor_name: "HRL Team",
        lessons_count: lessons.length,
        modules_count: course.modules.length,
        completed_lessons_count: lessons.filter((lesson) => lesson.progress.length > 0).length,
      };
    });

    const certificates = certificatesData.map((certificate) => ({
      id: certificate.id,
      user_id: certificate.userId,
      course_id: certificate.courseId,
      certificate_code: certificate.certificateCode,
      created_at: certificate.issuedAt,
      course_title: certificate.course.translations[0]?.title ?? certificate.course.slug,
      course_thumbnail: certificate.course.imageUrl ?? "",
      qr_payload_url: certificate.qrPayloadUrl,
      is_public: certificate.isPublic,
    }));

    const quizAttempts = attempts.map((attempt) => ({
      id: attempt.id,
      lesson_id: attempt.lessonId,
      score_ratio: (attempt.scorePercent ?? 0) / 100,
      passed: attempt.passed ? 1 : 0,
      attempt_time: attempt.createdAt,
      lesson_title: attempt.lesson.title,
      course_title: attempt.lesson.module.course.translations[0]?.title ?? attempt.lesson.module.course.slug,
    }));

    const avgScore = quizAttempts.filter((attempt) => attempt.passed === 1).length > 0
      ? Math.round(quizAttempts.filter((attempt) => attempt.passed === 1).reduce((sum, attempt) => sum + attempt.score_ratio * 100, 0) / quizAttempts.filter((attempt) => attempt.passed === 1).length)
      : 0;

    const timeline: any[] = [];
    enrolledCourses.forEach(c => {
      timeline.push({
        type: "enrollment",
        title: `Zapisano się na kurs: ${c.title}`,
        time: enrollments.find((enrollment) => enrollment.course.id === c.id)?.createdAt ?? new Date().toISOString()
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
      externalCourses: [],
      stats: {
        totalEnrolled: enrolledCourses.length,
        completedLessons,
        quizCount: quizAttempts.length,
        avgScore,
        certCount: certificatesCount
      },
      timeline: timeline.slice(0, 8)
    });

  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy wyszukiwaniu informacji panelu kursanta: " + err.message });
  }
});

// --- SYSTEM LIMITS ENDPOINTS ---
app.get("/api/student/limits", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  try {
    const [maxFreeEnrollments, maxDailyQuizAttempts, maxCoursesPerInstructor, currentEnrollments] = await Promise.all([
      getPrismaSystemLimit("max_free_enrollments", 5),
      getPrismaSystemLimit("max_daily_quiz_attempts", 3),
      getPrismaSystemLimit("max_courses_per_instructor", 10),
      prisma.enrollment.count({ where: { userId: String(user.id), status: "ACTIVE" } }),
    ]);

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

app.post("/api/admin/courses", authenticateToken, requireAdmin, async (req, res) => {
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
    const instructorUserId = String((req as any).user.id);
    const slug = `${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
    const newCourse = await prisma.course.create({
      data: {
        slug,
        instructorUserId,
        externalUrl: req.body.external_url || "https://example.invalid",
        imageUrl: thumbnail,
        level: difficulty || null,
        status: req.body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
        translations: { create: { locale: "pl", title, description } },
        ...(tenant_domain && tenant_domain !== "all_domains" ? { domains: { create: { hostname: normalizeHostname(tenant_domain) ?? tenant_domain } } } : {}),
      },
      include: courseListInclude,
    });

    courseCache.clear();

    res.status(201).json({ message: "Kurs został pomyślnie utworzony!", course: toLegacyCourse(newCourse) });
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

app.put("/api/admin/courses/:id", authenticateToken, requireAdmin, async (req, res) => {
  const courseId = req.params.id;
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
    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: {
        imageUrl: thumbnail,
        level: difficulty || null,
        ...(req.body.external_url ? { externalUrl: req.body.external_url } : {}),
        translations: { upsert: { where: { courseId_locale: { courseId, locale: "pl" } }, update: { title, description }, create: { locale: "pl", title, description } } },
      },
      include: courseListInclude,
    });
    courseCache.clear();

    logActivity((req as any).user.id, "course_updated", req, 200, null, { courseId });

    res.json({ message: "Kurs został pomyślnie zaktualizowany!", course: toLegacyCourse(updatedCourse) });
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

app.delete("/api/admin/courses/:id", authenticateToken, requireAdmin, async (req, res) => {
  const courseId = req.params.id;
  
  try {
    await prisma.course.delete({ where: { id: courseId } });

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

app.get("/api/admin/courses/:id/domains", authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json(await prisma.courseDomain.findMany({ where: { courseId: req.params.id }, orderBy: { createdAt: "desc" } }));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/courses/:id/domains", authenticateToken, requireAdmin, async (req, res) => {
  const courseId = req.params.id;
  const hostname = normalizeHostname(req.body?.hostname || req.body?.domain);
  if (!hostname) return res.status(400).json({ message: "Nieprawidłowa domena." });

  try {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) return res.status(404).json({ message: "Kurs nie istnieje." });
    const result = await prisma.courseDomain.create({ data: { courseId, hostname } }).catch((error: any) => {
      if (error.code === "P2002") return null;
      throw error;
    });
    if (!result) return res.status(409).json({ message: "Ta domena jest już dodana." });
    logActivity(Number((req as any).user.id), "course_domain.added", req, 201, null, { courseId, hostname });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/admin/courses/:id/domains/:domainId", authenticateToken, requireAdmin, async (req, res) => {
  const courseId = req.params.id;
  const domainId = req.params.domainId;
  try {
    const result = await prisma.courseDomain.deleteMany({ where: { id: domainId, courseId } });
    if (result.count === 0) return res.status(404).json({ message: "Domena nie istnieje." });
    logActivity(Number((req as any).user.id), "course_domain.removed", req, 200, null, { courseId, domainId });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Admin manual certificate management & generation tools
app.get("/api/admin/certificates", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const certs = await prisma.certificate.findMany({
      orderBy: { issuedAt: "desc" },
      include: {
        user: { select: { username: true, email: true } },
        course: { select: { slug: true, translations: { where: { locale: "pl" }, take: 1, select: { title: true } } } }
      }
    });
    res.json(certs.map((c) => ({
      id: c.id,
      user_id: c.userId,
      course_id: c.courseId,
      certificate_code: c.certificateCode,
      created_at: c.issuedAt,
      is_public: c.isPublic,
      student_name: c.user.username ?? "",
      student_email: c.user.email,
      course_title: c.course.translations[0]?.title ?? c.course.slug
    })));
  } catch (err: any) {
    res.status(500).json({ message: "Błąd pobierania certyfikatów: " + err.message });
  }
});

app.post("/api/admin/certificates", authenticateToken, requireAdmin, async (req, res) => {
  const { user_id, course_id, custom_code } = req.body;

  if (!user_id || !course_id) {
    return res.status(400).json({ message: "Brakujący identyfikator użytkownika lub kursu." });
  }

  try {
    const existing = await prisma.certificate.findUnique({ where: { userId_courseId: { userId: String(user_id), courseId: String(course_id) } } });
    if (existing) {
      return res.status(400).json({ message: "Użytkownik posiada już certyfikat ukończenia tego kursu: " + existing.certificateCode });
    }

    const certificateCode = custom_code?.trim() || generateCertificateCode(String(user_id), String(course_id));
    const qrPayloadUrl = await QRCode.toDataURL(buildVerifyUrl(certificateCode), { margin: 1, width: 320 });

    const created = await prisma.certificate.create({ data: { userId: String(user_id), courseId: String(course_id), certificateCode, qrPayloadUrl } });

    logActivity((req as any).user.id, "admin_manual_certificate_issued", req, 201, null, { targetUserId: user_id, courseId: course_id, certCode: certificateCode });
    res.status(201).json({ success: true, message: "Certyfikat został wyemitowany pomyślnie!", code: created.certificateCode });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd emisji certyfikatu: " + err.message });
  }
});

app.delete("/api/admin/certificates/:id", authenticateToken, requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const cert = await prisma.certificate.findUnique({ where: { id } });
    if (!cert) {
      return res.status(444).json({ message: "Certyfikat o tym ID nie istnieje." });
    }
    await prisma.$transaction([
      prisma.graduateRegistryEntry.deleteMany({ where: { certificateCode: cert.certificateCode } }),
      prisma.certificate.delete({ where: { id } })
    ]);
    logActivity((req as any).user.id, "admin_certificate_revoked", req, 200, null, { certificateId: id, code: cert.certificateCode });
    res.json({ success: true, message: "Certyfikat został trwale wycofany z rejestru." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/access/launch", authenticateToken, async (req, res) => {
  const { courseId } = req.body;
  const user = (req as any).user;

  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: String(user.id), courseId: String(courseId) } } });

  if (!enrollment || enrollment.status !== "ACTIVE") {
    return res.status(403).json({ message: "Brak dostępu do kursu" });
  }

  // Find course details
  const course = await prisma.course.findUnique({ where: { id: String(courseId) }, select: { externalUrl: true, integrationType: true, domains: { select: { hostname: true } } } });
  if (!course) {
    return res.status(404).json({ message: "Kurs nie istnieje" });
  }

  const url = new URL(course.externalUrl);
  const domain = url.host;

  if (course.integrationType === "IFRAME" || course.integrationType === "REDIRECT_COOKIE") {
    const requestHost = normalizeHostname(req.headers.origin) || normalizeHostname(req.headers.referer);
    const allowed = course.domains;
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

app.post("/api/access/verify", async (req, res) => {
  const { token } = req.body;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: "hrl-academy-platform" }) as jwt.JwtPayload;
    const enrollment = await prisma.enrollment.findUnique({ where: { id: String(payload.enrollmentId) }, select: { userId: true, courseId: true, status: true } });
    if (!enrollment || enrollment.status !== "ACTIVE" || enrollment.userId !== String(payload.sub) || enrollment.courseId !== String(payload.courseId)) {
      return res.status(401).json({ valid: false, message: "Enrollment is not active" });
    }
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
  res.json({ status: "healthy", database: "PostgreSQL via Prisma", clients: wsClients.size });
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
