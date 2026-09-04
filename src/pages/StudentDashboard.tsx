import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import {
  Award,
  BookOpen,
  CheckCircle,
  FileCheck2,
  Calendar,
  Zap,
  Bookmark,
  ChevronRight,
  Printer,
  ExternalLink,
  Copy,
  Clock,
  LayoutDashboard,
  Sparkles,
  Trophy,
  History,
  X,
  Play,
  SlidersHorizontal
} from "lucide-react";
import { CourseCatalog } from "../components/CourseCatalog";
import { ActivityLog } from "../components/ActivityLog";

import { generateCertificatePDF } from "../utils/CertificateGenerator";

interface EnrolledCourse {
  id: number;
  title: string;
  description: string;
  thumbnail: string;
  category?: string;
  difficulty?: string;
  instructor_name?: string;
  lessons_count: number;
  modules_count: number;
  completed_lessons_count: number;
}

interface Certificate {
  id: number;
  user_id: number;
  course_id: number;
  certificate_code: string;
  created_at: string;
  course_title: string;
  course_thumbnail: string;
  qr_payload_url: string | null;
  is_public: boolean;
}

interface QuizAttempt {
  id: number;
  lesson_id: number;
  score_ratio: number;
  passed: number;
  attempt_time: string;
  lesson_title: string;
  course_title: string;
}

interface StudentDashboardData {
  enrolledCourses: EnrolledCourse[];
  certificates: Certificate[];
  quizAttempts: QuizAttempt[];
  externalCourses: any[];
  stats: {
    totalEnrolled: number;
    completedLessons: number;
    quizCount: number;
    avgScore: number;
    certCount: number;
  };
  timeline: {
    type: "enrollment" | "certificate" | "quiz";
    title: string;
    time: string;
  }[];
}

