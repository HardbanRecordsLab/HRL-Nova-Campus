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

// Helper function to read system limit value with fallback

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

app.get("/api/admin/limits", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [max_free_enrollments, max_daily_quiz_attempts, max_courses_per_instructor, auth_rate_limit_max] = await Promise.all([
      getPrismaSystemLimit("max_free_enrollments", 5),
      getPrismaSystemLimit("max_daily_quiz_attempts", 3),
      getPrismaSystemLimit("max_courses_per_instructor", 10),
      getPrismaSystemLimit("auth_rate_limit_max", 20),
    ]);

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

app.post("/api/admin/limits", authenticateToken, requireAdmin, async (req, res) => {
  const { max_free_enrollments, max_daily_quiz_attempts, max_courses_per_instructor, auth_rate_limit_max } = req.body;

  try {
    const updates = (
      [
        ["max_free_enrollments", max_free_enrollments],
        ["max_daily_quiz_attempts", max_daily_quiz_attempts],
        ["max_courses_per_instructor", max_courses_per_instructor],
        ["auth_rate_limit_max", auth_rate_limit_max],
      ] as Array<[string, unknown]>
    ).filter(([, value]) => value !== undefined);

    await prisma.$transaction(
      updates.map(([key, value]) =>
        prisma.appSetting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } })
      )
    );

    logActivity((req as any).user.id, "system_limits_updated", req, 200, null, req.body);

    res.json({ message: "Limity systemowe zostały pomyślnie zaktualizowane!" });
  } catch (err: any) {
    res.status(500).json({ message: "Zapis limitów nie powiódł się: " + err.message });
  }
});

// --- ADMIN PANELS, EXPORT & DIRECT CONTROL ---
app.get("/api/admin/export-database", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      include: {
        translations: true,
        modules: { orderBy: { sortOrder: "asc" }, include: { lessons: { orderBy: { sortOrder: "asc" }, include: { quizQuestions: true } } } },
      },
    });

    const nestedData = courses.map((course) => ({
      id: course.id,
      slug: course.slug,
      status: course.status,
      title: course.translations[0]?.title ?? course.slug,
      description: course.translations[0]?.description ?? "",
      modules: course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description,
          content: l.content,
          access_level: l.accessLevel,
          video_url: l.videoUrl,
          duration_minutes: l.durationMinutes,
          quiz_questions: l.quizQuestions.map((q) => ({
            id: q.id,
            question_text: q.questionText,
            option_a: q.optionA,
            option_b: q.optionB,
            option_c: q.optionC,
            option_d: q.optionD,
            correct_options: q.correctOptions,
            points_value: q.pointsValue,
          })),
        })),
      })),
    }));

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

