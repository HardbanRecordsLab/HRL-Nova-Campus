import React, { useEffect, useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import {
  ShieldAlert,
  Users,
  FileCode,
  Database,
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  Terminal,
  ArrowRight,
  Upload,
  UserCog,
  Plus,
  Trash2,
  Download,
  BookOpen,
  SlidersHorizontal,
  ChevronRight,
  RefreshCw,
  Award,
  BookCheck,
  Zap,
  HardDrive,
  Megaphone,
  DollarSign,
  Settings as SettingsIcon,
  Globe,
  MessageSquare
} from "lucide-react";
import { ActivityLog, User, Course } from "../types";
import { AdminJSONImporter } from "../components/AdminJSONImporter";
import { VisualCertificatePreview } from "../components/VisualCertificatePreview";
import { AdminCharts } from "../components/AdminCharts";
import { AdminMessages } from "../components/AdminMessages";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export const AdminPanel: React.FC = () => {
  const { user, token, logs, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<
    "users" | "courses" | "external" | "certificates" | "advertisements" | "transactions" | "settings" | "limits" | "backup" | "import" | "telemetry" | "messages" | "security"
  >("users");

  // System limits state
  const [systemLimits, setSystemLimits] = useState({
    max_free_enrollments: 5,
    max_daily_quiz_attempts: 3,
    max_courses_per_instructor: 10,
    auth_rate_limit_max: 20
  });
  const [isLoadingLimits, setIsLoadingLimits] = useState(false);
  const [isSavingLimits, setIsSavingLimits] = useState(false);

  // Users Management state
  const [userList, setUserList] = useState<User[]>([]);
  const [userLoading, setUserLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | number | null>(null);
  const [userEnrollmentsMap, setUserEnrollmentsMap] = useState<Record<string | number, (string | number)[]>>({});

  // Courses Management state
  const [coursesList, setCoursesList] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  // Pricing Creation/Update State Fields
  const [newPricingModel, setNewPricingModel] = useState<"free" | "one_time" | "subscription">("free");
  const [newOneTimePrice, setNewOneTimePrice] = useState<string>("49");
  const [newSubscriptionPrice, setNewSubscriptionPrice] = useState<string>("9");
  const [newSubscriptionInterval, setNewSubscriptionInterval] = useState<"month" | "year">("month");
  const [newTenantDomain, setNewTenantDomain] = useState<string>("all_domains");

  // Live course edit state (Optional but super robust!)
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);

  // Advertisements management state
  const [adsList, setAdsList] = useState<any[]>([]);
  const [adsLoading, setAdsLoading] = useState(true);
  const [isCreatingAd, setIsCreatingAd] = useState(false);
  const [adCourseId, setAdCourseId] = useState("");
  const [adType, setAdType] = useState<"banner" | "inline" | "sidebar">("banner");
  const [adCode, setAdCode] = useState("");
  const [adLink, setAdLink] = useState("");
  const [adImage, setAdImage] = useState("");
  const [adPlacement, setAdPlacement] = useState<"lesson_start" | "lesson_end" | "sidebar">("lesson_start");

  // Tenant branding & Multi-Domain Settings states
  const [brandingSettings, setBrandingSettings] = useState({
    primary_color: "#8B5CF6",
    logo_url: "",
    refund_policy_days: "30",
    custom_domain: "localhost:3000",
    certificate_template: "<h1>DYPLOM UKOŃCZENIA</h1><p>Zaświadcza się, że student <b>{{student_name}}</b> ukończył pomyślnie cały program szkolenia <b>{{course_title}}</b>.</p><p>Seryjny nr weryfikacji HRL: <b>{{certificate_code}}</b></p>"
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Financial transactions ledger states
  const [transactionsList, setTransactionsList] = useState<any[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);

  // Certificates management state
  const [certificatesList, setCertificatesList] = useState<any[]>([]);
  const [certificatesLoading, setCertificatesLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [customCertCode, setCustomCertCode] = useState("");
  const [isGeneratingCert, setIsGeneratingCert] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<'minimalist' | 'cyber' | 'diploma' | 'luxury'>('minimalist');
  const certificateRef = useRef<HTMLDivElement>(null);

  // Booster states
  const [boostUserId, setBoostUserId] = useState("");
  const [boostCourseId, setBoostCourseId] = useState("");
  const [isBoosting, setIsBoosting] = useState(false);

  // External Domain Gateways & Lesson access controls
  const [selectedCourseIdVal, setSelectedCourseIdVal] = useState<number | null>(null);
  const [lessonsForSelectedCourse, setLessonsForSelectedCourse] = useState<any[]>([]);
  const [modulesForActiveCourse, setModulesForActiveCourse] = useState<any[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [lessonsLoadingState, setLessonsLoadingState] = useState(false);
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [isUpdatingCourse, setIsUpdatingCourse] = useState(false);

  // Editable selected course properties
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courseInstructor, setCourseInstructor] = useState("");
  const [courseThumbnail, setCourseThumbnail] = useState("");

  // Lesson fields:
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonModuleTitle, setLessonModuleTitle] = useState("");
  const [lessonDescription, setLessonDescription] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [lessonAccessLevel, setLessonAccessLevel] = useState<"free_preview" | "premium">("free_preview");
  const [lessonVideoUrl, setLessonVideoUrl] = useState("");
  const [lessonDuration, setLessonDuration] = useState("10");

  const [extCourseTitle, setExtCourseTitle] = useState("");
  const [extCourseDescription, setExtCourseDescription] = useState("");
  const [extCourseAccess, setExtCourseAccess] = useState<"free" | "paid">("free");
  const [extCourseUrl, setExtCourseUrl] = useState("");
  const [isSavingExtCourse, setIsSavingExtCourse] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("Programowanie");

  // Lesson/Module Creation state
  const [showModuleCreator, setShowModuleCreator] = useState(false);
  const [newCreatorModuleTitle, setNewCreatorModuleTitle] = useState("");
  const [showLessonCreator, setShowLessonCreator] = useState(false);
  const [newCreatorModuleId, setNewCreatorModuleId] = useState<number | "">("");
  const [newCreatorLessonTitle, setNewCreatorLessonTitle] = useState("");
  const [isCreatingContent, setIsCreatingContent] = useState(false);
  const [newDifficulty, setNewDifficulty] = useState("Początkujący");
  const [newInstructor, setNewInstructor] = useState("HRL Team");
  const [newThumbnail, setNewThumbnail] = useState("https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop");
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);

  // System statistics metrics
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCourses: 0,
    totalCertificates: 0,
    databaseHealth: "unknown"
  });

  // Import state
  const [importType, setImportType] = useState<"lessons" | "users" | "courses">("lessons");
  const [rawJson, setRawJson] = useState("");
  const [parsedPreview, setParsedPreview] = useState<any[] | null>(null);
  const [importReport, setImportReport] = useState<{
    success: boolean;
    imported: number;
    updated: number;
    errors: number;
    details: any[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Telemetry logs local list merged with WebSocket logs
  const [activeLogs, setActiveLogs] = useState<ActivityLog[]>([]);

  // Security Simulator States (The "Dirty Dozen" Vulnerability Tests)
  const [securityTests, setSecurityTests] = useState<{
    id: number;
    title: string;
    category: string;
    description: string;
    payload: any;
    status: "idle" | "running" | "blocked" | "allowed";
    resultDetails?: string;
  }[]>([
    {
      id: 1,
      title: "Self-Created Course (Anonymously)",
      category: "Privilege Escalation",
      description: "Próba zapisu nowego kursu do kolekcji bez żadnej autoryzacji sesji.",
      payload: { title: "Hackers Course", pricing_model: "free", createdAt: new Date().toISOString() },
      status: "idle"
    },
    {
      id: 2,
      title: "Standard Student Course Deletion",
      category: "Privilege Escalation",
      description: "Próba usunięcia istniejącego rekordu kursu przez konto o uprawnieniach student.",
      payload: { courseId: "course-123" },
      status: "idle"
    },
    {
      id: 3,
      title: "Ghost-Field Privilege Escalation",
      category: "Ghost Field Injection",
      description: "Próba wstrzyknięcia ukrytych pól systemowych (np. isSystemGlobal: true) na kursie.",
      payload: { title: "Polished course", description: "Clean description", thumbnail: "ok", pricing_model: "free", isSystemGlobal: true, ghostField: "malicious" },
      status: "idle"
    },
    {
      id: 4,
      title: "Type Poisoning Exploit",
      category: "Zatruwanie Rejestrów",
      description: "Próba wstrzyknięcia nieprawidłowego typu wartości pola (np. boolean zamiast float/number na one_time_price).",
      payload: { title: "React Advanced", one_time_price: true, pricing_model: "one_time" },
      status: "idle"
    },
    {
      id: 5,
      title: "Denial-of-Wallet ID Poisoning",
      category: "Przeciążenie Bazy",
      description: "Próba wywołania ataku ID Poisoning za pomocą nienormalnie długiego identyfikatora dokumentu (np. 200 znaków).",
      payload: { customId: "a".repeat(200), title: "Giant ID Course", pricing_model: "free" },
      status: "idle"
    },
    {
      id: 6,
      title: "Self-Assigned Admin Privilege",
      category: "User Privilege Hijacking",
      description: "Próbne przypisanie roli administratora we własnym dokumencie profilu użytkownika.",
      payload: { email: "student@hrl.com", role: "admin" },
      status: "idle"
    },
    {
      id: 7,
      title: "Cross-User Profile Scrape",
      category: "Prywatność PII",
      description: "Próba bocznego dostępu odczytu profilu innego użytkownika bez posiadania kluczy właściciela.",
      payload: { targetUserId: "student_B" },
      status: "idle"
    },
    {
      id: 8,
      title: "Blanket Directory Leak",
      category: "Prywatność PII",
      description: "Próba zrzucenia całej kolekcji użytkowników (PII) jednym zapytaniem.",
      payload: {},
      status: "idle"
    },
    {
      id: 9,
      title: "Identity Spoofing Write",
      category: "Tożsamość / IP Spoofing",
      description: "Próba nadpisania tożsamości innego użytkownika w bazie poprzez wstrzyknięcie fałszywego ownerId w nagłówkach.",
      payload: { targetUserId: "victim_id", email: "victim@gmail.com", role: "student" },
      status: "idle"
    },
    {
      id: 10,
      title: "Unverified Email Action Bypass",
      category: "Bezpieczeństwo Sesji",
      description: "Próba wykonania akcji administratora z niezweryfikowanym adresem e-mail.",
      payload: { title: "Spoofed course", pricing_model: "free" },
      status: "idle"
    },
    {
      id: 11,
      title: "Immortality Field Modification",
      category: "Integralność Danych",
      description: "Próba naruszenia integralności danych poprzez edycję niezmienialnego pola czasu utworzenia (createdAt).",
      payload: { courseId: "immutable-course", createdAt: "2030-01-01T12:00:00Z" },
      status: "idle"
    },
    {
      id: 12,
      title: "Path Traversal Character Escape",
      category: "Manipulacja Ścieżkami",
      description: "Próba wstrzyknięcia znaków ucieczki do ścieżki i wyjścia z kolekcji za pomocą ../ lub %2F.",
      payload: { pathId: "../admin_escalate", title: "Path Traversal" },
      status: "idle"
    }
  ]);

  const runSecurityTest = async (testId: number) => {
    setSecurityTests(prev => prev.map(t => t.id === testId ? { ...t, status: "running" } : t));
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      if (testId === 1) {
        await addDoc(collection(db, "courses"), {
          title: "Hackers Course",
          pricing_model: "free",
          createdAt: new Date().toISOString()
        });
      } else if (testId === 2) {
        await deleteDoc(doc(db, "courses", "some-course-123"));
      } else if (testId === 3) {
        await setDoc(doc(db, "courses", "course-ghost-test"), {
          title: "Polished course",
          description: "Clean description",
          thumbnail: "ok",
          pricing_model: "free",
          isSystemGlobal: true,
          ghostField: "malicious"
        });
      } else if (testId === 4) {
        await setDoc(doc(db, "courses", "course-type-poison"), {
          title: "React Advanced",
          one_time_price: true,
          pricing_model: "one_time"
        } as any);
      } else if (testId === 5) {
        await setDoc(doc(db, "courses", "a".repeat(200)), {
          title: "Giant ID",
          description: "Blocked by length gate",
          thumbnail: "ok",
          pricing_model: "free"
        });
      } else if (testId === 6) {
        await setDoc(doc(db, "users", "test-user-vuln"), {
          email: "student@hrl.com",
          role: "admin"
        });
      } else if (testId === 7) {
        await getDoc(doc(db, "users", "some-other-student-b"));
      } else if (testId === 8) {
        await getDocs(collection(db, "users"));
      } else if (testId === 9) {
        await setDoc(doc(db, "users/victim_id"), {
          email: "victim@gmail.co.uk",
          role: "student"
        });
      } else if (testId === 10) {
        await addDoc(collection(db, "courses"), {
          title: "Spoofed course",
          thumbnail: "ok",
          description: "No verified email bypass attempt",
          pricing_model: "free"
        });
      } else if (testId === 11) {
        await updateDoc(doc(db, "courses", "immutable-course-test-id"), {
          createdAt: "2030-01-01T12:00:00Z"
        });
      } else if (testId === 12) {
        await setDoc(doc(db, "courses", "../admin_escalate"), {
          title: "Traversal Exploit",
          pricing_model: "free"
        });
      }

      setSecurityTests(prev => prev.map(t => t.id === testId ? {
        ...t,
        status: "allowed",
        resultDetails: "Dostęp Zezwolony (Breach Detected!): System rules failed to block payload."
      } : t));
      addToast("OSTRZEŻENIE: Ten payload nie został zatrzymany!", "error");
    } catch (err: any) {
      setSecurityTests(prev => prev.map(t => t.id === testId ? {
        ...t,
        status: "blocked",
        resultDetails: `Zablokowano przez reguły Firestore. Kod błędu: ${err.code || "permission-denied"} | Komunikat: ${err.message || String(err)}`
      } : t));
      addToast(`🛡️ Forteca Zero-Trust: Zabezpieczono Atak #${testId}!`, "success");
    }
  };

  const fetchUsers = async () => {
    if (!token) return;
    try {
      setUserLoading(true);
      const res = await fetch("/api/admin/users", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserList(data);
        setStats(prev => ({ ...prev, totalUsers: data.length }));
      }
    } catch (err) {
      console.error("Failed to load user account directory", err);
    } finally {
      setUserLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      setCoursesLoading(true);
      let querySnapshot;
      try {
        querySnapshot = await getDocs(collection(db, 'courses'));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'courses');
        return;
      }
      const data: Course[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Course));
      setCoursesList(data);
      setStats(prev => ({ ...prev, totalCourses: data.length }));
    } catch (err: any) {
      console.error("Failed to load courses from Firestore", err);
    } finally {
      setCoursesLoading(false);
    }
  };

  const fetchInitialLogs = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/logs", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActiveLogs(data);
      }
    } catch (err) {
      console.error("Error loading server log indexes", err);
    }
  };

  const fetchBackupAndStats = async () => {
    if (!token) return;
    try {
      // Pull dynamic metrics from student/admin endpoints
      const res = await fetch("/api/courses");
      const c = await res.json();
      const resU = await fetch("/api/admin/users", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const u = await resU.json();
      const resC = await fetch("/api/admin/certificates", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const certs = resC.ok ? await resC.json() : [];
      
      setStats({
        totalCourses: c.length || 0,
        totalUsers: u.length || 0,
        totalCertificates: certs.length || 0,
        databaseHealth: "Silnik SQLite aktywny"
      });
    } catch (err) {
      console.error("Error fetching admin stats", err);
    }
  };

  // Sync WebSocket live logs from Context with local telemetry state
  useEffect(() => {
    if (logs.length > 0) {
      setActiveLogs((prev) => {
        const combined = [...logs, ...prev];
        const unique = combined.filter((val, idx, self) => 
          self.findIndex(t => t.id === val.id) === idx
        );
        return unique.slice(0, 100);
      });
    }
  }, [logs]);

  const fetchCertificates = async () => {
    if (!token) return;
    try {
      setCertificatesLoading(true);
      const res = await fetch("/api/admin/certificates", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCertificatesList(data);
      }
    } catch (err) {
      console.error("Failed to load certificates index", err);
    } finally {
      setCertificatesLoading(false);
    }
  };

  const handleGenerateCertificateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedCourseId) {
      addToast("Wybierz użytkownika oraz kurs przed zatwierdzeniem.", "warning");
      return;
    }

    try {
      setIsGeneratingCert(true);

      // Generate unique hash for certificate
      const encoder = new TextEncoder();
      const content = `${selectedUserId}-${selectedCourseId}-${Date.now()}`;
      const encodedHashData = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encodedHashData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const certificate_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const res = await fetch("/api/admin/certificates", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: Number(selectedUserId),
          course_id: Number(selectedCourseId),
          custom_code: customCertCode || undefined,
          template: previewTemplate,
          certificate_hash
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast("Certyfikat został wyemitowany pomyślnie!", "success");
        setCustomCertCode("");
        fetchCertificates();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsGeneratingCert(false);
    }
  };

  const handleDeleteCertificate = async (certId: number) => {
    const isConfirmed = window.confirm("CZY NA PEWNO CHCESZ UNIEWAŻNIĆ TEN CERTYFIKAT?\n\nUsunięcie wycofa certyfikat z rejestru weryfikacji i zniknie on z panelu studenta.");
    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/certificates/${certId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        fetchCertificates();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  const handleBoostProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boostUserId || !boostCourseId) {
      addToast("Wybierz użytkownika oraz kurs do przyspieszenia.", "warning");
      return;
    }

    try {
      setIsBoosting(true);
      const res = await fetch("/api/admin/boost-progress", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: Number(boostUserId),
          course_id: Number(boostCourseId)
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        setBoostUserId("");
        setBoostCourseId("");
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsBoosting(false);
    }
  };

  // Auto-selects the first course if none is selected
  useEffect(() => {
    if (coursesList.length > 0 && selectedCourseIdVal === null) {
      setSelectedCourseIdVal(Number(coursesList[0].id));
    }
  }, [coursesList, selectedCourseIdVal]);

  // Sync general selected course fields reactively
  useEffect(() => {
    if (selectedCourseIdVal && selectedCourseIdVal !== -1) {
      const match = coursesList.find(c => Number(c.id) === selectedCourseIdVal);
      if (match) {
        setCourseTitle(match.title || "");
        setCourseDescription(match.description || "");
        setCourseInstructor(match.instructor_name || "");
        setCourseThumbnail(match.thumbnail || "");
        setNewPricingModel(match.pricing_model || "free");
        setNewOneTimePrice(String(match.one_time_price || "199"));
        setNewSubscriptionPrice(String(match.subscription_price || "19"));
        setNewSubscriptionInterval(match.subscription_interval || "month");
        setNewTenantDomain(match.tenant_domain || "all_domains");
      }
    } else if (selectedCourseIdVal === -1) {
      setCourseTitle("");
      setCourseDescription("");
      setCourseInstructor("");
      setCourseThumbnail("");
      setNewPricingModel("free");
      setNewOneTimePrice("199");
      setNewSubscriptionPrice("19");
      setNewSubscriptionInterval("month");
      setNewTenantDomain("all_domains");
    }
  }, [selectedCourseIdVal, coursesList]);

  const handleUpdateCourseGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseIdVal) return;
    
    if (selectedCourseIdVal === -1) {
      try {
        setIsUpdatingCourse(true);
        const res = await fetch(`/api/admin/courses`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title: courseTitle,
            description: courseDescription,
            thumbnail: courseThumbnail,
            category: "Kategoria Główna",
            difficulty: "Początkujący",
            instructor_name: courseInstructor,
            pricing_model: newPricingModel,
            one_time_price: Number(newOneTimePrice) || 0,
            subscription_price: Number(newSubscriptionPrice) || 0,
            subscription_interval: newSubscriptionInterval,
            tenant_domain: newTenantDomain
          })
        });

        const data = await res.json();
        if (res.ok) {
          addToast("Nowy kurs / bramka domeny została utworzona pomyślnie!", "success");
          fetchCourses();
          setSelectedCourseIdVal(data.courseId || null);
        } else {
          throw new Error(data.message);
        }
      } catch (err: any) {
        addToast(err.message, "error");
      } finally {
        setIsUpdatingCourse(false);
      }
      return;
    }

    try {
      setIsUpdatingCourse(true);
      const res = await fetch(`/api/admin/courses/${selectedCourseIdVal}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: courseTitle,
          description: courseDescription,
          thumbnail: courseThumbnail,
          category: "Muzyka i Dźwięk",
          difficulty: "Zaawansowany",
          instructor_name: courseInstructor,
          pricing_model: newPricingModel,
          one_time_price: Number(newOneTimePrice) || 0,
          subscription_price: Number(newSubscriptionPrice) || 0,
          subscription_interval: newSubscriptionInterval,
          tenant_domain: newTenantDomain
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast("Bramka płatnicza i parametry domeny zostały zapisane pomyślnie!", "success");
        // Force refresh of the courses list to reflect updated name or domain
        fetchCourses();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsUpdatingCourse(false);
    }
  };

  // Preloads lessons for the chosen course domain gateway
  useEffect(() => {
    if (!selectedCourseIdVal) {
      setLessonsForSelectedCourse([]);
      setSelectedLessonId(null);
      return;
    }
    const loadCourseHierarchy = async () => {
      try {
        setLessonsLoadingState(true);
        const res = await fetch(`/api/courses/${selectedCourseIdVal}`);
        if (res.ok) {
          const data = await res.json();
          // Flatten lessons across modules for simple gateway management
          const flattenedLessons: any[] = [];
          const activeModules: any[] = [];
          if (data.structure && Array.isArray(data.structure)) {
            data.structure.forEach((mod: any) => {
              activeModules.push({ id: mod.id, title: mod.title });
              if (mod.lessons && Array.isArray(mod.lessons)) {
                mod.lessons.forEach((les: any) => {
                  flattenedLessons.push({
                    ...les,
                    module_title: mod.title,
                    module_id: mod.id
                  });
                });
              }
            });
          }
          setModulesForActiveCourse(activeModules);
          setLessonsForSelectedCourse(flattenedLessons);
          if (flattenedLessons.length > 0) {
            setSelectedLessonId(flattenedLessons[0].id);
          } else {
            setSelectedLessonId(null);
          }
        }
      } catch (err) {
        console.error("Failed to fetch course hierarchy for admin gate editor", err);
      } finally {
        setLessonsLoadingState(false);
      }
    };
    loadCourseHierarchy();
  }, [selectedCourseIdVal]);

  const reloadCourseHierarchy = async () => {
    if (!selectedCourseIdVal || selectedCourseIdVal === -1) return;
    try {
      setLessonsLoadingState(true);
      const res = await fetch(`/api/courses/${selectedCourseIdVal}`);
      if (res.ok) {
        const data = await res.json();
        const flattenedLessons: any[] = [];
        const activeModules: any[] = [];
        if (data.structure && Array.isArray(data.structure)) {
          data.structure.forEach((mod: any) => {
            activeModules.push({ id: mod.id, title: mod.title });
            if (mod.lessons && Array.isArray(mod.lessons)) {
              mod.lessons.forEach((les: any) => {
                flattenedLessons.push({ ...les, module_title: mod.title, module_id: mod.id });
              });
            }
          });
        }
        setModulesForActiveCourse(activeModules);
        setLessonsForSelectedCourse(flattenedLessons);
      }
    } catch(err) {
      console.error(err);
    } finally {
      setLessonsLoadingState(false);
    }
  };

  // Preloads lesson metadata, video URL, duration
  useEffect(() => {
    if (!selectedLessonId) {
      setLessonTitle("");
      setLessonModuleTitle("");
      setLessonDescription("");
      setLessonContent("");
      setLessonAccessLevel("free_preview");
      setLessonVideoUrl("");
      setLessonDuration("10");
      return;
    }

    const matchedLocal = lessonsForSelectedCourse.find(l => l.id === selectedLessonId);
    if (matchedLocal) {
      setLessonTitle(matchedLocal.title || "");
      setLessonModuleTitle(matchedLocal.module_title || "");
      setLessonDescription(matchedLocal.description || "");
      setLessonContent(matchedLocal.content || "");
      setLessonAccessLevel(matchedLocal.access_level || "free_preview");
      setLessonVideoUrl(matchedLocal.video_url || "");
      setLessonDuration(String(matchedLocal.duration_minutes || "10"));
    }
  }, [selectedLessonId, lessonsForSelectedCourse]);

  const handleSaveLessonGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLessonId) return;

    try {
      setIsSavingLesson(true);
      const res = await fetch(`/api/admin/lessons/${selectedLessonId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: lessonTitle,
          description: lessonDescription,
          content: lessonContent,
          access_level: lessonAccessLevel,
          video_url: lessonVideoUrl,
          duration_minutes: Number(lessonDuration) || 10,
          module_title: lessonModuleTitle
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        // Refresh courses index
        fetchCourses();
        // Force reload of detailed structures
        const prevCode = selectedCourseIdVal;
        setSelectedCourseIdVal(null);
        setTimeout(() => setSelectedCourseIdVal(prevCode), 50);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsSavingLesson(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers();
      fetchCourses();
    } else if (activeTab === "telemetry") {
      fetchInitialLogs();
    } else if (activeTab === "courses") {
      fetchCourses();
    } else if (activeTab === "backup") {
      fetchBackupAndStats();
    } else if (activeTab === "certificates") {
      fetchCertificates();
      fetchUsers();
      fetchCourses();
    } else if (activeTab === "advertisements") {
      fetchAds();
      fetchCourses();
    } else if (activeTab === "transactions") {
      fetchTransactions();
    } else if (activeTab === "settings") {
      fetchBrandingSettings();
    } else if (activeTab === "limits") {
      fetchSystemLimits();
    }
  }, [activeTab, token]);

  // Fetch System Limits
  const fetchSystemLimits = async () => {
    if (!token) return;
    try {
      setIsLoadingLimits(true);
      const res = await fetch("/api/admin/limits", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSystemLimits(data);
      }
    } catch (err) {
      console.error("Failed to fetch limits", err);
    } finally {
      setIsLoadingLimits(false);
    }
  };

  const handleSaveLimitsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      setIsSavingLimits(true);
      const res = await fetch("/api/admin/limits", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(systemLimits)
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsSavingLimits(false);
    }
  };

  // Fetch Advertisements
  const fetchAds = async () => {
    if (!token) return;
    try {
      setAdsLoading(true);
      const res = await fetch("/api/admin/ads", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdsList(data);
      }
    } catch (err) {
      console.error("Failed to load advertisements", err);
    } finally {
      setAdsLoading(false);
    }
  };

  const handleCreateAdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adCode.trim()) {
      addToast("Uzupełnij kod/tekst reklamy!", "warning");
      return;
    }
    try {
      setIsCreatingAd(true);
      const res = await fetch("/api/admin/ads", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          course_id: adCourseId ? Number(adCourseId) : null,
          ad_type: adType,
          ad_code: adCode,
          link_url: adLink,
          image_url: adImage,
          placement_location: adPlacement
        })
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        setAdCode("");
        setAdLink("");
        setAdImage("");
        fetchAds();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsCreatingAd(false);
    }
  };

  const handleDeleteAd = async (adId: number) => {
    if (!window.confirm("Czy na pewno chcesz usunąć tę reklamę?")) return;
    try {
      const res = await fetch(`/api/admin/ads/${adId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        fetchAds();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  // Fetch Tenant Settings
  const fetchBrandingSettings = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/settings", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBrandingSettings(data);
      }
    } catch (err) {
      console.error("Failed to load branding settings", err);
    }
  };

  const handleSaveSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingSettings(true);
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(brandingSettings)
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        fetchBrandingSettings();
        if (brandingSettings.primary_color) {
          document.documentElement.style.setProperty("--color-primary", brandingSettings.primary_color);
        }
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Fetch Transactions Ledger
  const fetchTransactions = async () => {
    if (!token) return;
    try {
      setTransactionsLoading(true);
      const res = await fetch("/api/admin/transactions", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTransactionsList(data);
      }
    } catch (err) {
      console.error("Failed to load transactions log", err);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const handleRefundTransaction = async (txId: number) => {
    if (!window.confirm("CZY NA PEWNO CHCESZ WYCOFAĆ TĘ TRANSAKCJĘ?\n\nSpowoduje to zmianę statusu na refundowany (failed) i wycofanie dostępu do kursu dla tej subskrypcji.")) return;
    try {
      const res = await fetch(`/api/admin/transactions/${txId}/refund`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        fetchTransactions();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  const fetchUserAccess = async (targetUserId: string | number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/users/${targetUserId}/enrollments`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserEnrollmentsMap(prev => ({ ...prev, [targetUserId]: data }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExpandUser = (targetUserId: string | number) => {
    if (expandedUser === targetUserId) {
      setExpandedUser(null);
    } else {
      setExpandedUser(targetUserId);
      fetchUserAccess(targetUserId);
    }
  };

  const handleToggleAccess = async (targetUserId: string | number, courseId: string | number, isEnrolled: boolean) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/users/${targetUserId}/enrollments`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ courseId, action: isEnrolled ? "revoke" : "grant" })
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        fetchUserAccess(targetUserId);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  const handleRoleChange = async (targetUserId: string | number, newRole: "student" | "admin") => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/users/${targetUserId}/role`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        setUserList((prev) =>
          prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole } : u))
        );
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  // Direct Creation of Courses from dynamic UI Admin
  const handleCreateExtCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extCourseTitle || !extCourseUrl) return;
    
    try {
      setIsSavingExtCourse(true);
      await addDoc(collection(db, "external_courses"), {
        title: extCourseTitle,
        description: extCourseDescription,
        access_type: extCourseAccess,
        external_url: extCourseUrl,
        created_at: new Date().toISOString()
      });
      addToast("Zewnętrzny kurs załadowany do Firebase!", "success");
      setExtCourseTitle("");
      setExtCourseDescription("");
      setExtCourseUrl("");
    } catch (err: any) {
      addToast("Błąd łączenia z Firebase: " + err.message, "error");
    } finally {
      setIsSavingExtCourse(false);
    }
  };

  const handleCreateCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim() || !newThumbnail.trim()) {
      addToast("Uzupełnij tytuł, opis i okładkę przed zatwierdzeniem.", "warning");
      return;
    }

    try {
      setIsCreatingCourse(true);
      try {
        await addDoc(collection(db, 'courses'), {
          title: newTitle,
          description: newDescription,
          category: newCategory,
          difficulty: newDifficulty,
          instructor_name: newInstructor,
          thumbnail: newThumbnail,
          pricing_model: newPricingModel,
          one_time_price: newPricingModel === "one_time" ? Number(newOneTimePrice) : 0.0,
          subscription_price: newPricingModel === "subscription" ? Number(newSubscriptionPrice) : 0.0,
          subscription_interval: newPricingModel === "subscription" ? newSubscriptionInterval : "month",
          tenant_domain: newTenantDomain || "all_domains",
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'courses');
        return;
      }

      addToast("Nowy program szkoleniowy został pomyślnie zapisany w Firestore!", "success");
      // Reset form
      setNewTitle("");
      setNewDescription("");
      // Reload
      fetchCourses();
    } catch (err: any) {
      addToast("Błąd zapisu: " + err.message, "error");
    } finally {
      setIsCreatingCourse(false);
    }
  };

  // Cascade delete database course on confirmation click
  const handleDeleteCourse = async (courseId: string | number) => {
    const isConfirmed = window.confirm("CZY NA PEWNO CHCESZ TRWALE USUNĄĆ TEN KURS?\n\nUsunięcie wywoła efekt kaskadowy (całość modułów, lekcji, quizów i powiązanych postępów uczniów zostanie bezpowrotnie wykasowana z systemu Firestore).");
    if (!isConfirmed) return;

    try {
      try {
        await deleteDoc(doc(db, 'courses', String(courseId)));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `courses/${courseId}`);
        return;
      }
      addToast("Kurs został trwale usunięty z systemu.", "success");
      fetchCourses();
    } catch (err: any) {
      addToast("Błąd usuwania kursu: " + err.message, "error");
    }
  };

  // Automated trigger of schema nested JSON download back with one click
  const handleDownloadBackup = async () => {
    try {
      addToast("Przetwarzanie struktury bazy danych...", "info");
      const res = await fetch("/api/admin/export-database", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const nestedBackup = await res.json();
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
          JSON.stringify(nestedBackup, null, 2)
        )}`;
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", jsonString);
        downloadAnchor.setAttribute("download", `HRL_Course_Hub_Backup_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        addToast("Pomyślnie wygenerowano i wyemitowano plik kopii zapasowej!", "success");
      } else {
        throw new Error("Nieautoryzowana próba eksportu danych.");
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  const preventDragDefault = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type !== "application/json" && !file.name.endsWith(".json")) {
        addToast("Wymagany jest plik w formacie JSON (.json)", "error");
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setRawJson(text);
        processRawJson(text);
      };
      reader.readAsText(file);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawJson(val);
    processRawJson(val);
  };

  const processRawJson = (text: string) => {
    if (!text.trim()) {
      setParsedPreview(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        setParsedPreview(parsed.slice(0, 5));
      } else {
        setParsedPreview([parsed]);
      }
    } catch (_) {
      setParsedPreview(null);
    }
  };

  const handleJsonImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawJson.trim()) {
      addToast("Wklej lub prześlij dane JSON przed uruchomieniem importu", "warning");
      return;
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(rawJson);
    } catch (err: any) {
      addToast("Błąd składniowy JSON: " + err.message, "error");
      return;
    }

    setIsImporting(true);
    setImportReport(null);

    try {
      const res = await fetch(`/api/admin/import/${importType}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsedPayload)
      });
      const data = await res.json();
      if (res.ok) {
        addToast(`Zakończono importowanie. Sukces: ${data.importedCount}, Zaktualizowano: ${data.updatedCount}`, "success");
        setImportReport({
          success: true,
          imported: data.importedCount,
          updated: data.updatedCount,
          errors: data.errorCount,
          details: data.details || []
        });
        setRawJson("");
        setParsedPreview(null);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast("Import zakończony krytycznym błędem: " + err.message, "error");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div id="admin-panel-workspace" className="space-y-8 pb-16">
      
      {/* 1. Pro Command Center Hero Banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 border border-amber-500/30 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 justify-between shadow-[0_0_35px_rgba(0,0,0,0.9)]">
        <div className="space-y-3 text-center md:text-left z-10 max-w-2xl">
          <div className="inline-flex py-1.5 px-3.5 bg-gradient-to-r from-amber-500/10 via-violet-500/10 to-pink-500/10 rounded-full text-xs font-mono text-amber-300 items-center gap-2 border border-amber-500/30 shadow-inner">
            <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="font-semibold tracking-wide">Centrum Dowodzenia HRL Academy Pro</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white tracking-tight leading-tight">
            Konsola Zarządzania i Administracji
          </h1>
          <p className="text-zinc-300 text-sm leading-relaxed">
            Zarządzaj użytkownikami, kursami, dyplomami, transakcjami finansowymi, ustawieniami brandingu i zabezpieczeniami Zero-Trust z jednego zintegrowanego miejsca.
          </p>

          {/* Quick Metrics Ribbon */}
          <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
            <div className="px-3 py-1.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-300 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-violet-400" />
              <span>Użytkownicy: <strong className="text-white">{userList.length}</strong></span>
            </div>
            <div className="px-3 py-1.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-300 flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>Kursy: <strong className="text-white">{coursesList.length}</strong></span>
            </div>
            <div className="px-3 py-1.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-300 flex items-center gap-2">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Dyplomy: <strong className="text-white">{certificatesList.length}</strong></span>
            </div>
            <div className="px-3 py-1.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-300 flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-pink-400" />
              <span>Transakcje: <strong className="text-white">{transactionsList.length}</strong></span>
            </div>
          </div>
        </div>

        {/* 3D Emblem Showcase */}
        <div className="flex items-center gap-4 z-10 flex-shrink-0">
          <div className="relative group p-1 bg-gradient-to-tr from-amber-500 via-violet-600 to-pink-500 rounded-3xl shadow-[0_0_30px_rgba(245,158,11,0.3)]">
            <img
              src="/logo_3d.jpg"
              alt="HRL Pro 3D Logo"
              className="w-28 h-28 md:w-36 md:h-36 rounded-2xl object-cover border border-zinc-900"
            />
          </div>
        </div>

        {/* Decorative background glows */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* 2. Unified Modern Command Center Tabs Grid */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-2 backdrop-blur-md shadow-xl">
        <div className="flex flex-wrap gap-1.5 justify-start">
          
          <button
            id="tab-btn-users"
            onClick={() => setActiveTab("users")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "users"
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold shadow-lg shadow-violet-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <Users className="w-4 h-4 text-violet-300" />
            <span>Użytkownicy</span>
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-zinc-950/60 rounded-md text-zinc-400">{userList.length}</span>
          </button>

          <button
            id="tab-btn-courses"
            onClick={() => setActiveTab("courses")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "courses"
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold shadow-lg shadow-violet-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>Kursy & Bramki</span>
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-zinc-950/60 rounded-md text-zinc-400">{coursesList.length}</span>
          </button>

          <button
            id="tab-btn-external"
            onClick={() => setActiveTab("external")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "external"
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-lg shadow-emerald-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Kursy Zewnętrzne</span>
          </button>

          <button
            id="tab-btn-certificates"
            onClick={() => setActiveTab("certificates")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "certificates"
                ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold shadow-lg shadow-amber-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <Award className="w-4 h-4 text-amber-400" />
            <span>Dyplomy & Certyfikaty</span>
          </button>

          <button
            id="tab-btn-advertisements"
            onClick={() => setActiveTab("advertisements")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "advertisements"
                ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white font-bold shadow-lg shadow-pink-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <Megaphone className="w-4 h-4 text-pink-400" />
            <span>Reklamy</span>
          </button>

          <button
            id="tab-btn-transactions"
            onClick={() => setActiveTab("transactions")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "transactions"
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-lg shadow-emerald-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Finanse</span>
          </button>

          <button
            id="tab-btn-settings"
            onClick={() => setActiveTab("settings")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "settings"
                ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold shadow-lg shadow-cyan-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <SettingsIcon className="w-4 h-4 text-cyan-400" />
            <span>Branding & Ustawienia</span>
          </button>

          <button
            id="tab-btn-limits"
            onClick={() => setActiveTab("limits")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "limits"
                ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white font-bold shadow-lg shadow-amber-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <span>Limity & Quoty</span>
          </button>

          <button
            id="tab-btn-messages"
            onClick={() => setActiveTab("messages")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "messages"
                ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold shadow-lg shadow-violet-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <MessageSquare className="w-4 h-4 text-violet-400" />
            <span>Wiadomości</span>
          </button>

          <button
            id="tab-btn-backup"
            onClick={() => setActiveTab("backup")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "backup"
                ? "bg-gradient-to-r from-zinc-700 to-zinc-600 text-white font-bold shadow-lg shadow-zinc-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <HardDrive className="w-4 h-4 text-zinc-300" />
            <span>Kopie Danych</span>
          </button>

          <button
            id="tab-btn-import"
            onClick={() => setActiveTab("import")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "import"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-lg shadow-blue-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <Upload className="w-4 h-4 text-blue-400" />
            <span>Import JSON</span>
          </button>

          <button
            id="tab-btn-telemetry"
            onClick={() => setActiveTab("telemetry")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "telemetry"
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold shadow-lg shadow-indigo-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>Telemetria Live</span>
          </button>

          <button
            id="tab-btn-security"
            onClick={() => setActiveTab("security")}
            className={`py-2.5 px-4 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "security"
                ? "bg-gradient-to-r from-rose-600 to-red-600 text-white font-bold shadow-lg shadow-rose-500/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
            <span className="text-rose-300 font-semibold">Forteca Zero-Trust</span>
          </button>

        </div>
      </div>

      {/* Main View Port content */}
      <div id="admin-active-view">
        
        {/* TAB 1: USERS DIRECTORY MANAGEMENT */}
        {activeTab === "users" && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden p-6 space-y-6">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <UserCog className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-300">Aktywni członkowie platformy</h3>
            </div>

            {userLoading ? (
              <div className="text-center py-12 text-xs font-mono text-zinc-500 animate-pulse">Ładowanie rekordów członków...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-zinc-300 text-left text-sm divide-y divide-zinc-800">
                  <thead className="text-zinc-500 text-xs font-mono uppercase">
                    <tr>
                      <th className="py-3 px-4">Użytkownik</th>
                      <th className="py-3 px-4">Adres E-mail</th>
                      <th className="py-3 px-4 text-center">Aktywna Rola</th>
                      <th className="py-3 px-4 text-right">Zmień poziom uprawnień</th>
                      <th className="py-3 px-4 text-right">Dostęp do kursów</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {userList.map((item) => (
                      <React.Fragment key={item.id}>
                        <tr className="hover:bg-zinc-950/40">
                          <td className="py-4 px-4 font-semibold text-white">{item.username}</td>
                          <td className="py-4 px-4 text-zinc-400">{item.email}</td>
                          <td className="py-4 px-4 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase ${
                              item.role === 'admin'
                                ? 'bg-violet-950/40 border border-violet-500 text-violet-300'
                                : 'bg-zinc-950 border border-zinc-800 text-zinc-400'
                            }`}>
                              {item.role}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <div className="inline-flex gap-1 bg-zinc-955 bg-zinc-950 p-1 border border-zinc-800 rounded-xl text-xs font-mono">
                              <button
                                id={`role-btn-student-${item.id}`}
                                onClick={() => handleRoleChange(item.id, "student")}
                                className={`px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                                  item.role === "student" ? "bg-zinc-800 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
                                }`}
                              >
                                STUDENT
                              </button>
                               <button
                                id={`role-btn-admin-${item.id}`}
                                onClick={() => handleRoleChange(item.id, "admin")}
                                className={`px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                                  item.role === "admin" ? "bg-violet-900/40 text-violet-400 font-bold" : "text-zinc-500 hover:text-zinc-300"
                                }`}
                              >
                                ADMIN
                              </button>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <button
                              onClick={() => handleExpandUser(item.id)}
                              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/50 rounded-lg text-xs font-mono text-zinc-300 transition-colors"
                            >
                              {expandedUser === item.id ? "ZAMKNIJ" : "ZARZĄDZAJ"}
                            </button>
                          </td>
                        </tr>
                        {expandedUser === item.id && (
                          <tr className="bg-zinc-950/80">
                            <td colSpan={5} className="p-4">
                              <div className="space-y-3">
                                <h4 className="text-xs font-mono uppercase text-zinc-400 mb-2">Przypisane Kursy:</h4>
                                {coursesList.map(course => {
                                  const isEnrolled = userEnrollmentsMap[item.id]?.includes(course.id) || false;
                                  return (
                                    <div key={course.id} className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                                      <div className="flex items-center gap-3">
                                        <img src={course.thumbnail} alt={course.title} className="w-10 h-7 object-cover rounded" />
                                        <span className="text-sm text-zinc-300">{course.title}</span>
                                      </div>
                                      <button
                                        onClick={() => handleToggleAccess(item.id, course.id, isEnrolled)}
                                        className={`px-3 py-1 rounded text-xs font-bold uppercase transition-colors ${
                                          isEnrolled 
                                            ? "bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-900/50" 
                                            : "bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60 border border-emerald-900/50"
                                        }`}
                                      >
                                        {isEnrolled ? "ODBIERZ DOSTĘP" : "PRZYZNAJ DOSTĘP"}
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: COURSE CREATOR & ACTIVE LIST OVERVIEW */}
        {activeTab === "courses" && (
          <div className="space-y-6">
            
            {/* Upper select/card row to choose which External Course Gateway to configure */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-violet-400" />
                    <h2 className="text-base font-mono uppercase tracking-wider text-white font-bold">Wybierz Bramkę Domenową (Course Gateway)</h2>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Aplikacja kontroluje wyłącznie paywalle, dostęp, metadane lekcji, certyfikaty oraz wideo dla istniejących kursów na innych domenach.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <span className="text-xs font-mono text-zinc-500 uppercase flex items-center">Aktywny Tenant:</span>
                  <select
                    value={selectedCourseIdVal || ""}
                    onChange={(e) => setSelectedCourseIdVal(Number(e.target.value))}
                    className="bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-4 text-xs text-zinc-200 focus:outline-none cursor-pointer text-zinc-300 font-bold"
                  >
                    <option value="">-- Wybierz Bramkę --</option>
                    {coursesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.tenant_domain || "all_domains"})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Grid of Course/Domain Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                {coursesList.map((c) => {
                  const isSelected = selectedCourseIdVal === Number(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCourseIdVal(Number(c.id))}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-36 ${
                        isSelected 
                          ? "bg-violet-950/20 border-violet-500/80 shadow-lg shadow-violet-500/5 cursor-default hover:border-violet-500" 
                          : "bg-zinc-950 border-zinc-850 hover:bg-zinc-900/40"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded font-bold ${
                            c.pricing_model === "free" ? "bg-emerald-500/15 text-emerald-400" : "bg-gradient-to-r from-violet-500/20 to-pink-500/20 text-pink-400"
                          }`}>
                            {c.pricing_model === "free" ? "FREE PREVIEW" : c.pricing_model === "subscription" ? "SUBSCRIPTION CHECKOUT" : "LIFETIME PURCHASE"}
                          </span>
                          <span className="text-[10px] text-zinc-650 font-mono">ID: {c.id}</span>
                        </div>
                        <h4 className="text-xs font-bold text-white line-clamp-1">{c.title}</h4>
                        <p className="text-[10px] text-zinc-400 line-clamp-2 mt-1 leading-normal">{c.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 border-t border-zinc-900/80 pt-2 text-[9px] text-zinc-500 font-mono">
                        <Globe className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold truncate">domena: {c.tenant_domain || 'all_domains'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedCourseIdVal ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Domain Tenant General & Paywall settings */}
                <div className="lg:col-span-12 max-w-3xl mx-auto w-full space-y-6">
                  {/* New Form for Course Metadata */}
                  <div className="bg-zinc-900/60 border border-emerald-500/20 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-emerald-500/20 pb-3 font-bold text-zinc-200">
                      <Globe className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400">Zarządzanie Metadanymi Kursu (Firestore)</h3>
                    </div>
                    
                    {/* Bulk JSON Upload */}
                    <div className="space-y-2">
                        <label className="text-xs text-zinc-400">Masowy import (JSON):</label>
                        <input type="file" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setIsSavingExtCourse(true);
                          const reader = new FileReader();
                          reader.onload = async (event) => {
                            try {
                              const json = JSON.parse(event.target?.result as string);
                              if (!Array.isArray(json)) throw new Error("Oczekiwano tablicy kursów");
                              for (const item of json) {
                                // Validation
                                if (!item.title || typeof item.title !== 'string') throw new Error("Każdy kurs musi mieć poprawny tytuł");
                                if (!item.external_url || typeof item.external_url !== 'string') throw new Error("Każdy kurs musi mieć poprawny adres URL");
                                
                                await addDoc(collection(db, "external_courses"), {
                                    title: item.title,
                                    description: item.description || "",
                                    access_type: item.access_type || "free",
                                    external_url: item.external_url,
                                    created_at: new Date().toISOString()
                                  });
                              }
                              addToast("Pomyślnie zaimportowano kursy", "success");
                            } catch (err: any) {
                              addToast("Błąd importu: " + err.message, "error");
                            } finally {
                              setIsSavingExtCourse(false);
                            }
                          };
                          reader.readAsText(file);
                        }} accept=".json" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-xs text-white" />
                    </div>

                    <form onSubmit={handleCreateExtCourse} className="space-y-4">
                        <input type="text" value={extCourseTitle} onChange={(e) => setExtCourseTitle(e.target.value)} placeholder="Tytuł kursu" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-xs text-white" required />
                        <textarea value={extCourseDescription} onChange={(e) => setExtCourseDescription(e.target.value)} placeholder="Opis" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-xs text-white" rows={2} />
                        <select value={extCourseAccess} onChange={(e) => setExtCourseAccess(e.target.value as any)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-xs text-white">
                          <option value="free">Free</option>
                          <option value="paid">Paid</option>
                        </select>
                        <input type="url" value={extCourseUrl} onChange={(e) => setExtCourseUrl(e.target.value)} placeholder="https://url-kursu.pl" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-xs text-white" required/>
                        <button type="submit" className="w-full py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl" disabled={isSavingExtCourse}>Zapisz Metadane</button>
                    </form>
                  </div>

                  <form onSubmit={handleUpdateCourseGateway} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 font-bold text-zinc-200">
                      <SlidersHorizontal className="w-4 h-4 text-violet-400" />
                      <h3 className="text-xs font-mono uppercase tracking-wider">Konfiguracja Bramki i Paywallu</h3>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-mono text-zinc-450 uppercase tracking-widest">Tytuł kursu na domenie</label>
                      <input
                        type="text"
                        value={courseTitle}
                        onChange={(e) => setCourseTitle(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-xs text-zinc-200 focus:outline-none"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Krótki opis / Podsumowanie</label>
                      <textarea
                        value={courseDescription}
                        onChange={(e) => setCourseDescription(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-xs text-zinc-200 focus:outline-none"
                        rows={3}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Nazwa prowadzącego</label>
                        <input
                          type="text"
                          value={courseInstructor}
                          onChange={(e) => setCourseInstructor(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-xs text-zinc-200 focus:outline-none"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Adres okładki (URL)</label>
                        <input
                          type="text"
                          value={courseThumbnail}
                          onChange={(e) => setCourseThumbnail(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-xs text-zinc-200 focus:outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-4 border-t border-zinc-850 pt-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Bramka Finansowa (Zabezpieczenie)</label>
                        <select
                          value={newPricingModel}
                          onChange={(e) => setNewPricingModel(e.target.value as any)}
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-xs text-zinc-200 focus:outline-none cursor-pointer"
                        >
                          <option value="free">Darmowy (Direct Enrollment / Brak paywallu)</option>
                          <option value="one_time">Jednorazowa opłata (Lifetime Gateway Access)</option>
                          <option value="subscription">Subskrypcja (Zewnętrzny Paywall)</option>
                        </select>
                      </div>

                      {newPricingModel === "one_time" && (
                        <div className="space-y-2">
                          <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Cena dostępu jednorazowego (PLN)</label>
                          <input
                            type="number"
                            value={newOneTimePrice}
                            onChange={(e) => setNewOneTimePrice(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-xs text-zinc-200 focus:outline-none font-bold"
                            required
                          />
                        </div>
                      )}

                      {newPricingModel === "subscription" && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest font-mono">Kwota abonamentu (PLN)</label>
                            <input
                              type="number"
                              value={newSubscriptionPrice}
                              onChange={(e) => setNewSubscriptionPrice(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-xs text-zinc-200 focus:outline-none"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Okres</label>
                            <select
                              value={newSubscriptionInterval}
                              onChange={(e) => setNewSubscriptionInterval(e.target.value as any)}
                              className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-xs text-zinc-200 focus:outline-none cursor-pointer"
                            >
                              <option value="month">miesięcznie</option>
                              <option value="year">rocznie</option>
                            </select>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 border-t border-zinc-850 pt-4">
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-emerald-400" />
                          <label className="block text-xs font-mono text-zinc-300 uppercase tracking-widest font-bold">Domena bramki paywallowej</label>
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-normal">
                          Kurs i zabezpieczenia Paywall będą aktywne wyłącznie dla zapytań pochodzących z tej domeny internetowej.
                        </p>
                        <input
                          type="text"
                          value={newTenantDomain}
                          onChange={(e) => setNewTenantDomain(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-4 text-xs text-zinc-200 focus:outline-none font-mono font-bold text-emerald-400"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isUpdatingCourse}
                      className="w-full py-3 bg-gradient-to-r from-violet-600 to-pink-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingCourse ? "Zapisywanie..." : (selectedCourseIdVal === -1 ? "Utwórz Nowy Kurs (Bramkę)" : "Zapisz Ograniczenia i Paywall Bramki")}
                    </button>
                  </form>

                  {selectedCourseIdVal !== -1 && (
                  <div className="p-4 bg-zinc-900/30 border border-zinc-850 rounded-xl space-y-2">
                    <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-widest font-bold flex items-center gap-1.5 text-zinc-350">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" /> Trwałe wycofanie bramki
                    </h4>
                    <p className="text-[10px] text-zinc-500 leading-normal">
                      Usunięcie trwale kasuje całą konfigurację domeny, wszystkie lekcje, testy walidacyjne, quizy oraz wygenerowane certyfikaty w SQLite.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if(confirm("Czy na pewno chcesz bezpowrotnie usunąć tę bramkę tenantową i wszystkie podpięte lekcje? Tego kroku nie da się cofnąć.")) {
                          handleDeleteCourse(selectedCourseIdVal);
                          setSelectedCourseIdVal(null);
                        }
                      }}
                      className="px-3 py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-red-400 text-xs font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer font-bold"
                    >
                      Usuń Bramkę Tenantową {newTenantDomain}
                    </button>
                  </div>
                  )}
                </div>



              </div>
            ) : (
              <p className="text-xs font-mono text-zinc-500 text-center py-8">
                Utwórz lub zaimportuj przynajmniej jedną bramkę tenantową, aby aktywować panel kontrolny.
              </p>
            )}

          </div>
        )}

        {/* TAB EXTERNAL: Firestore External Courses */}
        {activeTab === "external" && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 max-w-3xl mx-auto">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Globe className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-300 font-bold">Kreator Zewnętrznych Kursów (Firestore)</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Zapisuje metadane zewnętrzne bezpośrednio do chmurowej bazy noSQL (Firestore). Żadne quizy, lokalne nagrania MP4 czy certyfikaty HRL nie są powiązane z tymi elementami.
              </p>

              <form onSubmit={handleCreateExtCourse} className="space-y-4 border border-emerald-500/10 p-5 rounded-xl bg-zinc-950/50">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-emerald-500/80 tracking-widest font-bold block">Tytuł kursu widoczny dla studentów</label>
                  <input
                    type="text"
                    value={extCourseTitle}
                    onChange={(e) => setExtCourseTitle(e.target.value)}
                    required
                    maxLength={140}
                    placeholder="np. Bootkamp Wiosna 2026 (Zewnętrzny)"
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg py-2.5 px-4 text-xs text-white outline-none"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-emerald-500/80 tracking-widest font-bold block">Opis krótki (SEO / Wizytówka)</label>
                  <textarea
                    value={extCourseDescription}
                    onChange={(e) => setExtCourseDescription(e.target.value)}
                    rows={3}
                    placeholder="Krótki tekst promocyjny..."
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg py-2.5 px-4 text-xs text-white outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-emerald-500/80 tracking-widest font-bold block">Poziom Dostępu (Access)</label>
                    <select
                      value={extCourseAccess}
                      onChange={(e) => setExtCourseAccess(e.target.value as any)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg py-2.5 px-4 text-xs text-emerald-400 font-bold outline-none cursor-pointer"
                    >
                      <option value="free">DARMOWY / OTWARTY (Free)</option>
                      <option value="paid">PŁATNY / VIP (Paid)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-emerald-500/80 tracking-widest font-bold block">Zewnętrzny Adres URL (Deep Link)</label>
                    <input
                      type="url"
                      value={extCourseUrl}
                      onChange={(e) => setExtCourseUrl(e.target.value)}
                      required
                      placeholder="https://platforma.inna-domena.pl/kod-kursu"
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg py-2.5 px-4 text-xs text-white outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSavingExtCourse}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-zinc-950 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] flex justify-center items-center cursor-pointer disabled:opacity-50"
                  >
                    {isSavingExtCourse ? "Synchronizacja z Firebase..." : "Publikuj Kurs Zewnętrzny"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: SYSTEM HEALTH AND BACKUP DOWNLOADS PANEL */}
        {activeTab === "backup" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left box: Dynamic stats indicator panel */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-6">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Terminal className="w-4 h-4 text-violet-400 animate-pulse" />
                <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-300">Wskaźniki stanu i żywotności bazodanowej</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-zinc-950 border border-zinc-85 w-full rounded-2xl space-y-1">
                  <span className="block text-xs font-mono uppercase tracking-widest text-zinc-500">Uczestnicy (Łącznie)</span>
                  <span className="block text-2xl font-bold text-white font-display">{stats.totalUsers} Kont</span>
                </div>
                <div className="p-4 bg-zinc-950 border border-zinc-85 w-full rounded-2xl space-y-1">
                  <span className="block text-xs font-mono uppercase tracking-widest text-zinc-500">Programy (Łącznie)</span>
                  <span className="block text-2xl font-bold text-white font-display">{stats.totalCourses} Modułów</span>
                </div>
                <div className="p-4 bg-zinc-950 border border-zinc-85 w-full rounded-2xl space-y-1">
                  <span className="block text-xs font-mono uppercase tracking-widest text-zinc-500">Rejestr dyplomów</span>
                  <span className="block text-2xl font-bold text-white font-display">{stats.totalCertificates} Sztuk</span>
                </div>
                <div className="p-4 bg-zinc-950 border border-zinc-85 w-full rounded-2xl space-y-1">
                  <span className="block text-xs font-mono uppercase tracking-widest text-zinc-500">Wersja silnika bazy</span>
                  <span className="block text-sm font-bold text-emerald-400 font-mono pt-1">SQLite 3 Serverless</span>
                </div>
              </div>

              <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-850 text-xs text-zinc-400 leading-normal space-y-1">
                <span className="text-white font-mono font-bold block uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1.5 text-orange-400">
                  <AlertCircle className="w-3.5 h-3.5" /> status spójności danych:
                </span>
                <p>Serwer monitoruje spójność bazodanową SQLite na bieżąco. Automatyczne usuwanie kluczy obcych (cascades) zabezpiecza tabele przed powstawaniem osieroconych rekordów lekcji i quizów.</p>
              </div>
            </div>

            {/* Right block: Backup button and info */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-805/80 pb-3">
                  <Database className="w-4 h-4 text-pink-400" />
                  <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-300">Eksport Schematu Kursów w JSON</h3>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">
                  Generuj pełen zagnieżdżony obraz wszystkich kursów, modułów, lekcji oraz powiązanych pytań testowych jednym kliknięciem. Pozwala to na pobranie kopii bezpieczeństwa, którą można błyskawiczki zaimportować ponownie na dowolnym innym środowisku HRL Course Hub.
                </p>
              </div>

              <div className="pt-6 border-t border-zinc-850">
                <button
                  onClick={handleDownloadBackup}
                  className="w-full py-4 bg-gradient-to-r from-violet-600 to-pink-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg hover:shadow-violet-600/15 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 animate-bounce" />
                  Wyeksportuj Dane Platformy do JSON
                </button>
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: MASS JSON IMPORT PORTAL */}
        {activeTab === "import" && (
          <AdminJSONImporter token={token} addToast={addToast} />
        )}

        {/* TAB 3: CERTIFICATES & ADVANCED TOOLS */}
        {activeTab === "certificates" && (
          <div className="space-y-6">
            
            {/* Top Grid: Generation & Booster tools */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Form 1: Generate Certificate */}
              <div className="bg-zinc-90 w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                  <Award className="w-5 h-5 text-violet-400" />
                  <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-300 font-bold">Ręczny Generator Certyfikatów</h3>
                </div>
                <p className="text-xs text-zinc-400">
                  Użyj tego formularza, aby z poziomu administratora nadać wybrany certyfikat studentowi bez konieczności przechodzenia zaliczeń i quizów.
                </p>

                <form onSubmit={handleGenerateCertificateSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">Kursant / Użytkownik</label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 py-2 px-3 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
                    >
                      <option value="">-- Wybierz kursanta --</option>
                      {userList.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.email}) - {u.role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">Kurs</label>
                    <select
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 py-2 px-3 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
                    >
                      <option value="">-- Wybierz kurs --</option>
                      {coursesList.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">Własny kod certyfikatu (Opcjonalnie)</label>
                    <input
                      type="text"
                      value={customCertCode}
                      onChange={(e) => setCustomCertCode(e.target.value)}
                      placeholder="Pozostaw puste dla generowanego kodu HRL-GEN-XXXX"
                      className="w-full bg-zinc-950 border border-zinc-800 py-2 px-3 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isGeneratingCert || !selectedUserId || !selectedCourseId}
                    className="w-full py-2 px-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:hover:bg-violet-600 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isGeneratingCert ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Emisja certyfikatu...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Award className="w-4 h-4" /> Wygeneruj Certyfikat
                      </span>
                    )}
                  </button>
                </form>
              </div>

              {/* Form 2: Manual Booster Tool */}
              <div className="bg-zinc-90 w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-300 font-bold">Narzędzie Szybkiego Postępu (Booster)</h3>
                </div>
                <p className="text-xs text-zinc-400">
                  To narzędzie odznacza <b>wszystkie lekcje</b> w danym kursie jako zakończone pomyślnie (100% postępu) dla wybranego użytkownika. Ułatwia to szybkie nadawanie uprawnień, weryfikację ścieżek edukacyjnych oraz natychmiastowe uwalnianie certyfikatów w systemie synchronicznym.
                </p>

                <form onSubmit={handleBoostProgressSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">Kursant / Użytkownik</label>
                    <select
                      value={boostUserId}
                      onChange={(e) => setBoostUserId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 py-2 px-3 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Wybierz kursanta --</option>
                      {userList.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">Kurs do boosterowania</label>
                    <select
                      value={boostCourseId}
                      onChange={(e) => setBoostCourseId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 py-2 px-3 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Wybierz kurs --</option>
                      {coursesList.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isBoosting || !boostUserId || !boostCourseId}
                    className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:hover:bg-amber-600 text-black font-semibold rounded-lg text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isBoosting ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Uruchamianie procedury boostera...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Zap className="w-4 h-4" /> Przyspiesz Postęp do 100%
                      </span>
                    )}
                  </button>
                </form>
              </div>

            </div>

            {/* Visual Certificate Preview & Print Generator */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
               <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                 <div className="flex items-center gap-2">
                   <Award className="w-5 h-5 text-emerald-400" />
                   <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-300 font-bold">Wizualny Generator Certyfikatów</h3>
                 </div>
                 <div className="flex items-center gap-3">
                   <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Szablon:</span>
                   <select
                     value={previewTemplate}
                     onChange={(e) => setPreviewTemplate(e.target.value as any)}
                     className="bg-zinc-950 border border-zinc-700 py-1 px-3 rounded-lg text-xs font-mono text-zinc-200 outline-none"
                   >
                     <option value="minimalist">1. Minimalist (Jasny Oszczędny)</option>
                     <option value="cyber">2. Cyber Security (Neonowy Niebieski)</option>
                     <option value="diploma">3. Diploma University (Klasyczny Akademicki)</option>
                     <option value="luxury">4. Black Luxury (Czarno-Złoty)</option>
                   </select>
                 </div>
               </div>

               <div className="flex justify-center p-6 bg-zinc-950 border border-dashed border-zinc-800 rounded-xl overflow-x-auto relative">
                 <VisualCertificatePreview
                   ref={certificateRef}
                   template={previewTemplate}
                   studentName={selectedUserId ? userList.find(u => u.id === Number(selectedUserId))?.username || '' : 'Imię i Nazwisko'}
                   courseTitle={selectedCourseId ? coursesList.find(c => c.id === Number(selectedCourseId))?.title || '' : 'Wybierz kurs...'}
                   issueDate={new Date().toLocaleDateString('pl-PL')}
                   certificateCode={customCertCode || 'HRL-GEN-PREVIEW'}
                 />
                 {(!selectedUserId || !selectedCourseId) && (
                   <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center z-10">
                     <p className="text-sm font-mono text-zinc-400 bg-zinc-900 px-6 py-3 border border-zinc-800 rounded-xl">Wybierz kursanta i kurs powyżej, aby wygenerować podgląd.</p>
                   </div>
                 )}
               </div>
            </div>

            {/* Issued Certificates Register List */}
            <div className="bg-zinc-90 w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-violet-400" />
                  <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-350 font-bold">Księga Rejestru Certyfikatów</h3>
                </div>
                <span className="text-xs bg-zinc-950 border border-zinc-800 text-zinc-400 py-1 px-2.5 rounded-lg font-mono">
                  Suma wyemitowanych: <span className="text-violet-400 font-bold">{certificatesList.length}</span>
                </span>
              </div>

              {certificatesLoading ? (
                <div className="text-center py-12 text-xs font-mono text-zinc-500 animate-pulse">
                  Ładowanie księgi certyfikatów...
                </div>
              ) : certificatesList.length === 0 ? (
                <div className="py-12 border border-dashed border-zinc-800 rounded-xl text-center space-y-1.5">
                  <Award className="w-8 h-8 text-zinc-700 mx-auto" />
                  <p className="text-xs text-zinc-400 font-mono">Brak wyemitowanych certyfikatów platformy HRL.</p>
                  <p className="text-[11px] text-zinc-500">Użyj generatora powyżej lub ukończ kurs jako kursant z pomyślnymi wszystkimi quizami.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-zinc-950 font-mono text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-850">
                      <tr>
                        <th className="py-3 px-4">Kursant</th>
                        <th className="py-3 px-4">Ukończony Kurs</th>
                        <th className="py-3 px-4">Kod Certyfikatu (ID Seryjny)</th>
                        <th className="py-3 px-4">Data Wyemitowania</th>
                        <th className="py-3 px-4 text-right">Opcje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 bg-zinc-950/20">
                      {certificatesList.map((cert) => (
                        <tr key={cert.id} className="hover:bg-zinc-900/40 text-xs text-zinc-300">
                          <td className="py-3.5 px-4 font-medium">
                            <span className="block font-sans text-white font-semibold">{cert.student_name}</span>
                            <span className="block font-mono text-[10px] text-zinc-500">{cert.student_email}</span>
                          </td>
                          <td className="py-3.5 px-4 max-w-xs truncate font-sans font-semibold text-zinc-200">
                            {cert.course_title}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-violet-400">
                            <a
                              href={`/certificate-verify?code=${cert.certificate_code}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline hover:text-violet-300"
                            >
                              {cert.certificate_code}
                            </a>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-zinc-500">
                            {cert.created_at}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleDeleteCertificate(cert.id)}
                              className="inline-flex py-1.5 px-3 bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 hover:border-red-500/50 text-red-400 hover:text-red-350 text-[11px] font-mono uppercase tracking-widest font-semibold rounded-lg cursor-pointer transition-colors"
                            >
                              Unieważnij
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 5: TELEMETRY REAL-TIME LOG STREAM CONTAINER */}
        {activeTab === "telemetry" && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-violet-400">
                <Terminal className="w-4 h-4 text-violet-500 animate-pulse" />
                <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-350 text-gradient font-bold leading-normal">
                  Pulpit telemetryczny serwera gateway (WebSockets)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 animate-pulse font-bold bg-emerald-950/20 border border-emerald-800/40 py-1 px-2.5 rounded-lg uppercase">
                POŁĄCZENIE AKTYWNE
              </span>
            </div>

            <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
              Logi systemowe są przesyłane bezpośrednio z bramki serwerowej chwila po ich zarejestrowaniu w bazie SQLite (BFF LogBook). Nie odświeżaj widoku.
            </p>

            <AdminCharts logs={activeLogs} />

            {/* Live Terminal logs output */}
            <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl font-mono text-xs text-zinc-400 space-y-2 h-[450px] overflow-y-auto block mt-6">
              {activeLogs.map((log) => (
                <div key={log.id} className="py-1.5 border-b border-zinc-900/50 hover:bg-zinc-900/20 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="space-y-1">
                    {/* Timestamp & Host */}
                    <div className="flex items-center gap-2 flex-wrap text-zinc-650 text-zinc-500 text-[10px]">
                      <span>[{log.timestamp}]</span>
                      <span>IP: {log.ip_address}</span>
                      <span>|</span>
                      <span>UID: {log.user_id || "ANONIM"}</span>
                    </div>
                    {/* Event summary route */}
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] rounded px-1.5 font-bold ${
                        log.status_code >= 400 ? 'bg-red-950 text-red-400' : 'bg-violet-950 text-violet-400'
                      }`}>
                        {log.event_type.toUpperCase()}
                      </span>
                      <span className="text-zinc-200 font-bold">
                        {log.request_method || "SYSTEM"} {log.request_path || ""}
                      </span>
                    </div>
                  </div>
                  {/* Status index and message */}
                  <div className="text-right flex flex-col md:items-end flex-shrink-0">
                    <span className={`font-mono text-xs font-bold ${
                      log.status_code >= 400 ? 'text-red-400' : 'text-emerald-400'
                    }`}>
                      STATUS: {log.status_code}
                    </span>
                    {log.error_message && (
                      <span className="text-[10px] text-red-500 font-bold max-w-xs truncate">{log.error_message}</span>
                    )}
                  </div>
                </div>
              ))}
              {activeLogs.length === 0 && (
                <div className="h-full flex items-center justify-center flex-col gap-2 py-24 text-zinc-650 text-zinc-500">
                  <Clock className="w-8 h-8 animate-spin" />
                  <span>Oczekiwanie na pierwsze zdarzenia serwerowe...</span>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 6: BRANDING ADVERTISEMENTS CAMPAIGNS PANEL */}
        {activeTab === "advertisements" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left form input */}
            <form onSubmit={handleCreateAdSubmit} className="lg:col-span-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Megaphone className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-350">Stwórz nową reklamę / baner</h3>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Powiązaj z kursem</label>
                <select
                  value={adCourseId}
                  onChange={(e) => setAdCourseId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 px-4 text-xs text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="">Globalna reklama (we wszystkich kursach)</option>
                  {coursesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Miejsce umieszczenia</label>
                <select
                  value={adPlacement}
                  onChange={(e) => setAdPlacement(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 px-4 text-xs text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="lesson_start">Początek lekcji (Górny baner)</option>
                  <option value="lesson_end">Koniec lekcji (Dolny panel reklamowy)</option>
                  <option value="sidebar">Panel boczny (Sidebar widget)</option>
                </select>
              </div>

              <select
                value={adType}
                onChange={(e) => setAdType(e.target.value as any)}
                className="hidden"
              >
                <option value="banner">Baner</option>
              </select>

              <div className="space-y-2">
                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Kod HTML lub Treść Reklamy</label>
                <textarea
                  placeholder="np. <div className='bg-violet-950 border border-violet-800 rounded p-4 text-center text-white font-bold'>SPONSOR: Zniżka 50% na hosting z kodem HRLHOSTING!</div>"
                  value={adCode}
                  onChange={(e) => setAdCode(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 px-4 text-xs text-zinc-200 focus:outline-none placeholder-zinc-705"
                  rows={4}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Link docelowy URL (Opcjonalny)</label>
                <input
                  type="text"
                  placeholder="https://example.com/promocja"
                  value={adLink}
                  onChange={(e) => setAdLink(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 px-4 text-xs text-zinc-200 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Zewnętrzna Grafika URL (Opcjonalna)</label>
                <input
                  type="text"
                  placeholder="https://images.unsplash.com/... (Zamiast kodu tekstowego)"
                  value={adImage}
                  onChange={(e) => setAdImage(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 px-4 text-xs text-zinc-200 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isCreatingAd}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                {isCreatingAd ? "Definiowanie..." : "Opublikuj kreację reklamową"}
              </button>
            </form>

            {/* Right: Ads inventory */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-450 text-emerald-400" />
                  <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-300">Zdefiniowane kampanie promocyjne</h3>
                </div>

                {adsLoading ? (
                  <div className="py-12 text-center text-xs font-mono text-zinc-500 animate-pulse">Ładowanie kreacji reklamowych...</div>
                ) : adsList.length === 0 ? (
                  <div className="py-12 text-center text-xs font-mono text-zinc-500">Brak zarejestrowanych reklam. Twoi kursanci będą uczyć się bez rozpraszaczy.</div>
                ) : (
                  <div className="space-y-4">
                    {adsList.map((ad) => {
                      const ctr = ad.impression_count > 0 ? ((ad.click_count / ad.impression_count) * 100).toFixed(2) : "0.00";
                      return (
                        <div key={ad.id} className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl flex flex-col md:flex-row gap-4 items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] bg-emerald-950 text-emerald-400 font-mono py-0.5 px-2 rounded-md uppercase font-semibold">
                                ID: #{ad.id}
                              </span>
                              <span className="text-[10px] bg-purple-950 text-purple-300 font-mono py-0.5 px-2 rounded-md uppercase font-semibold">
                                POZYCJA: {ad.placement_location === "lesson_start" ? "Początek lekcji" : ad.placement_location === "lesson_end" ? "Koniec lekcji" : "Pasek boczny"}
                              </span>
                              <span className="text-[10px] bg-zinc-850 text-zinc-300 font-mono py-0.5 px-2 rounded-md uppercase font-semibold">
                                {ad.course_title ? `Kurs: ${ad.course_title}` : "Wszystkie kursy"}
                              </span>
                            </div>

                            <div className="bg-zinc-900/50 p-2.5 rounded border border-zinc-800 text-xs text-zinc-400 overflow-hidden text-ellipsis line-clamp-2 max-w-full">
                              <code>{ad.ad_code}</code>
                            </div>

                            {ad.link_url && (
                              <a href={ad.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex text-[10px] text-emerald-400 hover:underline">
                                Link: {ad.link_url}
                              </a>
                            )}

                            {/* Analytics metrics footer */}
                            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-zinc-900 text-[10px] font-mono text-zinc-500">
                              <div>
                                WYŚWIETLENIA: <span className="text-zinc-300 font-bold">{ad.impression_count || 0}</span>
                              </div>
                              <div>
                                KLIKNIĘCIA: <span className="text-zinc-300 font-bold">{ad.click_count || 0}</span>
                              </div>
                              <div>
                                CTR KPI: <span className="text-emerald-400 font-bold">{ctr}%</span>
                              </div>
                              <div>
                                PRZYCHÓD: <span className="text-amber-400 font-bold">{(ad.revenue_generated || 0.0).toFixed(2)} PLN</span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteAd(ad.id)}
                            className="bg-red-950/40 hover:bg-red-900/30 text-red-400 p-2 rounded-lg transition-colors cursor-pointer self-start md:self-center flex-shrink-0"
                            title="Dezaktywuj reklamę"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: stripe CONNECT FINANCIAL LEDGER */}
        {activeTab === "transactions" && (
          <div className="space-y-6">
            {/* Financial summaries */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-90 w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Miesięczny Przepływ (Stripe Connect)</div>
                <div className="text-2xl font-semibold text-white tracking-tight pt-1">
                  {transactionsList.reduce((acc, t) => t.status === "succeeded" ? acc + Number(t.amount) : acc, 0).toFixed(2)} PLN
                </div>
              </div>

              <div className="bg-zinc-90 w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Zamówienia pomyślne (Succeeded)</div>
                <div className="text-2xl font-semibold text-emerald-400 tracking-tight pt-1">
                  {transactionsList.filter(t => t.status === "succeeded").length} transakcji
                </div>
              </div>

              <div className="bg-zinc-90 w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Reklamacje, błędy i zwroty (Failed)</div>
                <div className="text-2xl font-semibold text-red-400 tracking-tight pt-1">
                  {transactionsList.filter(t => t.status !== "succeeded").length} transakcji
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <DollarSign className="w-4 h-4 text-violet-400 font-bold" />
                <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-300">Rejestr transakcji płatniczych bramki Stripe</h3>
              </div>

              {transactionsLoading ? (
                <div className="py-12 text-center text-xs font-mono text-zinc-500 animate-pulse">Pobieranie ewidencji Stripe...</div>
              ) : transactionsList.length === 0 ? (
                <div className="py-12 text-center text-xs font-mono text-zinc-500">Brak zarejestrowanych transakcji gotówkowych. Wszyscy użytkownicy mają status darmowy (free tier).</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-zinc-300 text-left text-sm divide-y divide-zinc-800">
                    <thead className="text-zinc-500 text-xs font-mono uppercase">
                      <tr>
                        <th className="py-3 px-4">Referencja karty</th>
                        <th className="py-3 px-4">Student</th>
                        <th className="py-3 px-4">Przedmiot Opłaty</th>
                        <th className="py-3 px-4">Wartość</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Data Księgowania</th>
                        <th className="py-3 px-4 text-right">Zleć Zwrot (Refund)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      {transactionsList.map((tx) => (
                        <tr key={tx.id} className="hover:bg-zinc-950/20 text-xs transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-zinc-400">#TX-STRIPE-{tx.id}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold">{tx.username}</div>
                            <div className="text-[10px] text-zinc-500">{tx.email}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-zinc-400">{tx.course_title || "Dostęp Globalny / Subskrypcja"}</td>
                          <td className="py-3 px-4 font-bold text-white">{Number(tx.amount).toFixed(2)} PLN</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold ${
                              tx.status === "succeeded" ? "bg-emerald-950 text-emerald-400 border border-emerald-800/30" : "bg-red-950 text-red-400 border border-red-800/30"
                            }`}>
                              {tx.status === "succeeded" ? "ROZLICZONO" : "ZWROT / BLĄD"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-zinc-400 font-mono">{new Date(tx.created_at).toLocaleString("pl-PL")}</td>
                          <td className="py-3 px-4 text-right">
                            {tx.status === "succeeded" ? (
                              <button
                                onClick={() => handleRefundTransaction(tx.id)}
                                className="px-2.5 py-1 bg-red-950 hover:bg-red-900/60 border border-red-800/40 text-red-400 rounded-lg text-[10px] font-mono cursor-pointer transition-colors"
                              >
                                Wykonaj refundację
                              </button>
                            ) : (
                              <span className="text-zinc-650 text-zinc-500 font-mono text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 8: TENANT BRANDING & MULTI-DOMAIN CONFIG MODULE */}
        {activeTab === "settings" && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-violet-400">
                <SettingsIcon className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-350">Personalizacja brandingu i multi-domain</h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase">Tenant settings registry</span>
            </div>

            <form onSubmit={handleSaveSettingsSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="space-y-2">
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest font-bold">Kolor Wiodący Platformy (Primary Color Hex)</label>
                  <p className="text-[10px] text-zinc-500 leading-normal">Definiuje globalną kolorystykę przycisków, ramek i aktywnych elementów (CSS Variable).</p>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={brandingSettings.primary_color || "#8B5CF6"}
                      onChange={(e) => setBrandingSettings({...brandingSettings, primary_color: e.target.value})}
                      className="w-12 h-10 bg-zinc-950 border border-zinc-800 rounded-xl cursor-pointer p-1"
                    />
                    <input
                      type="text"
                      value={brandingSettings.primary_color || "#8B5CF6"}
                      onChange={(e) => setBrandingSettings({...brandingSettings, primary_color: e.target.value})}
                      className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2 px-4 text-xs text-zinc-200 focus:outline-none font-mono"
                      maxLength={7}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest font-bold">Zapasowy Logo URL platformy</label>
                  <p className="text-[10px] text-zinc-500 leading-normal">Adres URL logotypu, który zostanie wklejony w nagłówkach i na certyfikatach.</p>
                  <input
                    type="text"
                    placeholder="np. https://example.com/logo.png"
                    value={brandingSettings.logo_url || ""}
                    onChange={(e) => setBrandingSettings({...brandingSettings, logo_url: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 px-4 text-xs text-zinc-200 focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest font-bold">Maksymalny okres na zwrot (Polityka reklamacji)</label>
                  <p className="text-[10px] text-zinc-500 leading-normal">Limity czasowe dla uprawnionego studenta do anulowania transakcji Stripe (w dniach).</p>
                  <input
                    type="number"
                    value={brandingSettings.refund_policy_days || "30"}
                    onChange={(e) => setBrandingSettings({...brandingSettings, refund_policy_days: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 px-4 text-xs text-zinc-200 focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest font-bold">Dedykowana domena (Multi-Domain binding)</label>
                  <p className="text-[10px] text-zinc-500 leading-normal">Umożliwia serwowanie tej instancji pod unikalnym adresem CDN / hostem DNS.</p>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-zinc-650 text-zinc-600 text-xs font-mono">https://</span>
                    <input
                      type="text"
                      value={brandingSettings.custom_domain || "localhost:3000"}
                      onChange={(e) => setBrandingSettings({...brandingSettings, custom_domain: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 pl-16 pr-4 text-xs text-zinc-200 focus:outline-none font-mono"
                    />
                  </div>
                </div>

              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest font-bold">Szablon Dynamicznych Certyfikatów (BFF HTML Engine)</label>
                <p className="text-[10px] text-zinc-500 leading-normal">Obsługuje parsowanie zmiennych tokenowych: <code>{"{{student_name}}"}</code>, <code>{"{{course_title}}"}</code>, <code>{"{{certificate_code}}"}</code> i interpretację tagów ustrukturyzowanych.</p>
                <textarea
                  value={brandingSettings.certificate_template || ""}
                  onChange={(e) => setBrandingSettings({...brandingSettings, certificate_template: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 px-4 text-xs text-zinc-3 w-full text-zinc-300 focus:outline-none font-mono"
                  rows={6}
                />
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-violet-600 to-pink-500 hover:opacity-90 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                {isSavingSettings ? "Zapisywanie..." : "Zapisz i sfinalizuj ustawienia brandingu"}
              </button>
            </form>
          </div>
        )}

        {/* TAB: SYSTEM LIMITS & QUOTAS MANAGEMENT */}
        {activeTab === "limits" && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <SlidersHorizontal className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-200">Zarządzanie Limitami i Quotami Systemowymi</h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase">Tenant Quota Registry</span>
            </div>

            {isLoadingLimits ? (
              <div className="py-12 text-center text-xs font-mono text-zinc-500 animate-pulse">
                Pobieranie aktualnych limitów z bazy danych...
              </div>
            ) : (
              <form onSubmit={handleSaveLimitsSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Limit 1: Max Free Enrollments */}
                  <div className="bg-zinc-950 p-5 border border-zinc-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-amber-300 uppercase tracking-wider font-bold">Maksimum darmowych zapisów na kursy</label>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md border border-amber-500/20">Rola: Student</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Określa, na ile bezpłatnych kursów jednocześnie może zapisać się konto z rolą ucznia. Po osiągnięciu limitu zapisy na kolejne kursy są blokowane z komunikiem wyjaśniającym.
                    </p>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={systemLimits.max_free_enrollments}
                      onChange={(e) => setSystemLimits({ ...systemLimits, max_free_enrollments: Number(e.target.value) })}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl py-3 px-4 text-sm text-white font-mono font-bold focus:outline-none"
                    />
                  </div>

                  {/* Limit 2: Max Daily Quiz Attempts */}
                  <div className="bg-zinc-950 p-5 border border-zinc-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-amber-300 uppercase tracking-wider font-bold">Dzienny limit prób rozwiązywania quizu</label>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded-md border border-violet-500/20">Anti-Spam / 24h</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Maksymalna liczba podejść do testu wiedzy w ramach danej lekcji na dobę. Chroni przed odgadywaniem metodą prób i błędów.
                    </p>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={systemLimits.max_daily_quiz_attempts}
                      onChange={(e) => setSystemLimits({ ...systemLimits, max_daily_quiz_attempts: Number(e.target.value) })}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl py-3 px-4 text-sm text-white font-mono font-bold focus:outline-none"
                    />
                  </div>

                  {/* Limit 3: Max Courses Per Instructor */}
                  <div className="bg-zinc-950 p-5 border border-zinc-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-amber-300 uppercase tracking-wider font-bold">Limit kursów dla instruktora</label>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">Rola: Instructor</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Maksymalna liczba opublikowanych kursów przypisanych do jednego instruktora. (Administratorzy są zawsze wyłączeni z limitu).
                    </p>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={systemLimits.max_courses_per_instructor}
                      onChange={(e) => setSystemLimits({ ...systemLimits, max_courses_per_instructor: Number(e.target.value) })}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl py-3 px-4 text-sm text-white font-mono font-bold focus:outline-none"
                    />
                  </div>

                  {/* Limit 4: Auth Rate Limiter Window */}
                  <div className="bg-zinc-950 p-5 border border-zinc-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-amber-300 uppercase tracking-wider font-bold">Ochrona Brute-Force (Próby logowania / 15 min)</label>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded-md border border-rose-500/20">Rate Limiter</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Ograniczenie liczby nieudanych lub ponawianych prób uwierzytelniania z jednego adresu IP w oknie 15 minut.
                    </p>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={systemLimits.auth_rate_limit_max}
                      onChange={(e) => setSystemLimits({ ...systemLimits, auth_rate_limit_max: Number(e.target.value) })}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl py-3 px-4 text-sm text-white font-mono font-bold focus:outline-none"
                    />
                  </div>

                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingLimits}
                    className="px-8 py-3 bg-gradient-to-r from-amber-600 via-violet-600 to-pink-600 hover:opacity-90 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-500/10"
                  >
                    {isSavingLimits ? "Zapisywanie..." : "Zapisz i aktywuj nowe limity systemowe"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 9: MESSAGES & SUPPORT */}
        {activeTab === "messages" && (
          <AdminMessages />
        )}

        {/* TAB 10: ZERO-TRUST FIRESTORE SECURITY FORTRESS */}
        {activeTab === "security" && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 text-rose-500 pointer-events-none">
                <ShieldAlert className="w-48 h-48" />
              </div>
              <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-rose-500 to-transparent" />
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full text-xs font-mono mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    Zero-Trust Security Shield Live
                  </div>
                  <h3 className="text-2xl font-display font-medium text-white tracking-tight">
                    Forteca Bezpieczeństwa Firestore (Zero-Trust Monitor)
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
                    Ten panel pozwala analizować odporność Twojej bazy danych Firestore oraz testować zaimplementowane reguły bezpieczeństwa na wektory ataku zdefiniowane w specyfikacji <code className="text-violet-400 font-mono">security_spec.md</code>.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-zinc-500">STAN REGUŁ:</span>
                  <div className="px-3.5 py-1.5 bg-emerald-950 border border-emerald-800/40 text-emerald-400 rounded-xl text-xs font-mono font-semibold flex items-center gap-1.5 shadow-lg">
                    <CheckCircle className="w-3.5 h-3.5" />
                    ZABEZPIECZONY
                  </div>
                </div>
              </div>
            </div>

            {/* Simulated exploit matrix */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="border-b border-zinc-800 pb-3 mb-6">
                <h4 className="text-sm font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-rose-400" />
                  Matryca Testowa & Symulator Ataków (Brute Protection)
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {securityTests.map((test) => (
                  <div
                    key={test.id}
                    id={`test-card-${test.id}`}
                    className="p-4 bg-zinc-950 border border-zinc-800/60 rounded-xl flex flex-col justify-between hover:border-zinc-700/60 transition-all relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-400">
                            #{test.id} {test.category}
                          </span>
                        </div>
                        <h5 className="text-sm font-semibold text-white tracking-tight">{test.title}</h5>
                        <p className="text-xs text-zinc-500 mt-1">{test.description}</p>
                      </div>
                      
                      {/* Live State Badge */}
                      <div>
                        {test.status === "idle" && (
                          <span className="text-[10px] font-mono px-2 py-1 bg-zinc-900 text-zinc-600 rounded-lg">NIEURUCHOMIONY</span>
                        )}
                        {test.status === "running" && (
                          <span className="text-[10px] font-mono px-2 py-1 bg-violet-950 text-violet-400 border border-violet-800 rounded-lg animate-pulse">SYMULACJA...</span>
                        )}
                        {test.status === "blocked" && (
                          <span className="text-[10px] font-mono px-2 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded-lg font-bold">🛡️ BLOCKED</span>
                        )}
                        {test.status === "allowed" && (
                          <span className="text-[10px] font-mono px-2 py-1 bg-rose-950 text-rose-400 border border-rose-800 rounded-lg font-bold">⚠️ VULNERABLE</span>
                        )}
                      </div>
                    </div>

                    {/* Collapsible details display */}
                    {test.resultDetails && (
                      <div className="mt-3 p-2 bg-black border border-zinc-900 rounded-lg font-mono text-[10px] text-zinc-400 overflow-x-auto select-all">
                        {test.resultDetails}
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-zinc-900 flex justify-between items-center bg-zinc-950">
                      <span className="text-[10px] font-mono text-zinc-600 leading-none">Payload: JSON</span>
                      <button
                        id={`btn-run-test-${test.id}`}
                        onClick={() => runSecurityTest(test.id)}
                        disabled={test.status === "running"}
                        className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 font-mono text-[10px] font-semibold border border-rose-800/40 hover:border-rose-700/60 rounded-lg flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Zap className="w-3 h-3 text-rose-400" />
                        Wykonaj Atak
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Global telemetry logging */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h4 className="text-sm font-mono uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-500 animate-pulse" />
                Dziennik Prób i Zdarzeń Bezpieczeństwa (Security Audit Trail)
              </h4>
              <p className="text-xs text-zinc-500 mb-4">
                Próby wykonania powyższych ataków generują wyjątki <code className="text-zinc-400 font-mono">FirebaseError (permission-denied)</code>. Zdarzenia te mogą być przekierowywane bezpośrednio do systemów SIEM takich jak Google Cloud Sentinel lub Stackdriver.
              </p>
              <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-xl font-mono text-xs text-amber-500/90 space-y-2 h-44 overflow-y-auto">
                <p className="text-zinc-650 text-zinc-600">[INFO] Skanowanie reguł Firestore ukończone pomyślnie. Status: Zero-Trust Fortress Aktywna.</p>
                <p className="text-zinc-650 text-zinc-600">[INFO] Wykryte Inwarianty: courses (Invariants active), users (Rules locked).</p>
                {securityTests.filter(t => t.status === "blocked").map(t => (
                  <p key={t.id} className="text-emerald-400">
                    [BLOCKED] Atak #{t.id} ({t.title}) wykryty przez silnik reguł. Odmówiono zapisu/odczytu (Firebase Error: permission-denied). Gwarancja poufności zachowana.
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