export const StudentDashboard: React.FC = () => {
  const { user, token, addToast, logs } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Tabs: overview, courses, certificates, quizzes, leaderboard
  const [activeTab, setActiveTab] = useState<"overview" | "courses" | "certificates" | "quizzes" | "leaderboard">("overview");

  // Certificate Modal State
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Lesson checklists state for expanding course contents
  const [expandedCourseId, setExpandedCourseId] = useState<number | null>(null);
  const [courseLessons, setCourseLessons] = useState<Record<number, any[]>>({});
  const [loadingLessons, setLoadingLessons] = useState<Record<number, boolean>>({});

  // Account Limits state
  const [limitsInfo, setLimitsInfo] = useState<any | null>(null);

  const fetchLimitsInfo = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/student/limits", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const limitsData = await res.json();
        setLimitsInfo(limitsData);
      }
    } catch (err) {
      console.error("Failed to fetch limits info", err);
    }
  };

  const fetchDashboardData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch("/api/student/dashboard", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const dashboardData = await res.json();
        setData(dashboardData);
      } else {
        throw new Error("Nie udało się pobrać danych panelu kursanta.");
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    fetchDashboardData();
    fetchLimitsInfo();
  }, [token]);

  // Real-time synchronization: Push updates to StudentDashboard via existing WS contextual activity logs
  useEffect(() => {
    const latestLog = logs[0];
    if (latestLog && latestLog.user_id === user?.id) {
      if (
        latestLog.event_type === "lesson_progress_update" ||
        latestLog.event_type === "quiz_submitted" ||
        latestLog.event_type === "certificate_generated"
      ) {
        fetchDashboardData();
      }
    }
  }, [logs, user?.id]);

  // Expand course and load its modular structure for direct completion checkmarking
  const toggleCourseDetails = async (courseId: number) => {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
      return;
    }

    setExpandedCourseId(courseId);

    if (courseLessons[courseId]) return;

    try {
      setLoadingLessons(prev => ({ ...prev, [courseId]: true }));
      const res = await fetch(`/api/courses/${courseId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const courseDetail = await res.json();
        // Flatten lessons list from modular structure
        const flattened: any[] = [];
        if (courseDetail.structure) {
          courseDetail.structure.forEach((mod: any) => {
            if (mod.lessons) {
              mod.lessons.forEach((les: any) => {
                flattened.push({
                  ...les,
                  moduleTitle: mod.title
                });
              });
            }
          });
        }
        setCourseLessons(prev => ({ ...prev, [courseId]: flattened }));
      }
    } catch (err) {
      console.error("Error loading course hierarchy", err);
    } finally {
      setLoadingLessons(prev => ({ ...prev, [courseId]: false }));
    }
  };

  // Student toggle state directly from the Dashboard checklist
  const handleToggleLessonCompletion = async (courseId: number, lessonId: number, currentCompleted: boolean) => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/progress`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          completed: !currentCompleted,
          percent: !currentCompleted ? 100 : 0
        })
      });

      if (res.ok) {
        addToast(
          !currentCompleted ? "Lekcja została oznaczona jako ukończona!" : "Wycofano ukończenie lekcji.",
          "success"
        );
        // Update local structure
        setCourseLessons(prev => {
          const list = prev[courseId] || [];
          return {
            ...prev,
            [courseId]: list.map(les => les.id === lessonId ? {
              ...les,
              progress: { ...les.progress, completed: !currentCompleted ? 1 : 0 }
            } : les)
          };
        });
        // Reload statistics and general percentage
        fetchDashboardData();
      } else {
        const errData = await res.json();
        throw new Error(errData.message || "Błąd zmiany stanu ukończenia.");
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  const handleCopyCode = (code: string) => {
    const fullUrl = `${window.location.origin}/certificate-verify?code=${code}`;
    navigator.clipboard.writeText(fullUrl);
    addToast("Skopiowano link weryfikacyjny certyfikatu do schowka!", "success");
  };

  const triggerCertificatePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <Clock className="w-8 h-8 text-violet-500 animate-spin" />
        <span className="text-sm font-mono text-zinc-400">Pobieranie danych Twojego panelu kursanta z HRL Core...</span>
      </div>
    );
  }

  const stats = data?.stats || {
    totalEnrolled: 0,
    completedLessons: 0,
    quizCount: 0,
    avgScore: 0,
    certCount: 0
  };

  const enrolledCourses = data?.enrolledCourses || [];
  const certificates = data?.certificates || [];
  const quizAttempts = data?.quizAttempts || [];
  const timeline = data?.timeline || [];

  return (
    <div id="student-dashboard-workspace" className="space-y-8 pb-16">
      
      {/* 1. Welcoming Hero Banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 border border-amber-500/20 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
        <div className="space-y-4 text-center md:text-left z-10 max-w-2xl">
          <div className="inline-flex py-1.5 px-3.5 bg-gradient-to-r from-amber-500/10 via-violet-500/10 to-pink-500/10 rounded-full text-xs font-mono text-amber-300 items-center gap-2 border border-amber-500/30 shadow-inner">
            <Trophy className="w-4 h-4 text-amber-400 animate-bounce" />
            <span className="font-semibold tracking-wide">HRL Academy Enterprise Dashboard Pro</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white tracking-tight leading-tight">
            Witaj ponownie, <span className="bg-gradient-to-r from-amber-300 via-violet-400 to-pink-400 bg-clip-text text-transparent font-extrabold">{user?.username}</span>!
          </h1>
          <p className="text-zinc-300 text-sm leading-relaxed">
            Twój osobisty panel suwerenności cyfrowej i certyfikowanej edukacji. Śledź postępy modułów, rozwiązuj testy kompetencyjne i pobieraj zweryfikowane dyplomy z kryptograficznym potwierdzeniem.
          </p>
        </div>

        <div className="flex items-center gap-4 z-10 flex-shrink-0">
          <div className="relative group p-1 bg-gradient-to-tr from-amber-500 via-violet-500 to-pink-500 rounded-3xl shadow-[0_0_25px_rgba(245,158,11,0.25)]">
            <img
              src="/logo_3d.jpg"
              alt="HRL 3D Logo"
              className="w-28 h-28 md:w-32 md:h-32 rounded-2xl object-cover border border-zinc-900"
            />
          </div>
        </div>

        {/* Ambient absolute background decorative layer */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* 2. Key Metrics Widgets Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Metric 1: Enrolled Courses */}
        <div className="p-4 bg-zinc-900/80 backdrop-blur border border-zinc-800 hover:border-violet-500/40 transition-all rounded-2xl flex items-center gap-4 shadow-lg group">
          <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 group-hover:scale-110 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-2xl font-bold text-white leading-none mb-1">{stats.totalEnrolled}</span>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block font-medium">Zapisane kursy</span>
          </div>
        </div>

        {/* Metric 2: Completed Lessons */}
        <div className="p-4 bg-zinc-900/80 backdrop-blur border border-zinc-800 hover:border-pink-500/40 transition-all rounded-2xl flex items-center gap-4 shadow-lg group">
          <div className="p-3 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20 group-hover:scale-110 transition-transform">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-2xl font-bold text-white leading-none mb-1">{stats.completedLessons}</span>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block font-medium">Lekcje zaliczone</span>
          </div>
        </div>

        {/* Metric 3: Quizzes count */}
        <div className="p-4 bg-zinc-900/80 backdrop-blur border border-zinc-800 hover:border-amber-500/40 transition-all rounded-2xl flex items-center gap-4 shadow-lg group">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-2xl font-bold text-white leading-none mb-1">{stats.quizCount}</span>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block font-medium">Rozwiązane testy</span>
          </div>
        </div>

        {/* Metric 4: Average Score */}
        <div className="p-4 bg-zinc-900/80 backdrop-blur border border-zinc-800 hover:border-emerald-500/40 transition-all rounded-2xl flex items-center gap-4 shadow-lg group">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-2xl font-bold text-white leading-none mb-1">{stats.avgScore}%</span>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block font-medium">Średni wynik</span>
          </div>
        </div>

        {/* Metric 5: Certified courses */}
        <div className="col-span-2 lg:col-span-1 p-4 bg-zinc-900/80 backdrop-blur border border-amber-500/30 hover:border-amber-400 transition-all rounded-2xl flex items-center gap-4 shadow-lg group">
          <div className="p-3 rounded-xl bg-gradient-to-tr from-amber-500 to-violet-600 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)] group-hover:scale-110 transition-transform">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-2xl font-extrabold text-amber-300 leading-none mb-1">{stats.certCount}</span>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block font-medium">Uzyskane dyplomy</span>
          </div>
        </div>
      </section>

      {/* 3. Sub-tabs Navigation */}
      <div className="flex border-b border-zinc-800 gap-2 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab("overview")}
          className={`py-3 px-5 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === "overview"
              ? "border-violet-500 text-white font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Przegląd ogólny
        </button>

        <button
          onClick={() => setActiveTab("courses")}
          className={`py-3 px-5 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === "courses"
              ? "border-violet-500 text-white font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Moje Kursy & Sygnalizatory ({enrolledCourses.length})
        </button>

        <button
          onClick={() => setActiveTab("certificates")}
          className={`py-3 px-5 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === "certificates"
              ? "border-violet-500 text-white font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Award className="w-4 h-4" />
          Uzyskane Dyplomy ({certificates.length})
        </button>

        <button
          onClick={() => setActiveTab("quizzes")}
          className={`py-3 px-5 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === "quizzes"
              ? "border-violet-500 text-white font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <History className="w-4 h-4" />
          Księga Quizów ({quizAttempts.length})
        </button>

        <button
          onClick={() => setActiveTab("leaderboard")}
          className={`py-3 px-5 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === "leaderboard"
              ? "border-violet-500 text-white font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Trophy className="w-4 h-4" />
          Leaderboard
        </button>
      </div>

      {/* 4. Active Portfolio Content */}
      <div id="student-active-view-container" className="pt-2">
        
        {/* --- OVERVIEW TAB --- */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Box: Active/Next Course Quick Launcher */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-mono uppercase tracking-wider text-white flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-violet-400" />
                    Ostatnio Aktywne Programy
                  </h3>
                  <button onClick={() => setActiveTab("courses")} className="text-xs text-violet-400 hover:text-violet-300 font-mono flex items-center gap-1 cursor-pointer">
                    Zobacz wszystko
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="divide-y divide-zinc-800/50 space-y-4">
                  {/* External Courses Section */}
                  {data?.externalCourses?.map((course: any) => (
                    <div key={course.id} className="p-4 bg-zinc-90 w-full bg-zinc-900/50 border border-zinc-800/80 rounded-xl space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-white flex items-center gap-2">
                            {course.title || "Zewnętrzny Kurs"}
                            {course.access_type === 'paid' && !course.progress && <span className="text-[10px] bg-amber-950 text-amber-400 px-1.5 py-0.5 rounded">LOCKED</span>}
                          </span>
                          <span className={`${course.progress ? 'text-emerald-400' : 'text-zinc-600'} font-mono`}>{course.progress || 0}%</span>
                        </div>
                        <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-850">
                          <div className={`h-full ${course.progress ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-zinc-800'} rounded-full`} style={{ width: `${course.progress || 0}%` }} />
                        </div>
                      </div>
                  ))}

                  {enrolledCourses.slice(0, 3).map((course) => {
                    const percent = course.lessons_count > 0 ? Math.round((course.completed_lessons_count / course.lessons_count) * 100) : 0;
                    return (
                      <div key={course.id} className="pt-4 first:pt-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <img
                            src={course.thumbnail}
                            alt={course.title}
                            className="w-16 h-12 object-cover rounded-xl border border-zinc-800 flex-shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-805/80 text-[8px] font-mono text-zinc-500 rounded uppercase block w-max mb-1">
                              {course.category || "Ogólny"}
                            </span>
                            <h4 className="text-sm font-bold text-white leading-tight">{course.title}</h4>
                            <span className="text-xs font-mono text-zinc-500 block mt-0.5">
                              Instruktor: <span className="text-zinc-300">{course.instructor_name || "HRL Team"}</span>
                            </span>
                          </div>
                        </div>

                        <div className="w-full sm:w-auto flex flex-col gap-2 flex-shrink-0 sm:text-right">
                          <div className="flex items-center sm:justify-end gap-3 text-xs">
                            <span className="font-mono text-zinc-400">Postęp: <strong className="text-violet-400 font-semibold">{percent}%</strong></span>
                            <span className="text-zinc-650 text-zinc-500">|</span>
                            <span className="font-mono text-zinc-500 text-[11px]">{course.completed_lessons_count}/{course.lessons_count} lekcji</span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="w-32 h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-850">
                              <div className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full" style={{ width: `${percent}%` }} />
                            </div>
                            <Link
                              to={`/course/${course.id}`}
                              className="px-4 py-1.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-750 text-xs font-mono font-medium rounded-lg text-white transition-all flex items-center gap-1 shadow-md cursor-pointer"
                            >
                              <Play className="w-3 h-3 text-pink-500 fill-pink-500" />
                              Otwórz
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {enrolledCourses.length === 0 && (
                    <div className="py-6">
                      <CourseCatalog />
                    </div>
                  )}
                </div>
              </div>

              {/* Verified certificates highlight card list */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-mono uppercase tracking-wider text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-pink-400" />
                  Najnowsze Osiągnięcia Akredytacyjne
                </h3>

                {certificates.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {certificates.slice(0, 2).map((crt) => (
                      <div key={crt.id} className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl relative overflow-hidden flex flex-col justify-between h-36">
                        <div>
                          <span className="text-[9px] font-mono text-pink-400 font-semibold uppercase block mb-1">KOD SERYJNY: {crt.certificate_code}</span>
                          <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">{crt.course_title}</h4>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-900/80">
                          <button
                            onClick={() => setSelectedCertificate(crt)}
                            className="text-[10px] font-mono font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            ZOBACZ CERT
                          </button>
                          <button
                            onClick={() => handleCopyCode(crt.certificate_code)}
                            className="p-1.5 bg-zinc-90 w-max bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
                            title="Skopiuj link weryfikacji"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Decorative background watermark */}
                        <Award className="absolute -right-6 -bottom-6 w-24 h-24 text-zinc-900/10" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 border border-dashed border-zinc-850 rounded-xl text-zinc-500 text-xs font-mono">
                    Brak dyplomów. Zaliczenie 100% lekcji oraz wszystkich testów w danym kursie wygeneruje tutaj dyplom automatycznie.
                  </div>
                )}
              </div>
            </div>

            {/* Right Box: Dynamic chronological timeline & Limits */}
            <div className="lg:col-span-4 space-y-6">

              {/* Status Limitów Konta */}
              {limitsInfo && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-mono uppercase tracking-wider text-white flex items-center justify-between border-b border-zinc-800/80 pb-3">
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                      Limity Konta i Quoty
                    </span>
                    <span className="text-[10px] bg-amber-500/10 text-amber-300 font-mono px-2 py-0.5 rounded border border-amber-500/20 uppercase font-semibold">
                      {limitsInfo.role}
                    </span>
                  </h3>

                  <div className="space-y-4">
                    {/* Limit Zapisów */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 font-mono text-[11px]">Darmowe zapisy na kursy:</span>
                        <span className="font-mono font-bold text-amber-300">
                          {limitsInfo.enrollments?.current} / {limitsInfo.enrollments?.max}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.round((limitsInfo.enrollments?.current / limitsInfo.enrollments?.max) * 100))}%`
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono flex justify-between">
                        <span>Pozostały wolny slot:</span>
                        <span className="text-zinc-300 font-bold">{limitsInfo.enrollments?.remaining} kursów</span>
                      </div>
                    </div>

                    {/* Limit Quizów */}
                    <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 font-mono text-[11px]">Dzienny limit rozwiązań quizu:</span>
                        <span className="font-mono font-bold text-violet-400">{limitsInfo.quiz_attempts?.max_per_day} próby / 24h</span>
                      </div>
                      <p className="text-[10px] text-zinc-500">Chroni przed losowym zaznaczaniem pytań.</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Osiagnięcia (Badges) Section */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-5">
                <h3 className="text-sm font-mono uppercase tracking-wider text-white flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  Moje Osiągnięcia (Badges)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-950 border border-zinc-850 p-3 rounded-xl flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden group">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 group-hover:scale-110 transition-transform">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">First Course</h4>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Odblokowane</span>
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-850 p-3 rounded-xl flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden group">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">7-Day Streak</h4>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Odblokowane</span>
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-850 p-3 rounded-xl flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden group">
                    <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Expert</h4>
                      <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">W trakcie...</span>
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-850 p-3 rounded-xl flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden group">
                    <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Course Master</h4>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Odblokowane</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* {user?.id && <ActivityLog userId={user.id.toString()} />} */}

              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-5">
                <h3 className="text-sm font-mono uppercase tracking-wider text-white flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                  <Clock className="w-4 h-4 text-violet-400" />
                  Historia Nauki (Dziennik)
                </h3>

                <div className="relative border-l border-zinc-800 pl-4 ml-2 space-y-6">
                  {timeline.map((act, index) => (
                    <div key={index} className="relative">
                      {/* Timeline circular dot indicator */}
                      <span className={`absolute -left-[24px] top-1.5 w-3.5 h-3.5 rounded-full border border-zinc-950 ${
                        act.type === 'certificate'
                          ? 'bg-gradient-to-r from-violet-500 to-pink-500'
                          : act.type === 'enrollment'
                          ? 'bg-violet-400'
                          : 'bg-zinc-700'
                      }`} />
                      
                      <div className="space-y-1">
                        <span className="block text-[10px] font-mono text-zinc-505 text-zinc-500">
                          {new Date(act.time).toLocaleDateString('pl-PL', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <p className="text-xs font-medium text-zinc-300 leading-normal">{act.title}</p>
                      </div>
                    </div>
                  ))}

                  {timeline.length === 0 && (
                    <div className="py-6 text-center text-xs font-mono text-zinc-650 text-zinc-500">
                      Brak udokumentowanych zdarzeń w dzienniku.
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* --- DETAILED COURSES TAB --- */}
        {activeTab === "courses" && (
          <div className="space-y-6">
            <h3 className="text-base font-semibold text-white font-display border-l-4 border-violet-500 pl-3">
              Katalog Twoich Zapisanych Kursów i Lekcji
            </h3>
            
            <div className="grid grid-cols-1 gap-4">
              {enrolledCourses.map((course) => {
                const percent = course.lessons_count > 0 ? Math.round((course.completed_lessons_count / course.lessons_count) * 100) : 0;
                const isExpanded = expandedCourseId === course.id;

                return (
                  <div key={course.id} className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden transition-all">
                    
                    {/* Header bar of course item */}
                    <div className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-zinc-900/60 border-b border-zinc-800/40">
                      <div className="flex items-center gap-4">
                        <img
                          src={course.thumbnail}
                          alt={course.title}
                          className="w-16 h-12 object-cover rounded-xl border border-zinc-800"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <div className="flex gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-805/80 text-[8px] font-mono text-zinc-400 rounded uppercase">
                              {course.category || "Ogólny"}
                            </span>
                            <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-805/80 text-[8px] font-mono text-violet-400 font-semibold rounded uppercase">
                              {course.difficulty || "Dowolny"}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-white mb-0.5">{course.title}</h4>
                          <span className="text-xs font-mono text-zinc-500">
                            Instruktor: <span className="text-zinc-200">{course.instructor_name || "HRL Team"}</span>
                          </span>
                        </div>
                      </div>

                      {/* Right metadata controls */}
                      <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex flex-col gap-1 items-start md:items-end">
                          <span className="text-xs text-zinc-400 font-mono">Ukończono <strong className="text-gradient font-bold">{percent}%</strong></span>
                          <div className="w-28 h-1 bg-zinc-950 rounded-full overflow-hidden border border-zinc-850">
                            <div className="h-full bg-gradient-to-r from-violet-500 to-pink-500" style={{ width: `${percent}%` }} />
                          </div>
                        </div>

                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => toggleCourseDetails(course.id)}
                            className="px-4 py-2 bg-zinc-95 w-max bg-zinc-950 hover:bg-zinc-800 border border-zinc-850 text-xs font-mono text-zinc-350 hover:text-white rounded-xl transition-all cursor-pointer flex items-center gap-1"
                          >
                            <span>{isExpanded ? "Ukryj checklistę" : "Lista lekcji"}</span>
                            <ChevronRight className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </button>
                          <Link
                            to={`/course/${course.id}`}
                            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-pink-500 text-white hover:opacity-90 font-mono text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1 font-bold"
                          >
                            Ucz się
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible lesson list view and toggle-complete checkers */}
                    {isExpanded && (
                      <div className="p-6 bg-zinc-950/40 border-t border-zinc-900/60 space-y-4">
                        <h5 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                          Spis Treści i Stan Licznika Ukończenia (Wielokrotny Wybór)
                        </h5>

                        {loadingLessons[course.id] ? (
                          <p className="text-xs font-mono text-zinc-500 animate-pulse text-center py-6">Pobieranie programu lekcji...</p>
                        ) : courseLessons[course.id]?.length === 0 ? (
                          <p className="text-xs font-mono text-zinc-500 text-center py-6">Ten kurs nie posiada jeszcze lekcji.</p>
                        ) : (
                          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                            {courseLessons[course.id]?.map((les) => {
                              const isCompleted = les.progress?.completed === 1;

                              return (
                                <div
                                  key={les.id}
                                  className="p-3 bg-zinc-95 w-full bg-zinc-950 hover:bg-zinc-900/60 border border-zinc-850 rounded-xl flex items-center justify-between gap-4 group transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    {/* Interactive checkbox for on-the-fly dashboard checks */}
                                    <button
                                      onClick={() => handleToggleLessonCompletion(course.id, les.id, isCompleted)}
                                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                                        isCompleted
                                          ? "bg-gradient-to-tr from-violet-600 to-pink-500 border-transparent text-white"
                                          : "border-zinc-800 hover:border-zinc-700 bg-zinc-90 text-zinc-900"
                                      }`}
                                    >
                                      {isCompleted && <CheckCircle className="w-3.5 h-3.5 stroke-[3]" />}
                                    </button>

                                    <div>
                                      <span className="text-[8px] font-mono text-zinc-505 text-zinc-500 block">Moduł: {les.moduleTitle}</span>
                                      <span className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">{les.title}</span>
                                      {les.access_level === 'free_preview' && (
                                        <span className="inline-block ml-2 px-1 text-[8px] font-mono bg-emerald-950/20 text-emerald-400 border border-emerald-900/20 rounded">FREE</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-4 text-xs font-mono flex-shrink-0 text-zinc-500">
                                    <span>{les.duration_minutes || 10} min</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}

              {enrolledCourses.length === 0 && (
                <div className="text-center py-12 bg-zinc-900/30 border border-zinc-80 w-full border-zinc-800 rounded-3xl space-y-4">
                  <BookOpen className="w-12 h-12 text-zinc-650 text-zinc-500 mx-auto" />
                  <p className="text-zinc-400 font-mono text-xs">Nie zapisałeś się na żaden program szkoleniowy.</p>
                  <Link to="/" className="px-5 py-2.5 inline-block bg-gradient-to-r from-violet-600 to-pink-500 text-white font-mono text-xs uppercase font-bold rounded-xl cursor-pointer">
                    Zobacz Dostępne Kursy Certyfikatów
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- CERTIFICATES TAB --- */}
        {activeTab === "certificates" && (
          <div className="space-y-6">
            <h3 className="text-base font-semibold text-white font-display border-l-4 border-violet-500 pl-3">
              Twoje Uzyskane Dyplomy Uczestnictwa
            </h3>

            {certificates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {certificates.map((crt) => (
                  <div key={crt.id} className="group bg-zinc-90 w-full bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between">
                    <div>
                      <div className="h-40 relative overflow-hidden bg-zinc-950">
                        <img
                          src={crt.course_thumbnail}
                          alt={crt.course_title}
                          className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
                        <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-950/80 border border-zinc-80 w-max rounded-full text-[9px] font-mono text-zinc-300">
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                          <span>ZALICZONY</span>
                        </div>
                      </div>

                      <div className="p-5 space-y-3">
                        <span className="text-[10px] font-mono text-zinc-500 block uppercase">
                          KOD WERYFIKACYJNY: <strong className="text-zinc-300 font-mono">{crt.certificate_code}</strong>
                        </span>
                        <h4 className="text-sm font-bold text-white line-clamp-2 leading-snug">{crt.course_title}</h4>
                        <span className="block text-[11px] font-mono text-zinc-500">
                          Wyemitowano: {new Date(crt.created_at).toLocaleDateString('pl-PL')}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 pt-0 border-t border-zinc-800/40">
                      <div className="flex gap-2 pt-3">
                        <button
                          onClick={() => setSelectedCertificate(crt)}
                          className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 rounded-xl text-xs font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 text-violet-400" />
                          Generuuj / Drukuj
                        </button>
                        <button
                          onClick={() => handleCopyCode(crt.certificate_code)}
                          className="px-3 bg-zinc-95 w-max bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer"
                          title="Skopiuj link potwierdzenia"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-zinc-900/30 border border-zinc-80 w-full border-zinc-800 rounded-3xl space-y-4">
                <Award className="w-12 h-12 text-zinc-650 text-zinc-500 mx-auto" />
                <p className="text-zinc-400 font-mono text-xs">Nie wydałeś jeszcze żadnego certyfikatu.</p>
                <p className="text-zinc-500 text-xs max-w-xs mx-auto leading-normal">
                  Aby odblokować dyplom, ukończ wszystkie lekcje w wybranym kursie (100% postępu) oraz zrób wszystkie testy na minimum 1 prawidłową odpowiedź.
                </p>
              </div>
            )}
          </div>
        )}

        {/* --- QUIZZES TAB --- */}
        {activeTab === "quizzes" && (
          <div className="space-y-6">
            <h3 className="text-base font-semibold text-white font-display border-l-4 border-violet-500 pl-3">
              Rejestr Sprawdzianów i Podejść Egzaminacyjnych
            </h3>

            {quizAttempts.length > 0 ? (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-zinc-300 text-left text-sm divide-y divide-zinc-800">
                    <thead className="text-zinc-500 text-xs font-mono uppercase bg-zinc-950/20">
                      <tr>
                        <th className="py-3 px-4">Kurs i Lekcja</th>
                        <th className="py-3 px-4 text-center">Czas wykonania</th>
                        <th className="py-3 px-4 text-center">Twój Wynik</th>
                        <th className="py-3 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {quizAttempts.map((item) => (
                        <tr key={item.id} className="hover:bg-zinc-950/20 text-xs">
                          <td className="py-4 px-4">
                            <span className="block text-[10px] text-zinc-500 font-mono truncate max-w-xs">{item.course_title}</span>
                            <span className="font-bold text-white block mt-0.5">{item.lesson_title}</span>
                          </td>
                          <td className="py-4 px-4 text-center text-zinc-400 font-mono">
                            {new Date(item.attempt_time).toLocaleString('pl-PL')}
                          </td>
                          <td className="py-4 px-4 text-center font-mono font-bold text-sm">
                            <span className={item.passed ? "text-emerald-400" : "text-rose-400"}>
                              {Math.round(item.score_ratio * 100)}%
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <span className={`inline-block px-2.5 py-1 rounded text-[10px] font-mono font-bold ${
                              item.passed
                                ? "bg-emerald-950/40 border border-emerald-550 border-emerald-500/30 text-emerald-400"
                                : "bg-red-950/40 border border-red-500/30 text-red-400"
                            }`}>
                              {item.passed ? "ZALICZONY" : "POPRAWKA"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 bg-zinc-900/30 border border-zinc-80 w-full border-zinc-800 rounded-3xl space-y-4">
                <FileCheck2 className="w-12 h-12 text-zinc-650 text-zinc-500 mx-auto" />
                <p className="text-zinc-400 font-mono text-xs">Nie podszedłeś jeszcze do żadnego quizu.</p>
                <p className="text-zinc-500 text-xs max-w-xs mx-auto leading-normal">
                  Ruszaj do lekcji oznaczonych darmowym podglądem lub zasobów premium i wypróbuj interaktywne pytania na dole lekcji!
                </p>
              </div>
            )}
          </div>
        )}

        {/* --- LEADERBOARD TAB --- */}
        {activeTab === "leaderboard" && (
          <div className="space-y-6">
            <h3 className="text-base font-semibold text-white font-display border-l-4 border-violet-500 pl-3">
              Ogólnoświatowa Tablica Wyników
            </h3>

            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden p-8 text-center text-zinc-500 font-mono text-sm">
              <Trophy className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p>System rankingowy jest w trakcie wdrażania...</p>
              <p className="text-xs">Śledź swoje postępy, aby awansować w przyszłej tabeli wyników!</p>
            </div>
           </div>
        )}

      </div>

      {/* --- FLOATING PRINTABLE CERTIFICATE TEMPLATE OVERLAY (REAL PDF GENERATOR DISPATCH) --- */}
      {selectedCertificate && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md overflow-y-auto flex items-center justify-center p-4">
          
          {/* Certificate Wrapper */}
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-4xl rounded-2xl p-6 md:p-12 space-y-8 relative overflow-hidden print:border-none print:p-0">
            
            {/* Control panel buttons for inside modal */}
            <div className="flex justify-between items-center pb-4 border-b border-zinc-850 print:hidden">
              <span className="text-xs font-mono text-zinc-400">Podgląd Akredytacji HRL Academy Certyfikat</span>
              <div className="flex gap-2">
                <button
                  disabled={isGeneratingPDF}
                  onClick={async () => {
                    setIsGeneratingPDF(true);
                    await generateCertificatePDF("print-area", `Certyfikat_${selectedCertificate.certificate_code}.pdf`);
                    setIsGeneratingPDF(false);
                  }}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {isGeneratingPDF ? "Generowanie..." : "Pobierz Dyplom PDF"}
                </button>
                <button
                  onClick={() => setSelectedCertificate(null)}
                  className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* HIGH FIDELITY PRINT DESIGN (A4 landscape proportions approx) */}
            <div id="print-area" className="border-8 double border-amber-500/20 p-8 md:p-12 bg-zinc-950 text-center space-y-8 relative print:border-amber-500 print:text-black">
              
              {/* Gold corners */}
              <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-amber-500/40 pointer-events-none" />
              <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-amber-500/40 pointer-events-none" />
              <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-amber-500/40 pointer-events-none" />
              <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-amber-500/40 pointer-events-none" />

              {/* Watermark crest behind text */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                <Award className="w-96 h-96 text-amber-500" />
              </div>

              {/* Header / Crest */}
              <div className="space-y-2 z-10 relative">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-550/40 border-amber-500/30 flex items-center justify-center mx-auto text-amber-500 mb-2">
                  <Award className="w-6 h-6" />
                </div>
                <h2 className="text-xs font-mono tracking-[0.3em] text-amber-500 uppercase">OFFICIAL CERTIFICATE OF COMPLETION</h2>
                <h3 className="text-3xl font-serif tracking-tight text-white leading-normal print:text-black">DYPLOM ACCREDYTACYJNY</h3>
              </div>

              {/* Body statement */}
              <div className="space-y-4 max-w-2xl mx-auto z-10 relative">
                <p className="text-xs font-mono text-zinc-400 uppercase tracking-widest print:text-zinc-650">Niniejszym zaświadcza się, że uczestnik</p>
                <p className="text-3xl font-display font-semibold text-white tracking-tight border-b border-zinc-85 w-full border-zinc-800 pb-2 max-w-md mx-auto print:text-black print:border-zinc-300">
                  {user?.username}
                </p>
                <p className="text-xs text-zinc-505 text-zinc-500 leading-normal max-w-md mx-auto font-mono">
                  ukończył z wynikiem pozytywnym pełny cykl edukacyjny, zaliczył wymagane laboratoria kodowania oraz testy rygorystyczne w specjalizacji:
                </p>
                <p className="text-2xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200 py-1.5 leading-snug print:text-zinc-900 print:bg-none">
                  {selectedCertificate.course_title}
                </p>
              </div>

              {/* Verify & Footer signs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 z-10 relative text-left">
                
                {/* Board / Academy Seal */}
                <div className="flex flex-col items-center justify-end text-center space-y-1">
                  <div className="w-14 h-14 rounded-full border border-amber-500/40 flex items-center justify-center text-amber-500/80 mb-1">
                    <span className="text-[10px] font-mono font-bold">HRL SEAL</span>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Pieczęć Instytutu</span>
                </div>

                {/* Validation Serial QR block */}
                <div className="flex flex-col items-center justify-end text-center space-y-1">
                  <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-widest mb-1">
                    B2B Verification
                  </span>
                  {selectedCertificate.qr_payload_url && (
                    <img
                      src={selectedCertificate.qr_payload_url}
                      alt="Kod QR weryfikacji certyfikatu"
                      className="w-16 h-16 bg-white rounded p-0.5 mb-1"
                    />
                  )}
                  <span className="text-[9px] font-mono text-zinc-400 block break-all leading-relaxed uppercase">
                    ID: <strong className="text-white block print:text-black font-bold tracking-widest">{selectedCertificate.certificate_code}</strong>
                  </span>
                  <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest select-all">
                    /verify/{selectedCertificate.certificate_code}
                  </span>
                </div>

                {/* Director Signature block */}
                <div className="flex flex-col items-center justify-end text-center space-y-1">
                  <span className="font-serif italic text-base text-zinc-100 block print:text-black border-b border-zinc-80 w-full border-zinc-800 pb-1 max-w-[120px]">
                    HRL Board
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Dyrekcja Programu</span>
                </div>

              </div>

              {/* Timestamp of issue */}
              <div className="pt-4 text-[9px] font-mono text-zinc-650 text-zinc-500 leading-none">
                Data emisji: {new Date(selectedCertificate.created_at).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