app.post("/api/admin/import/courses", authenticateToken, requireAdmin, async (req, res) => {
  const courses = req.body;
  if (!Array.isArray(courses)) {
    return res.status(400).json({ message: "Oczekiwano tablicy kursów." });
  }

  const instructorUserId = String((req as any).user.id);
  let importedCount = 0;
  const updatedCount = 0;
  let errorCount = 0;
  const details: any[] = [];

  for (const course of courses) {
    if (!course.title || !course.description || !course.thumbnail) {
      errorCount++;
      details.push({ title: course.title || "Nieznany kurs", status: "error", message: "Brak wymaganego tytułu, opisu lub okładki." });
      continue;
    }
    try {
      const slug = `${String(course.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}-${importedCount}`;
      const priceType = course.pricing_model === "subscription" ? "SUBSCRIPTION" : course.pricing_model === "one_time" ? "ONE_TIME" : null;

      await prisma.course.create({
        data: {
          slug,
          instructorUserId,
          externalUrl: "https://example.invalid",
          imageUrl: course.thumbnail,
          level: course.difficulty || null,
          status: "DRAFT",
          translations: { create: { locale: "pl", title: course.title, description: course.description } },
          ...(course.tenant_domain && course.tenant_domain !== "all_domains"
            ? { domains: { create: { hostname: normalizeHostname(course.tenant_domain) ?? course.tenant_domain } } }
            : {}),
          ...(priceType
            ? {
                prices: {
                  create: {
                    type: priceType as any,
                    amount: Math.round(Number(priceType === "SUBSCRIPTION" ? course.subscription_price : course.one_time_price) * 100) || 0,
                    billingInterval: priceType === "SUBSCRIPTION" ? course.subscription_interval || "month" : null,
                  },
                },
              }
            : {}),
        },
      });
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

  try {
    if (importedCount > 0) {
      courseCache.clear();
      logActivity((req as any).user.id, "courses_mass_imported", req, 201, null, { importedCount, errorCount });
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
app.put("/api/admin/lessons/:id", authenticateToken, requireAdmin, async (req, res) => {
  const lessonId = req.params.id;
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
    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title,
        description: description || "",
        content: content || "",
        accessLevel: access_level || "free_preview",
        videoUrl: video_url || "",
        durationMinutes: Number(duration_minutes) || 10,
      },
      select: { moduleId: true },
    });

    if (module_title) {
      await prisma.module.update({ where: { id: lesson.moduleId }, data: { title: module_title } });
    }

    // 2. Update Quiz Question (this admin form edits a single question slot per lesson)
    if (quiz_question?.question_text) {
      const { question_text, option_a, option_b, option_c, option_d, correct_options, points_value } = quiz_question;
      const existingQuestion = await prisma.quizQuestion.findFirst({ where: { lessonId }, select: { id: true } });
      const data = {
        questionText: question_text,
        optionA: option_a || "",
        optionB: option_b || "",
        optionC: option_c || "",
        optionD: option_d || "",
        correctOptions: correct_options || "A",
        pointsValue: Number(points_value) || 1,
      };

      if (existingQuestion) {
        await prisma.quizQuestion.update({ where: { id: existingQuestion.id }, data });
      } else {
        await prisma.quizQuestion.create({ data: { lessonId, ...data } });
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
app.get("/api/admin/lessons/:id/quiz", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const question = await prisma.quizQuestion.findFirst({ where: { lessonId: req.params.id } });
    res.json(
      question
        ? {
            id: question.id,
            lesson_id: question.lessonId,
            question_text: question.questionText,
            option_a: question.optionA,
            option_b: question.optionB,
            option_c: question.optionC,
            option_d: question.optionD,
            correct_options: question.correctOptions,
            points_value: question.pointsValue,
          }
        : null
    );
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy pobieraniu quizu admina: " + err.message });
  }
});

app.get("/api/admin/courses/:id/modules", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const modules = await prisma.module.findMany({ where: { courseId: req.params.id }, orderBy: { sortOrder: "asc" } });
    res.json({ modules: modules.map((m) => ({ id: m.id, course_id: m.courseId, title: m.title, sequence_order: m.sortOrder })) });
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

function toLegacyActivityLog(log: { id: string; userId: string | null; action: string; targetId: string | null; createdAt: Date; metadata: any }) {
  const meta = (log.metadata as any) || {};
  return {
    id: log.id,
    timestamp: meta.timestamp ?? log.createdAt,
    user_id: log.userId,
    event_type: log.action,
    ip_address: meta.ip ?? null,
    request_method: meta.method ?? null,
    request_path: log.targetId,
    status_code: meta.statusCode ?? null,
    error_message: meta.errorMessage ?? null,
    payload_snapshot: meta.payload ? JSON.stringify(meta.payload) : null,
    user_agent: meta.userAgent ?? null,
    created_at: log.createdAt,
  };
}

app.get("/api/admin/logs", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    res.json(logs.map(toLegacyActivityLog));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Alias used by the access-management UI for the shared activity feed.
app.get("/api/admin/activity-log", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    res.json(logs.map(toLegacyActivityLog));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(users.map((u) => ({ id: u.id, username: u.username, email: u.email, role: u.role.toLowerCase(), created_at: u.createdAt })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/admin/users/:id/enrollments", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({ where: { userId: req.params.id, status: "ACTIVE" }, select: { courseId: true } });
    res.json(enrollments.map((e) => e.courseId));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/users/:id/enrollments", authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { courseId, action } = req.body; // action: 'grant' | 'revoke'
  const adminUserId = String((req as any).user.id);

  if (!courseId || !action) {
    return res.status(400).json({ message: "Brak identyfikatora kursu lub akcji." });
  }

  try {
    if (action === "grant") {
      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId, courseId: String(courseId) } },
        create: { userId, courseId: String(courseId), source: "MANUAL", status: "ACTIVE", grantedByUserId: adminUserId },
        update: { status: "ACTIVE", revokedAt: null, source: "MANUAL", grantedByUserId: adminUserId },
      });
      logActivity(adminUserId, "admin_grant_access", req, 201, null, { targetUserId: userId, courseId });
      res.json({ message: "Dostęp został przyznany pomyślnie!" });
    } else if (action === "revoke") {
      await prisma.enrollment.updateMany({
        where: { userId, courseId: String(courseId) },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      logActivity(adminUserId, "admin_revoke_access", req, 200, null, { targetUserId: userId, courseId });
      res.json({ message: "Dostęp został odebrany pomyślnie!" });
    } else {
      res.status(400).json({ message: "Zła akcja." });
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/users/:id/role", authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const role = String(req.body?.role || "").toUpperCase();

  if (!["STUDENT", "INSTRUCTOR", "ADMIN"].includes(role)) {
    return res.status(400).json({ message: "Nieprawidłowa rola" });
  }

  try {
    await prisma.user.update({ where: { id: userId }, data: { role: role as any } });
    logActivity((req as any).user.id, "user_role_update", req, 200, null, { targetUserId: userId, newRole: role.toLowerCase() });
    res.json({ success: true, message: "Rola zaktualizowana pomyślnie." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/courses/:id/grant-by-role", authenticateToken, requireAdmin, async (req, res) => {
  const courseId = req.params.id;
  const role = String(req.body?.role || "student").toUpperCase();
  const adminUserId = String((req as any).user.id);

  if (!["STUDENT", "ADMIN", "INSTRUCTOR"].includes(role)) {
    return res.status(400).json({ message: "Nieprawidłowy kurs lub rola." });
  }

  try {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) return res.status(404).json({ message: "Kurs nie istnieje." });

    const users = await prisma.user.findMany({ where: { role: role as any }, select: { id: true } });

    await prisma.$transaction(
      users.map((u) =>
        prisma.enrollment.upsert({
          where: { userId_courseId: { userId: u.id, courseId } },
          create: { userId: u.id, courseId, source: "ROLE_GRANT", status: "ACTIVE", grantedByUserId: adminUserId },
          update: { status: "ACTIVE", revokedAt: null, source: "ROLE_GRANT", grantedByUserId: adminUserId },
        })
      )
    );

    logActivity(adminUserId, "enrollment.granted", req, 201, null, { courseId, role: role.toLowerCase(), grantedCount: users.length });
    res.status(201).json({ success: true, grantedCount: users.length });
  } catch (err: any) {
    res.status(500).json({ message: "Nie udało się nadać dostępu: " + err.message });
  }
});

app.post("/api/admin/enrollments/:id/revoke", authenticateToken, requireAdmin, async (req, res) => {
  const enrollmentId = req.params.id;
  const adminUserId = String((req as any).user.id);

  try {
    const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) return res.status(404).json({ message: "Dostęp nie istnieje." });

    await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: "REVOKED", revokedAt: new Date() } });
    logActivity(adminUserId, "enrollment.revoked", req, 200, null, { enrollmentId, userId: enrollment.userId, courseId: enrollment.courseId });
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
app.get("/api/messages/conversations", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  try {
    if (user.role === "admin") {
      const conversations = await prisma.conversation.findMany({
        include: { participants: { include: { user: { select: { username: true } } } } },
        orderBy: { createdAt: "desc" },
      });
      res.json(conversations.map((c) => ({
        id: c.id,
        title: c.title,
        created_at: c.createdAt,
        participants: c.participants.map((p) => p.user.username).filter(Boolean).join(", "),
      })));
    } else {
      const conversations = await prisma.conversation.findMany({
        where: { participants: { some: { userId: String(user.id) } } },
        orderBy: { createdAt: "desc" },
      });
      res.json(conversations.map((c) => ({ id: c.id, title: c.title, created_at: c.createdAt })));
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/messages/conversations/init", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const convTitle = req.body?.title || "Support Chat";

  try {
    let conversation = await prisma.conversation.findFirst({
      where: { title: convTitle, participants: { some: { userId: String(user.id) } } },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { title: convTitle, participants: { create: { userId: String(user.id) } } },
      });
    }
    res.json({ id: conversation.id, title: conversation.title, created_at: conversation.createdAt });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd inicjalizacji konwersacji: " + err.message });
  }
});

app.get("/api/messages/conversations/:conversationId/messages", authenticateToken, async (req, res) => {
  try {
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: req.params.conversationId },
      include: { sender: { select: { username: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(messages.map((m) => ({
      id: m.id,
      conversation_id: m.conversationId,
      sender_user_id: m.senderUserId,
      sender_name: m.sender.username,
      body: m.body,
      created_at: m.createdAt,
    })));
  } catch (err: any) {
    res.status(500).json({ message: "Błąd pobierania wiadomości: " + err.message });
  }
});

app.post("/api/messages/:conversationId/send", authenticateToken, async (req, res) => {
  const { body } = req.body;
  const senderId = String((req as any).user.id);

  try {
    await prisma.conversationMessage.create({ data: { conversationId: req.params.conversationId, senderUserId: senderId, body } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd wysyłania wiadomości: " + err.message });
  }
});

// --- DYNAMIC ADVERTISEMENTS TRACKING ---
app.post("/api/ads/impression", async (req, res) => {
  try {
    await prisma.advertisement.update({ where: { id: String(req.body?.adId) }, data: { impressionCount: { increment: 1 } } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/ads/click", async (req, res) => {
  try {
    await prisma.advertisement.update({ where: { id: String(req.body?.adId) }, data: { clickCount: { increment: 1 } } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// --- CRON JOBS (Triggered via API) ---
app.post("/api/cron/expiring-access", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await prisma.enrollment.updateMany({
      where: { status: "ACTIVE", accessEndsAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });
    logActivity((req as any).user.id, "cron_expiring_access", req, 200, null, { updated: result.count });
    res.json({ success: true, updated: result.count });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd crona: " + err.message });
  }
});

app.post("/api/admin/boost-progress", authenticateToken, requireAdmin, async (req, res) => {
  const { user_id, course_id } = req.body;
  if (!user_id || !course_id) {
    return res.status(400).json({ message: "Brakujący ID użytkownika lub kursu." });
  }
  try {
    const lessons = await prisma.lesson.findMany({ where: { module: { courseId: String(course_id) } }, select: { id: true } });

    if (lessons.length === 0) {
      return res.status(400).json({ message: "Ten kurs nie posiada jeszcze żadnych lekcji do zaliczenia!" });
    }

    await prisma.$transaction(
      lessons.map((l) =>
        prisma.lessonProgress.upsert({
          where: { userId_lessonId: { userId: String(user_id), lessonId: l.id } },
          create: { userId: String(user_id), lessonId: l.id, percent: 100, completed: true },
          update: { percent: 100, completed: true },
        })
      )
    );

    logActivity((req as any).user.id, "admin_boost_progress", req, 200, null, { targetUserId: user_id, courseId: course_id });
    res.json({ success: true, message: `Sukces! Wszystkie lekcje (${lessons.length}) w kursie zostały oznaczone jako zaliczone na 100% dla tego użytkownika.` });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd zapisu bazy danych: " + err.message });
  }
});

// --- DYNAMIC ADVERTISEMENTS MANAGEMENT ENDPOINTS ---
function toLegacyAd(ad: { id: string; courseId: string | null; adType: string; adCode: string; linkUrl: string | null; imageUrl: string | null; placementLocation: string; isActive: boolean; impressionCount: number; clickCount: number; revenueGenerated: number; createdAt: Date; course?: { translations: { title: string }[] } | null }) {
  return {
    id: ad.id,
    course_id: ad.courseId,
    ad_type: ad.adType,
    ad_code: ad.adCode,
    link_url: ad.linkUrl,
    image_url: ad.imageUrl,
    placement_location: ad.placementLocation,
    is_active: ad.isActive,
    impression_count: ad.impressionCount,
    click_count: ad.clickCount,
    revenue_generated: ad.revenueGenerated,
    created_at: ad.createdAt,
    course_title: ad.course?.translations[0]?.title,
  };
}

app.get("/api/admin/ads", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const ads = await prisma.advertisement.findMany({
      orderBy: { createdAt: "desc" },
      include: { course: { select: { translations: { where: { locale: "pl" }, take: 1, select: { title: true } } } } },
    });
    res.json(ads.map(toLegacyAd));
  } catch (err: any) {
    res.status(500).json({ message: "Błąd bazy danych przy pobieraniu reklam: " + err.message });
  }
});

app.post("/api/admin/ads", authenticateToken, requireAdmin, async (req, res) => {
  const { course_id, ad_type, ad_code, link_url, image_url, placement_location } = req.body;
  if (!ad_type || !ad_code || !placement_location) {
    return res.status(400).json({ message: "Typ reklamy, kod reklamy oraz miejsce docelowe są wymagane!" });
  }
  try {
    await prisma.advertisement.create({
      data: {
        courseId: course_id ? String(course_id) : null,
        adType: ad_type,
        adCode: ad_code,
        linkUrl: link_url || "",
        imageUrl: image_url || "",
        placementLocation: placement_location,
        isActive: true,
      },
    });

    logActivity((req as any).user.id, "admin_create_ad", req, 201, null, { ad_type, placement_location });
    res.status(201).json({ success: true, message: "Reklama została pomyślnie zdefiniowana!" });
  } catch (err: any) {
    res.status(500).json({ message: "Błąd zapisu reklamy: " + err.message });
  }
});

app.delete("/api/admin/ads/:id", authenticateToken, requireAdmin, async (req, res) => {
  const adId = req.params.id;
  try {
    await prisma.advertisement.delete({ where: { id: adId } });
    logActivity((req as any).user.id, "admin_delete_ad", req, 200, null, { deletedId: adId });
    res.json({ success: true, message: "Reklama została trwale wycofana z biblioteki." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/ads/active", async (req, res) => {
  const { course_id, placement } = req.query;
  try {
    const candidates = await prisma.advertisement.findMany({
      where: {
        isActive: true,
        placementLocation: String(placement),
        ...(course_id ? { OR: [{ courseId: String(course_id) }, { courseId: null }] } : { courseId: null }),
      },
    });

    // Emulate ORDER BY RANDOM() LIMIT 2 from the previous raw-SQL version.
    const result = candidates
      .map((ad) => ({ ad, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .slice(0, 2)
      .map(({ ad }) => ad);

    if (result.length > 0) {
      await prisma.$transaction(
        result.map((ad) => prisma.advertisement.update({ where: { id: ad.id }, data: { impressionCount: { increment: 1 } } }))
      );
    }

    res.json(result.map((ad) => toLegacyAd(ad)));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/ads/:id/click", async (req, res) => {
  try {
    await prisma.advertisement.update({
      where: { id: req.params.id },
      data: { clickCount: { increment: 1 }, revenueGenerated: { increment: 0.15 } },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});


// --- GLOBAL TENANT BRANDING SETTINGS ENDPOINTS ---
app.get("/api/admin/settings", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const list = await prisma.appSetting.findMany();
    const mapping: Record<string, unknown> = {};
    list.forEach((item) => { mapping[item.key] = item.value; });
    res.json(mapping);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/settings", authenticateToken, requireAdmin, async (req, res) => {
  const settings = req.body; // Key-value dictionary
  try {
    await prisma.$transaction(
      Object.entries(settings).map(([key, value]) =>
        prisma.appSetting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } })
      )
    );
    logActivity((req as any).user.id, "admin_update_settings", req, 200, null, settings);
    res.json({ success: true, message: "Konfiguracja brandingu i multi-domain zapisana pomyślnie!" });
  } catch (err: any) {
    res.status(400).json({ message: "Błąd krytyczny konfiguracji: " + err.message });
  }
});

app.get("/api/tenant/settings", async (req, res) => {
  try {
    const list = await prisma.appSetting.findMany();
    const mapping: Record<string, unknown> = {};
    list.forEach((item) => { mapping[item.key] = item.value; });
    res.json(mapping);
  } catch (err: any) {
    res.status(502).json({ message: err.message });
  }
});


// --- TRANSACTION / TRANSAKCJE & CHECKOUT LEDGER ---
app.get("/api/admin/transactions", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const list = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { username: true, email: true } },
        course: { select: { translations: { where: { locale: "pl" }, take: 1, select: { title: true } } } },
      },
    });
    res.json(list.map((t) => ({
      id: t.id,
      user_id: t.userId,
      course_id: t.courseId,
      amount: t.amount,
      status: t.status,
      transaction_type: t.transactionType,
      created_at: t.createdAt,
      username: t.user.username,
      email: t.user.email,
      course_title: t.course?.translations[0]?.title,
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/transactions/:id/refund", authenticateToken, requireAdmin, async (req, res) => {
  const txId = req.params.id;
  try {
    const tx = await prisma.transaction.findUnique({ where: { id: txId } });
    if (!tx) {
      return res.status(404).json({ message: "Transakcja nie istnieje" });
    }
    await prisma.transaction.update({ where: { id: txId }, data: { status: "failed" } });
    // Revoke enrollment as well to mirror standard payment gateway behavior
    if (tx.courseId) {
      await prisma.enrollment.updateMany({
        where: { userId: tx.userId, courseId: tx.courseId },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    }
    logActivity((req as any).user.id, "admin_refund_issued", req, 200, null, { txId, userId: tx.userId });
    res.json({ success: true, message: "Zwrot środków zlecony pomyślnie. Zapisy użytkownika na kurs zostały unieważnione." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Stripe gateway checkout route
app.post("/api/courses/:id/checkout", authenticateToken, async (req, res) => {
  const courseId = req.params.id;
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

    await prisma.$transaction([
      prisma.enrollment.upsert({
        where: { userId_courseId: { userId: String(user.id), courseId } },
        create: { userId: String(user.id), courseId, source: "PURCHASE", status: "ACTIVE" },
        update: { status: "ACTIVE", revokedAt: null },
      }),
      prisma.transaction.create({
        data: { userId: String(user.id), courseId, amount: Number(amount) || 49.0, status: "succeeded", transactionType: type || "charge" },
      }),
    ]);

    logActivity(user.id, "stripe_checkout_success", req, 201, null, { courseId, amount });
    clearCache();

    res.json({ success: true, message: "Płatność Stripe Connect sfinalizowana pomyślnie! Kurs został odblokowany." });
  } catch (err: any) {
    res.status(505).json({ message: "Błąd bramki płatniczej Stripe Connect: " + err.message });
  }
});

// Mass JSON Import Portal
app.post("/api/admin/import/:type", authenticateToken, requireAdmin, async (req, res) => {
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
      for (const item of data) {
        if (!item.module_id || !item.title) {
          results.errorCount++;
          results.details.push({ item, status: "error", message: "Brak module_id lub title" });
          continue;
        }

        try {
          await prisma.lesson.create({
            data: {
              moduleId: String(item.module_id),
              title: item.title,
              description: item.description || "",
              content: item.content || "",
              accessLevel: item.access_level || "free_preview",
              videoUrl: item.video_url || "",
              durationMinutes: item.duration_minutes ? Number(item.duration_minutes) : 10,
            },
          });
          results.importedCount++;
          results.details.push({ title: item.title, status: "success", message: "Lekcja zaimportowana pomyślnie" });
        } catch (err: any) {
          results.errorCount++;
          results.details.push({ title: item.title, status: "error", message: err.message });
        }
      }
    } else if (type === "users") {
      for (const item of data) {
        if (!item.email || !item.username) {
          results.errorCount++;
          results.details.push({ item, status: "error", message: "Brak email lub username" });
          continue;
        }

        try {
          const role = String(item.role || "student").toUpperCase();
          const existingUser = await prisma.user.findUnique({ where: { email: item.email }, select: { id: true } });
          if (existingUser) {
            await prisma.user.update({ where: { email: item.email }, data: { role: role as any } });
            results.updatedCount++;
            results.details.push({ username: item.username, status: "updated", message: "Zaktualizowano rolę użytkownika." });
          } else {
            const pass = item.password || "student123";
            const hashed = bcrypt.hashSync(pass, 10);
            await prisma.user.create({ data: { username: item.username, email: item.email, passwordHash: hashed, role: role as any } });
            results.importedCount++;
            results.details.push({ username: item.username, status: "success", message: "Zarejestrowano użytkownika z domyślnym hasłem." });
          }
        } catch (err: any) {
          results.errorCount++;
          results.details.push({ username: item.username, status: "error", message: err.message });
        }
      }
    } else if (type === "quiz") {
      // Task 5: bulk import of exam/quiz questions, one JSON object per question, referencing an existing lesson.
      for (const item of data) {
        if (!item.lesson_id || !item.question_text) {
          results.errorCount++;
          results.details.push({ item, status: "error", message: "Brak lesson_id lub question_text" });
          continue;
        }

        try {
          const lessonExists = await prisma.lesson.findUnique({ where: { id: String(item.lesson_id) }, select: { id: true } });
          if (!lessonExists) {
            results.errorCount++;
            results.details.push({ title: item.question_text, status: "error", message: "Lekcja o podanym lesson_id nie istnieje" });
            continue;
          }
          await prisma.quizQuestion.create({
            data: {
              lessonId: String(item.lesson_id),
              questionText: item.question_text,
              optionA: item.option_a || "",
              optionB: item.option_b || "",
              optionC: item.option_c || "",
              optionD: item.option_d || "",
              correctOptions: item.correct_options || "A",
              pointsValue: item.points_value ? Number(item.points_value) : 1,
            },
          });
          results.importedCount++;
          results.details.push({ title: item.question_text, status: "success", message: "Pytanie quizowe zaimportowane pomyślnie" });
        } catch (err: any) {
          results.errorCount++;
          results.details.push({ title: item.question_text, status: "error", message: err.message });
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
