import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StudentEnterpriseTools } from "../components/StudentEnterpriseTools";
import {
  BookOpen,
  Lock,
  Play,
  CheckCircle,
  Eye,
  Award,
  Video,
  Menu,
  ChevronRight,
  ClipboardCheck,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  Megaphone,
  Maximize2,
  Minimize2,
  Sliders,
  Settings,
  Link2
} from "lucide-react";

interface LessonProgress {
  percent: number;
  completed: number;
}

interface DetailLesson {
  id: number;
  title: string;
  description: string;
  content: string;
  access_level: "free_preview" | "premium";
  video_url: string;
  duration_minutes: number;
  has_access: boolean;
  progress: LessonProgress;
}

interface DetailModule {
  id: number;
  title: string;
  lessons: DetailLesson[];
}

interface CourseDetailData {
  course: {
    id: number;
    title: string;
    description: string;
    thumbnail: string;
    category?: string;
    difficulty?: string;
    instructor_name?: string;
    pricing_model?: "free" | "one_time" | "subscription";
    one_time_price?: number;
    subscription_price?: number;
    subscription_interval?: "month" | "year";
  };
  enrolled: boolean;
  structure: DetailModule[];
  certificate_code: string | null;
}

export const CourseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, token, addToast } = useApp();
  
  const [data, setData] = useState<CourseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<DetailLesson | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [playerHeight, setPlayerHeight] = useState<number>(768);
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = () => {
    const courseUrl = `${window.location.origin}/course/${id}`;
    navigator.clipboard.writeText(courseUrl).then(() => {
      setCopiedLink(true);
      if (addToast) {
        addToast("Skopiowano link do kursu w platformie!", "success");
      }
      setTimeout(() => setCopiedLink(false), 2500);
    }).catch((err) => {
      console.error("Failed to copy link:", err);
    });
  };

  // Active view tab: overview of the course description/syllabus vs. live lesson player
  const [activeViewTab, setActiveViewTab] = useState<"overview" | "lessons">("overview");

  // Keep tab aligned with enrollment status on load
  useEffect(() => {
    if (data) {
      if (data.enrolled) {
        setActiveViewTab("lessons");
      } else {
        setActiveViewTab("overview");
      }
    }
  }, [data?.enrolled]);

  // Active advertisements view state
  const [activeAds, setActiveAds] = useState<any[]>([]);

  // Stripe checkout credentials fields
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // Custom video playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  
  // Quiz panel states
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [quizResult, setQuizResult] = useState<{
    submitted: boolean;
    score_percent: number;
    passed: boolean;
    correct_count: number;
    total_count: number;
  } | null>(null);

  const fetchCourseDetails = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/courses/${id}`, { headers });
      const details = await res.ok ? await res.json() : null;
      if (details) {
        setData(details);
        
        // Auto-select first lesson if none selected
        if (!activeLesson && details.structure && details.structure.length > 0) {
          const firstModule = details.structure[0];
          if (firstModule.lessons && firstModule.lessons.length > 0) {
            setActiveLesson(firstModule.lessons[0]);
          }
        } else if (activeLesson) {
          // Sync state
          let found: DetailLesson | null = null;
          details.structure.forEach((mod: any) => {
            mod.lessons.forEach((les: any) => {
              if (les.id === activeLesson.id) {
                found = les;
              }
            });
          });
          if (found) {
            setActiveLesson(found);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load course details", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuizQuestions = async (lessonId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/lessons/${lessonId}/quiz`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const questions = await res.json();
        setQuizQuestions(questions);
        setSelectedAnswers({});
        setQuizResult(null);
      }
    } catch (err) {
      console.error("Error fetching quiz questions", err);
    }
  };

  const fetchActiveAds = async () => {
    try {
      const res = await fetch(`/api/ads/active?placement=lesson_start${id ? `&course_id=${id}` : ""}`);
      if (res.ok) {
        setActiveAds(await res.json());
      }
    } catch (err) {
      console.error("Failed to load active ads", err);
    }
  };

  const handleAdClick = async (adId: number, linkUrl: string | null) => {
    try {
      await fetch(`/api/ads/${adId}/click`, { method: "POST" });
    } catch (err) {
      console.error(err);
    }
    if (linkUrl) {
      window.open(linkUrl, "_blank");
    }
  };

  const handleStripeCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      addToast("Zaloguj się, aby sfinalizować transakcję.", "warning");
      return;
    }
    if (!cardNumber || !cardExpiry || !cardCvc) {
      addToast("Uzupełnij wszystkie dane karty płatniczej Stripe Connect.", "warning");
      return;
    }

    try {
      setIsProcessingPayment(true);
      const paymentAmount = data?.course?.pricing_model === "subscription" 
        ? data?.course?.subscription_price 
        : data?.course?.one_time_price;
      const paymentType = data?.course?.pricing_model === "subscription" ? "subscription" : "charge";

      const res = await fetch(`/api/courses/${id}/checkout`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cardNumber,
          cardExpiry,
          cardCvc,
          amount: paymentAmount || 49,
          type: paymentType
        })
      });

      const resJson = await res.json();
      if (res.ok) {
        addToast(resJson.message, "success");
        setCardNumber("");
        setCardExpiry("");
        setCardCvc("");
        fetchCourseDetails();
      } else {
        throw new Error(resJson.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  useEffect(() => {
    fetchCourseDetails();
    fetchActiveAds();
  }, [id, token]);

  useEffect(() => {
    if (activeLesson) {
      setVideoProgress(activeLesson.progress ? activeLesson.progress.percent : 0);
      setIsPlaying(false);
      // Fetch quiz questions
      fetchQuizQuestions(activeLesson.id);
    }
  }, [activeLesson?.id]);

  // Video progress tracker timer hook
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && videoProgress < 100) {
      interval = setInterval(() => {
        setVideoProgress((prev) => {
          const next = prev + 5;
          if (next >= 100) {
            setIsPlaying(false);
            handleMarkCompleted(activeLesson!.id, true);
            return 100;
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, videoProgress]);

  const handleEnroll = async () => {
    if (!user) {
      addToast("Zaloguj się, aby zapisać się na kurs", "warning");
      return;
    }

    try {
      const res = await fetch(`/api/courses/${id}/enroll`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const resData = await res.json();
      if (res.ok) {
        addToast(resData.message, "success");
        fetchCourseDetails();
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  const handleMarkCompleted = async (lessonId: number, autoCompleted = false) => {
    if (!user || !token) {
      addToast("Zaloguj się, aby zapisać postęp", "warning");
      return;
    }

    try {
      const res = await fetch(`/api/lessons/${lessonId}/progress`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          percent: 100,
          completed: 1,
          last_watched_timestamp: 0
        })
      });

      const resData = await res.json();
      if (res.ok) {
        addToast(
          autoCompleted ? "Obejrzano całą lekcję! Postęp zaktualizowany." : "Lekcja oznaczona jako ukończona",
          "success"
        );
        fetchCourseDetails();
      } else {
        throw new Error(resData.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  const handleQuizAnswer = (questionId: number, answer: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleQuizSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLesson) return;

    if (Object.keys(selectedAnswers).length < quizQuestions.length) {
      addToast("Odpowiedz na wszystkie pytania przed wysłaniem", "warning");
      return;
    }

    const payload = Object.keys(selectedAnswers).map((qId) => ({
      questionId: Number(qId),
      answer: selectedAnswers[Number(qId)]
    }));

    try {
      const res = await fetch(`/api/quiz/${activeLesson.id}/submit`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ answers: payload })
      });

      const resultData = await res.json();
      if (res.ok) {
        setQuizResult({
          submitted: true,
          score_percent: resultData.score_percent,
          passed: resultData.passed,
          correct_count: resultData.correct_count,
          total_count: resultData.total_count
        });

        if (resultData.passed) {
          addToast(`Gratulacje! Zdałeś test z wynikiem ${resultData.score_percent}%`, "success");
          fetchCourseDetails();
        } else {
          addToast(`Niestety nie zaliczyłeś testu. Wynik: ${resultData.score_percent}% (wymagane 70%)`, "error");
        }
      }
    } catch (err: any) {
      addToast("Błąd wysyłania testu: " + err.message, "error");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-zinc-400 mt-4 text-sm font-mono">Ładowanie struktury portalu nauki...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto my-16 py-16 px-8 text-center bg-zinc-900 border border-zinc-800 rounded-3xl space-y-6 shadow-2xl">
        <BookOpen className="w-16 h-16 text-violet-500 mx-auto" />
        <h2 className="text-2xl font-display font-semibold text-white">Wymagane logowanie</h2>
        <p className="text-zinc-400">
          Podgląd oraz odtwarzanie materiałów tego kursu jest możliwe wyłącznie dla zalogowanych autoryzowanych kont. Załóż darmowe konto, aby kontynuować.
        </p>
        <div className="flex justify-center flex-wrap gap-4 pt-4">
          <Link to="/login" className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono tracking-wide uppercase rounded-xl transition-all cursor-pointer">
            Zaloguj się
          </Link>
          <Link to="/register" className="px-6 py-3 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white text-xs font-mono tracking-wide uppercase rounded-xl transition-all shadow-lg cursor-pointer">
            Załóż Darmowe Konto
          </Link>
        </div>
      </div>
    );
  }

  if (data && data.course) {
    const tc = data.course as any;
    if (tc.tenant_domain && tc.tenant_domain !== "all_domains" && tc.tenant_domain !== "") {
      const url = tc.tenant_domain.startsWith("http") ? tc.tenant_domain : `https://${tc.tenant_domain}`;
      
      return (
        <div className={`space-y-6 pb-12 w-full mx-auto px-4 ${isTheaterMode ? 'max-w-none' : 'max-w-[1440px]'}`}>
          {/* Header Dashboard Bar with Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            {/* Ambient indicator lights */}
            <div className="absolute top-0 left-0 w-1/2 h-[2px] bg-gradient-to-r from-violet-600/30 via-pink-500/30 to-transparent" />
            
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                  Ujednolicony Odtwarzacz Partnerski HRL • Adres Ukryty
                </span>
              </div>
              <h2 className="text-xl font-display font-medium text-white tracking-tight">
                {tc.title}
              </h2>
              <p className="text-xs text-zinc-400">
                Prywatna sesja edukacyjna z maskowaniem źródłowego adresu URL w standardzie HRL Academy.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/"
                className="px-4 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-xl text-xs font-mono font-medium tracking-wide uppercase transition-all flex items-center gap-1.5 cursor-pointer"
              >
                ← Katalog
              </Link>
              <button
                onClick={() => setIframeKey(k => k + 1)}
                className="px-4 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-xl text-xs font-mono font-medium tracking-wide uppercase transition-all flex items-center gap-1.5 cursor-pointer"
                title="Odśwież sesję"
              >
                <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
                <span>Odśwież</span>
              </button>
              <button
                onClick={handleCopyLink}
                className="px-4 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-xl text-xs font-mono font-medium tracking-wide uppercase transition-all flex items-center gap-1.5 cursor-pointer min-w-[130px] justify-center"
                title="Skopiuj bezpośredni odnośnik do tej podstrony kursowej"
              >
                {copiedLink ? (
                  <>
                    <ClipboardCheck className="w-3.5 h-3.5 text-emerald-450 text-emerald-400" />
                    <span className="text-emerald-450 text-emerald-400 font-bold">Skopiowano!</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5 text-pink-400" />
                    <span>Kopiuj Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ADVANCED VIEWPORT RESIZER & CONFIGURATOR PANEL */}
          <div className="bg-zinc-900 border border-zinc-850 bg-gradient-to-b from-zinc-900 to-zinc-950/40 p-5 rounded-2xl space-y-4 shadow-lg border-zinc-800">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-zinc-250">
                  <Settings className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-mono uppercase tracking-widest text-zinc-350 font-bold">
                    Konfigurator Oryginalnych Wymiarów Kursu
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Zastosuj natywne proporcje oryginalnego panelu kursowego by wyeliminować wewnętrzne paski przewijania i zachować oryginalną makietę.
                </p>
              </div>

              {/* Precise Dimension Indicator Badge */}
              <div className="inline-flex items-center gap-2 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-mono shrink-0">
                <span className="text-zinc-550 text-zinc-450">AKTYWNY ROZMIAR:</span>
                <span className="text-violet-450 text-violet-400 font-bold">100%</span>
                <span className="text-zinc-500">x</span>
                <span className="text-pink-400 font-bold">{playerHeight}px</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2 border-t border-zinc-850 border-zinc-800/60">
              
              {/* Presets Column */}
              <div className="space-y-2">
                <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Szybkie Presety Wysokości</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setPlayerHeight(620)}
                    className={`px-3 py-2 text-[10.5px] font-mono rounded-lg border text-center transition-all ${
                      playerHeight === 620
                        ? "bg-violet-600/10 border-violet-550 text-violet-405 font-bold text-violet-400 border-violet-500"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Kompakt (620px)
                  </button>
                  <button
                    onClick={() => setPlayerHeight(768)}
                    className={`px-3 py-2 text-[10.5px] font-mono rounded-lg border text-center transition-all ${
                      playerHeight === 768
                        ? "bg-violet-600/10 border-violet-550 text-violet-405 font-bold text-violet-400 border-violet-500"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Laptop (768px)
                  </button>
                  <button
                    onClick={() => setPlayerHeight(950)}
                    className={`px-3 py-2 text-[10.5px] font-mono rounded-lg border text-center transition-all ${
                      playerHeight === 950
                        ? "bg-violet-600/10 border-violet-550 text-violet-405 font-bold text-violet-400 border-violet-500"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Full HD (950px)
                  </button>
                  <button
                    onClick={() => setPlayerHeight(1200)}
                    className={`px-3 py-2 text-[10.5px] font-mono rounded-lg border text-center transition-all ${
                      playerHeight === 1200
                        ? "bg-violet-600/10 border-violet-550 text-violet-405 font-bold text-violet-400 border-violet-500"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Maxi (1200px)
                  </button>
                </div>
              </div>

              {/* Slider Adjustment Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Precyzyjne strojenie wysokości</span>
                  <span className="text-xs font-mono text-zinc-400 font-bold">{playerHeight}px</span>
                </div>
                <div className="space-y-3 pt-1">
                  <input
                    type="range"
                    min="450"
                    max="1400"
                    step="20"
                    value={playerHeight}
                    onChange={(e) => setPlayerHeight(Number(e.target.value))}
                    className="w-full accent-violet-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-zinc-600">
                    <span>Min (450px)</span>
                    <span>Max (1400px)</span>
                  </div>
                </div>
              </div>

              {/* Width / Theater mode controller Column */}
              <div className="space-y-2">
                <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Tryb szerokości makiety</span>
                <div className="space-y-2.5">
                  <button
                    onClick={() => setIsTheaterMode(!isTheaterMode)}
                    className={`w-full px-4 py-2.5 rounded-lg border font-mono text-xs uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${
                      isTheaterMode
                        ? "bg-gradient-to-r from-violet-600/20 to-pink-500/20 border-violet-500 text-white font-bold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {isTheaterMode ? (
                      <>
                        <Minimize2 className="w-4 h-4 text-pink-400" />
                        <span>Szerokość: Pełny Ekran (Włączona)</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-4 h-4 text-violet-400" />
                        <span>Szerokość: Standardowa (Tryb Kinowy)</span>
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    {isTheaterMode 
                      ? "Makieta zmaksymalizowana do krawędzi okna przeglądarki. Pełna szerokość robocza." 
                      : "Standardowa zwężona makieta odtwarzacza z marginesami bocznymi."}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* MAIN EMBEDDED PLAYER CONTAINER (Address fully masked!) */}
          <div className="space-y-3">
            {/* Iframe Loading/Player panel */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-2 shadow-2xl overflow-hidden relative">
              {/* Embedded Website Frame wrapper */}
              <iframe
                key={iframeKey}
                src={url}
                style={{ height: `${playerHeight}px` }}
                className="w-full rounded-xl border-0 bg-zinc-950 block transition-all duration-300"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                title={tc.title}
              />
            </div>

            {/* Secure navigation status footer */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl py-2.5 px-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-[10px] font-mono text-zinc-500">
              <span className="flex items-center gap-1.5 uppercase select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                Szyfrowanie sesji: TLS 1.3 Enterprise Masked Environment
              </span>
              <span>
                Środowisko zweryfikowane • Autoryzowany operator platformy
              </span>
            </div>
          </div>
        </div>
      );
    }
  }

  if (!data) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <HelpCircle className="w-12 h-12 text-zinc-500 mx-auto" />
        <h2 className="text-xl text-white font-medium">Brak danych kursu</h2>
        <Link to="/" className="text-violet-400 font-medium">Powrót do katalogu</Link>
      </div>
    );
  }

  const { course, enrolled, structure, certificate_code } = data;

  // Calculate live completion percentage
  const totalLessons = structure ? structure.reduce((acc, mod) => acc + (mod.lessons?.length || 0), 0) : 0;
  const completedLessons = structure ? structure.reduce((acc, mod) => 
    acc + (mod.lessons?.filter(les => les.progress?.completed === 1).length || 0), 0
  ) : 0;
  const completionPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return (
    <div id="course-details-workspace" className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-6">
      
      {/* LEFT COLUMN: Sidebar style Course List (col-span-4) */}
      <aside className="lg:col-span-4 space-y-6">
        {/* Course Card Summary */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 relative overflow-hidden">
          <h2 className="text-lg font-display font-medium text-white line-clamp-2">{course.title}</h2>
          <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">{course.description}</p>
          
          <div className="grid grid-cols-2 gap-2.5 pt-3 pb-3 border-t border-b border-zinc-800/60 text-xs">
            <div>
              <span className="text-[10px] text-zinc-500 font-mono block uppercase">Kategoria</span>
              <span className="text-zinc-300 font-medium">{course.category || "Ogólny"}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 font-mono block uppercase">Poziom</span>
              <span className="text-violet-400 font-medium font-semibold">{course.difficulty || "Dowolny"}</span>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] text-zinc-500 font-mono block uppercase">Instruktor</span>
              <span className="text-zinc-300 font-medium">{course.instructor_name || "HRL Team"}</span>
            </div>
          </div>

          {enrolled && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
                <span>Twój postęp nauki:</span>
                <span className="text-gradient font-bold">{completionPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all duration-500"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>
          )}
          
          {enrolled ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-800/40 rounded-full text-xs font-mono text-emerald-300">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dostęp Odblokowany (Aktywne)</span>
            </div>
          ) : user && (user.role === "admin") ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 w-full justify-center bg-amber-500/10 border border-amber-800/40 rounded-xl text-xs font-mono text-amber-400">
              <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="uppercase tracking-wider font-semibold">Pełny Dostęp (Administracja/Staff)</span>
            </div>
          ) : course.pricing_model && course.pricing_model !== "free" ? (
            <form onSubmit={handleStripeCheckout} className="space-y-4 border-t border-zinc-800/60 pt-4">
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 font-mono uppercase block">Szybka płatność kartą (Stripe Security)</span>
                <div className="text-xl font-bold text-white tracking-tight">
                  {course.pricing_model === "one_time" 
                    ? `${course.one_time_price || 49}.00 PLN` 
                    : `${course.subscription_price || 9}.00 PLN`
                  }
                  <span className="text-xs text-zinc-500 font-normal font-mono">
                    {course.pricing_model === "one_time" ? " / dożywotnio" : ` / ${course.subscription_interval === "year" ? "rocznie" : "miesiąc"}`}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Numer karty płatniczej</label>
                  <input
                    type="text"
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-3.5 text-xs text-zinc-200 focus:outline-none font-mono"
                    maxLength={19}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Data ważności</label>
                    <input
                      type="text"
                      placeholder="12/28"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-3.5 text-xs text-zinc-200 focus:outline-none font-mono"
                      maxLength={5}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Kod CVC</label>
                    <input
                      type="password"
                      placeholder="123"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-3.5 text-xs text-zinc-200 focus:outline-none font-mono"
                      maxLength={3}
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isProcessingPayment}
                className="w-full py-3 bg-gradient-to-r from-violet-600 to-pink-500 hover:opacity-90 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                {isProcessingPayment ? "Przetwarzanie..." : "Sfinalizuj płatność"}
              </button>

              <p className="text-[10px] text-zinc-500 text-center leading-normal">
                Bezpieczne połączenie szyfrowane SSL. Formularz jest zabezpieczony protokołem Stripe i chroniony hasłem.
              </p>
            </form>
          ) : (
            <button
              id={`enroll-sidebar-${course.id}`}
              onClick={handleEnroll}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white font-semibold rounded-xl text-xs tracking-wide uppercase cursor-pointer transition-all"
            >
              Zapisz się bezpłatnie
            </button>
          )}
        </div>

        {/* Course Modules Navigation Tree */}
        <div className="bg-zinc-90 w-full bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800/60">
          <div className="px-5 py-4 bg-zinc-900/80 border-b border-zinc-800">
            <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Menu className="w-4 h-4 text-violet-400" />
              Spis treści kursu
            </h3>
          </div>

          <div className="divide-y divide-zinc-800/50">
            {structure.map((mod, modIdx) => (
              <div key={mod.id} className="p-4 space-y-3">
                <h4 className="text-xs font-mono font-bold text-gradient uppercase tracking-wide">
                  MODUŁ {modIdx + 1}: {mod.title}
                </h4>
                
                <ul className="space-y-1">
                  {mod.lessons.map((les) => {
                    const isSelected = activeLesson?.id === les.id;
                    const isPremium = les.access_level === "premium";
                    const isLocked = isPremium && !enrolled;
                    const isCompleted = les.progress?.completed === 1;

                    return (
                      <li key={les.id}>
                        <button
                          id={`lesson-selector-${les.id}`}
                          onClick={() => setActiveLesson(les)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                            isSelected
                              ? "bg-zinc-800 border-zinc-700 text-white font-semibold"
                              : "bg-transparent border-transparent text-zinc-400 hover:bg-zinc-950/40 hover:text-zinc-200"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isLocked ? (
                              <Lock className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                            ) : isCompleted ? (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <Play className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                            )}
                            <span className="text-xs line-clamp-1 leading-snug">{les.title}</span>
                          </div>

                          <div className="flex-shrink-0 text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{les.duration_minutes}m</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Certificate issue sidebar indicator if generated */}
        {certificate_code && (
          <div className="p-5 bg-gradient-to-tr from-amber-950/30 to-zinc-900 border border-amber-500/30 rounded-2xl relative overflow-hidden space-y-3 shadow-2xl">
            <div className="absolute top-3 right-3 text-amber-500 opacity-20">
              <Award className="w-16 h-16" />
            </div>
            <div className="flex items-center gap-2 text-amber-400">
              <Award className="w-5 h-5" />
              <h3 className="font-display font-semibold text-sm">Twój Dyplom Ukończenia</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Gratulacje! Wszystkie wymagania tego kursu zostały zaliczone. Twój certyfikat seryjny jest wygenerowany:
            </p>
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-center text-xs font-mono font-bold text-amber-300">
              {certificate_code}
            </div>
            <Link
              id="goto-verification"
              to={`/certificate-verify?code=${certificate_code}`}
              className="block w-full py-2 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-center rounded-xl text-xs font-mono text-amber-400 uppercase transition-all"
            >
              Przejdź do weryfikacji
            </Link>
          </div>
        )}
      </aside>

      {/* RIGHT COLUMN: Active Lesson Player Workplace (col-span-8) */}
      <main className="lg:col-span-8 space-y-8">
        {/* Dynamic promotional banners */}
        {activeAds.length > 0 && (
          <div className="space-y-4">
            {activeAds.map((ad) => (
              <div 
                key={ad.id} 
                onClick={() => handleAdClick(ad.id, ad.link_url)}
                className="bg-zinc-905 bg-zinc-900 border border-zinc-805 border-zinc-800 hover:border-emerald-500/50 p-4 rounded-2xl cursor-pointer transition-all relative overflow-hidden group"
              >
                {ad.image_url ? (
                  <img src={ad.image_url} alt="Reklama partnera" referrerPolicy="no-referrer" className="w-full max-h-48 object-cover rounded-xl" />
                ) : (
                  <div 
                    className="text-xs text-zinc-300 font-mono"
                    dangerouslySetInnerHTML={{ __html: ad.ad_code }} 
                  />
                )}
                <div className="absolute top-2 right-2 text-[8px] bg-zinc-950 font-mono text-zinc-500 py-0.5 px-1.5 rounded uppercase tracking-widest group-hover:text-emerald-400">
                  REKLAMA SPONSOROWANA
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Selection controller */}
        <div className="flex border-b border-zinc-800 pb-px gap-2">
          <button
            id="tab-trigger-course-overview"
            onClick={() => setActiveViewTab("overview")}
            className={`px-4 py-3 text-xs font-mono uppercase tracking-wider border-b-2 font-bold cursor-pointer transition-all flex items-center gap-2 ${
              activeViewTab === "overview"
                ? "border-violet-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Syllabus & Inauguracja
          </button>
          
          <button
            id="tab-trigger-course-lessons"
            onClick={() => {
              if (!enrolled && !(user && (user.role === "admin"))) {
                addToast("Zapisz się lub wykup dostęp premium, aby wejść do odtwarzacza lekcji.", "warning");
                return;
              }
              setActiveViewTab("lessons");
            }}
            className={`px-4 py-3 text-xs font-mono uppercase tracking-wider border-b-2 font-bold cursor-pointer transition-all flex items-center gap-2 ${
              activeViewTab === "lessons"
                ? "border-violet-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-400"
            } ${!enrolled && !(user && (user.role === "admin")) ? "opacity-60" : ""}`}
          >
            <Play className="w-4 h-4" />
            Odtwarzacz Lekcji
            {!enrolled && !(user && (user.role === "admin")) && (
              <Lock className="w-3 h-3 text-zinc-505 text-zinc-500" />
            )}
          </button>
        </div>

        {activeViewTab === "overview" ? (
          <div className="space-y-8">
            {/* 1. Header with Course Slogan & Publisher signature */}
            <div className="p-8 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-4">
                  <span className="text-[10px] font-mono text-violet-400 uppercase tracking-widest font-bold block">
                    Hardban Academy Presents / HardbanRecordsLab-Academy
                  </span>
                  <h1 className="text-3xl sm:text-4xl font-display font-medium text-white tracking-tight">
                    {course.title}
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-4 py-2 bg-zinc-90 w-full md:w-auto bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-xl text-xs font-mono font-medium tracking-wide uppercase transition-all flex items-center gap-1.5 cursor-pointer self-start shrink-0 min-w-[130px] justify-center"
                  title="Skopiuj bezpośredni odnośnik do tego kursu"
                >
                  {copiedLink ? (
                    <>
                      <ClipboardCheck className="w-3.5 h-3.5 text-emerald-450 text-emerald-400" />
                      <span className="text-emerald-450 text-emerald-400 font-bold">Skopiowano!</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5 text-pink-400" />
                      <span>Kopiuj Link</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-sm text-zinc-350 italic max-w-2xl leading-relaxed">
                {course.description}
              </p>
            </div>

            {/* 2. Videoprezentacja - Inauguracja Procesu (Only for Cyfrowy Zen) */}
            {course.title.includes("Cyfrowy Zen") && (
              <div className="space-y-4">
                <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-2 font-bold">
                  <Video className="w-4 h-4 text-violet-400" />
                  Inauguracja Procesu (Wideo Wprowadzające)
                </h3>
                
                <div className="aspect-video w-full rounded-2xl border border-zinc-805 border-zinc-800 bg-zinc-950 overflow-hidden relative group">
                  <video
                    src="/video/intro.mp4"
                    poster={course.thumbnail}
                    controls
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            {/* 3. Kluczowe parametry kursu */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-1">
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block">Czas sygnaturowy</span>
                <span className="text-sm font-semibold text-white font-mono block">
                  {course.title.includes("Cyfrowy Zen") ? "21 lekcji-dni" : `${totalLessons} Lekcji`}
                </span>
              </div>
              <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-1">
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block">Dzienny nakład</span>
                <span className="text-sm font-semibold text-white font-mono block">10 - 30 minut</span>
              </div>
              <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-1">
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block">Uzyskiwany tytuł</span>
                <span className="text-xs font-semibold text-violet-400 block truncate">
                  {course.title.includes("Cyfrowy Zen") ? "Certyfikat Suwerenności" : "Certyfikat HRL"}
                </span>
              </div>
              <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-1">
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block">Metodyka</span>
                <span className="text-sm font-semibold text-white block">
                  {course.title.includes("Cyfrowy Zen") ? "Tygodniowe Fazy" : "Standardowa"}
                </span>
              </div>
            </div>

            {/* 4. Struktura Wiedzy / Moduły (Fully Dynamic & Styled Premium for All Courses) */}
            <div className="space-y-4">
              <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-2 font-bold">
                <BookOpen className="w-4 h-4 text-violet-400" />
                Architektura Programu (Struktura Wiedzy)
              </h3>

              <div className="grid grid-cols-1 gap-6">
                {structure.map((mod, index) => (
                  <div key={mod.id} className="p-5 sm:p-6 bg-zinc-900 border border-zinc-800/80 rounded-2xl space-y-4 shadow-xl">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-zinc-800/50 pb-3 gap-2">
                      <div>
                        <span className="text-[10px] font-mono text-pink-500 font-bold uppercase tracking-wider">
                          MODUŁ {index + 1}
                        </span>
                        <h4 className="text-base sm:text-lg font-display font-medium text-white tracking-tight mt-0.5">
                          {mod.title}
                        </h4>
                      </div>
                      <span className="inline-block self-start sm:self-auto px-2.5 py-1 bg-zinc-950 border border-zinc-850 rounded-lg text-xs font-mono text-zinc-400">
                        {mod.lessons?.length || 0} Lekcji
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {mod.lessons?.map((les, lIndex) => (
                        <div key={les.id} className="p-4 bg-zinc-950 border border-zinc-900 rounded-xl space-y-2.5 flex flex-col justify-between hover:border-zinc-800 transition-colors">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[9px] font-mono text-zinc-500 font-semibold uppercase">
                                Lekcja {lIndex + 1}
                              </span>
                              {les.access_level === "free_preview" && (
                                <span className="text-[9px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                                  Bezpłatny podgląd
                                </span>
                              )}
                            </div>
                            <h5 className="text-xs sm:text-sm font-semibold text-zinc-200">
                              {les.title}
                            </h5>
                            {les.description && (
                              <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                                {les.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 mt-2 pt-2 border-t border-zinc-900/60">
                            <Clock className="w-3.5 h-3.5 text-violet-400" />
                            <span>{les.duration_minutes} min</span>
                            {les.access_level === "free_preview" && (
                              <span className="ml-auto text-[9px] text-violet-400 uppercase tracking-widest font-bold">Obywatel wolny</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Merytoryka / Szablon lekcji (Show only for Cyfrowy Zen process) */}
            {course.title.includes("Cyfrowy Zen") && (
              <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
                <h3 className="text-sm font-semibold text-white">Filozofia, Treść i Stały Szablon Lekcji</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Program jest głębokim, filozoficzno-praktycznym programem z pogranicza higieny cyfrowej, psychologii kognitywnej oraz współczesnego humanizmu. Każdy dzień szkoleniowy jest zaprojektowany według następującego szablonu merytorycznego:
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-900 space-y-1">
                    <span className="text-[10px] font-mono font-bold text-violet-400 block">1. TEMAT DNIA</span>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Teoretyczne wprowadzenie do problemu (np. mechanizm zmiennego nagradzania w social media, utrata myślenia sekwencyjnego).
                    </p>
                  </div>
                  <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-900 space-y-1">
                    <span className="text-[10px] font-mono font-bold text-violet-400 block">2. GŁĘBOKA REFLEKSJA</span>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Pytania skłaniające użytkownika do krytycznej samooceny (np. analiza fizycznego oporu przy czytaniu długich tekstów).
                    </p>
                  </div>
                  <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-900 space-y-1">
                    <span className="text-[10px] font-mono font-bold text-pink-400 block">3. PRAKTYKA W REALU</span>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Konkretne, codzienne zadanie do wykonania (np. 15 minut ciszy bez urządzeń, 10-minutowe opóźnianie gratyfikacji dopaminowej).
                    </p>
                  </div>
                  <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-900 space-y-1">
                    <span className="text-[10px] font-mono font-bold text-pink-400 block">4. MOMENT AHA!</span>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Myśl przewodnia, podsumowująca esencję danej lekcji i budująca trwałe, suwerenne przekonanie.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 6. Dedykowany Panel Decyzji Dostępu (Checkout CTA) */}
            <div className="p-6 bg-gradient-to-tr from-violet-950/20 to-zinc-900 border border-violet-500/20 rounded-2xl text-center space-y-5">
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-white">Status i Dostęp do Programu</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Dostęp do pełnych lekcji oraz certyfikacji jest przydzielany natychmiastowo. Poniższy panel odzwierciedla status szkoleniowy:
                </p>
              </div>

              {enrolled ? (
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-800/40 rounded-full text-xs font-mono text-emerald-300">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Dostęp Odblokowany (Aktywne)</span>
                  </div>
                  <div>
                    <button
                      onClick={() => {
                        setActiveViewTab("lessons");
                        window.scrollTo(0, 0);
                      }}
                      className="px-6 py-3 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white font-semibold rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
                    >
                      Przejdź do Odtwarzacza Lekcji ▶
                    </button>
                  </div>
                </div>
              ) : user && (user.role === "admin") ? (
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-800/40 rounded-full text-xs font-mono text-amber-300">
                    <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Pełny Podgląd (Wydawca/Staff)</span>
                  </div>
                  <div>
                    <button
                      onClick={() => {
                        setActiveViewTab("lessons");
                        window.scrollTo(0, 0);
                      }}
                      className="px-6 py-3 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-white font-mono rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                    >
                      Otwórz Odtwarzacz Lekcji (Staff Preview)
                    </button>
                  </div>
                </div>
              ) : course.pricing_model && course.pricing_model !== "free" ? (
                /* Sleek integrated checkout form inside overview */
                <form onSubmit={handleStripeCheckout} className="max-w-md mx-auto p-5 bg-zinc-950 rounded-xl border border-zinc-800 space-y-4 text-left shadow-2xl">
                  <div className="text-center pb-2 border-b border-zinc-900">
                    <span className="text-[10px] font-mono text-zinc-500 block">SZYBKA PŁATNOŚĆ STRIPE SECURITY</span>
                    <div className="text-2xl font-bold text-white tracking-tight mt-1">
                      {course.pricing_model === "one_time" 
                        ? `${course.one_time_price || 49}.00 PLN` 
                        : `${course.subscription_price || 9}.00 PLN`
                      }
                      <span className="text-xs text-zinc-500 font-normal font-mono ml-1">
                        {course.pricing_model === "one_time" ? " / dożywotnio" : ` / ${course.subscription_interval === "year" ? "rocznie" : "miesiąc"}`}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Numer karty płatniczej</label>
                      <input
                        type="text"
                        placeholder="4242 4242 4242 4242"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-3.5 text-xs text-zinc-200 focus:outline-none font-mono"
                        maxLength={19}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Ważność</label>
                        <input
                          type="text"
                          placeholder="12/28"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-3.5 text-xs text-zinc-200 focus:outline-none font-mono"
                          maxLength={5}
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider">CVC</label>
                        <input
                          type="password"
                          placeholder="123"
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 px-3.5 text-xs text-zinc-200 focus:outline-none font-mono"
                          maxLength={3}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessingPayment}
                    className="w-full py-3 bg-gradient-to-r from-violet-600 to-pink-500 hover:opacity-90 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    {isProcessingPayment ? "Przetwarzanie transakcji..." : `Sfinalizuj płatność i odblokuj kurs`}
                  </button>
                  
                  <p className="text-[9px] text-zinc-500 text-center">
                    Bezpieczne połączenie szyfrowane. Formularz zabezpieczony protokołem Stripe SSL.
                  </p>
                </form>
              ) : (
                <div>
                  <button
                    onClick={handleEnroll}
                    className="px-8 py-3.5 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white font-bold rounded-xl text-xs uppercase tracking-widest cursor-pointer transition-all shadow-md"
                  >
                    Rozpocznij Bezpłatną Transformację
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* TAB: PLAYER WORKSPACE */
          activeLesson ? (
            <div className="space-y-6">
              
              {/* Title */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <h1 id="active-lesson-title" className="text-2xl font-display font-semibold text-white tracking-tight leading-tight">
                    {activeLesson.title}
                  </h1>
                  <div className="flex items-center gap-4 mt-2 font-mono text-xs text-zinc-505 text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Video className="w-3.5 h-3.5" />
                      <span>Format: Wideo + Lekcja</span>
                    </span>
                    <span>|</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Długość: {activeLesson.duration_minutes} min</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-4 py-2 bg-zinc-90 w-full sm:w-auto bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-mono tracking-wide uppercase transition-all rounded-xl cursor-pointer flex items-center justify-center gap-1.5 flex-shrink-0 min-w-[130px]"
                    title="Skopiuj odnośnik"
                  >
                    {copiedLink ? (
                      <>
                        <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Skopiowano!</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-3.5 h-3.5 text-pink-400" />
                        <span>Kopiuj Link</span>
                      </>
                    )}
                  </button>
                  {/* Complete button manually of premium locks */}
                  {activeLesson.has_access && activeLesson.progress?.completed !== 1 && (
                    <button
                      id="mark-completed-button"
                      onClick={() => handleMarkCompleted(activeLesson.id)}
                      className="px-4 py-2 bg-zinc-900 border border-zinc-800 w-full sm:w-auto hover:bg-emerald-950/20 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-400 text-xs font-mono uppercase tracking-wider rounded-xl transition-all cursor-pointer flex justify-center items-center gap-2 flex-shrink-0"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Oznacz jako Ukończoną
                    </button>
                  )}
                </div>
              </div>

              {/* Access control wrapper */}
              {!activeLesson.has_access ? (
                /* "CZARNA ZASŁONA" - Locked Premium Blur View Layout */
                <div
                  id="premium-locked-layer"
                  className="relative aspect-video w-full rounded-2xl border border-red-500/20 bg-zinc-950 overflow-hidden flex flex-col items-center justify-center p-8 text-center space-y-4 shadow-inner"
                >
                  {/* Background blurred element */}
                  <div className="absolute inset-0 bg-[url('https://pictures.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=600')] bg-cover opacity-10 blur-xl pointer-events-none" />
                  
                  <div className="z-10 max-w-sm space-y-5">
                    <div className="inline-flex p-4 bg-red-500/10 rounded-2xl text-red-400 border border-red-500/20">
                      <Lock className="w-6 h-6 animate-pulse" />
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-lg font-display font-medium text-white leading-tight">
                        Brak uwierzytelnienia / subskrypcji
                      </h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Zaliczasz się do grupy studentów z wariantem darmowym. Zakup wariant premium lub zapisz się bezpłatnie do kursu, aby uzyskać pełny dostęp do tej lekcji.
                      </p>
                    </div>

                    <button
                      id="premium-cta-enroll"
                      onClick={handleEnroll}
                      className="px-6 py-3 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white font-semibold rounded-xl text-xs uppercase tracking-wider shadow-lg hover:shadow-violet-600/10 transition-all cursor-pointer inline-block"
                    >
                      Odblokuj dostęp szkoleniowy
                    </button>
                  </div>
                </div>
              ) : (
                /* ACTIVE VIDEO PLAYER VIEWPORT */
                <div className="space-y-6">
                  
                  {/* Video container */}
                  <div
                    id="custom-playback-wrapper"
                    className="aspect-video w-full rounded-2xl border border-zinc-808 border-zinc-800 bg-zinc-950 overflow-hidden relative group"
                  >
                    {/* Playback background view */}
                    <div className="absolute inset-0 bg-neutral-950/90 flex items-center justify-center flex-col text-center">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Odtwarzacz HRL Media Player v1.4</span>
                      <span className="text-xs font-mono text-zinc-100">{activeLesson.video_url ? activeLesson.video_url.split('/').pop() : `lekcja_wideo_${activeLesson.id}.mp4`}</span>
                      
                      {/* Visual equalizer or state overlay */}
                      {isPlaying && (
                        <div className="flex gap-1.5 items-end justify-center mt-6 h-10">
                          <div className="w-1 bg-violet-500 h-6 animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <div className="w-1 bg-pink-500 h-10 animate-bounce" style={{ animationDelay: '0.3s' }} />
                          <div className="w-1 bg-violet-400 h-4 animate-bounce" style={{ animationDelay: '0.5s' }} />
                          <div className="w-1 bg-pink-400 h-8 animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                      )}
                    </div>

                    {/* Play circle trigger button */}
                    {!isPlaying && (
                      <button
                        id="video-player-play-inner"
                        onClick={() => setIsPlaying(true)}
                        className="absolute inset-x-0 inset-y-0 m-auto w-16 h-16 bg-violet-600/90 hover:bg-violet-500 text-white rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-110 cursor-pointer border border-violet-400/20"
                      >
                        <Play className="w-6 h-6 fill-white ml-1" />
                      </button>
                    )}

                    {/* Custom controls overlay bar always responsive */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex flex-col gap-3">
                      {/* Tracker bar */}
                      <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden cursor-pointer relative">
                        <div
                          className="absolute h-full bg-violet-500 rounded-full"
                          style={{ width: `${videoProgress}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono text-zinc-300 leading-none">
                        <div className="flex items-center gap-4">
                          <button
                            id="video-player-toggle-play"
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="hover:text-white transition-colors uppercase font-bold text-violet-400 bg-violet-950/20 px-2 py-0.5 rounded border border-violet-900/40"
                          >
                            {isPlaying ? "Pauza" : "Odtwarzaj"}
                          </button>
                          <span>{isPlaying ? 'ODTWARZANIE' : 'PAUZA'} • {Math.floor((videoProgress / 100) * 324 / 60)}:{(Math.floor((videoProgress / 100) * 324 % 60)).toString().padStart(2, '0')} / 05:24 ({Math.round(videoProgress)}%)</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-sans font-medium">
                          Certyfikowany Moduł Edukacyjny
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lesson Markdown Description below */}
                  <div id="lesson-text-material" className="p-6 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-4">
                    <h3 className="text-sm font-mono text-zinc-500 uppercase tracking-widest">Opis merytoryczny lekcji</h3>
                    <div className="text-zinc-300 text-sm leading-relaxed">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-white mt-6 mb-4" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-xl font-bold text-white mt-5 mb-3" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-lg font-bold text-white mt-4 mb-2" {...props} />,
                          p: ({node, ...props}) => <p className="mb-4" {...props} />,
                          a: ({node, ...props}) => <a className="text-violet-400 hover:text-violet-300 underline" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
                          li: ({node, ...props}) => <li className="text-zinc-300" {...props} />,
                          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-violet-500 pl-4 py-1 italic text-zinc-400 bg-zinc-950/50 rounded-r" {...props} />,
                          code: ({node, ...props}) => {
                            const typedProps = props as any;
                            return typedProps.inline ? 
                              <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-violet-300 font-mono text-xs" {...props} /> :
                              <code className="block bg-zinc-950 p-4 rounded-xl border border-zinc-800 overflow-x-auto text-zinc-300 font-mono text-xs my-4" {...props} />
                          },
                          img: ({node, ...props}) => <img className="rounded-xl border border-zinc-800 my-4 max-w-full" {...props} />,
                          table: ({node, ...props}) => <div className="overflow-x-auto mb-4"><table className="min-w-full divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden" {...props} /></div>,
                          th: ({node, ...props}) => <th className="bg-zinc-950 px-4 py-3 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider" {...props} />,
                          td: ({node, ...props}) => <td className="px-4 py-3 text-sm border-t border-zinc-800" {...props} />,
                        }}
                      >
                        {activeLesson.content || activeLesson.description || "*Brak dodatkowego materiału tekstowego.*"}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* LESSON QUIZ TEST MODULE (If has questions) */}
                  {quizQuestions.length > 0 && (
                    <div id="lesson-evaluation-quiz-block" className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-6">
                      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                        <div className="flex items-center gap-2 text-violet-400">
                          <ClipboardCheck className="w-5 h-5" />
                          <h3 className="font-display font-semibold text-lg text-white">Wymagany test wiedzy (Quiz)</h3>
                        </div>
                        <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Próg zaliczenia: 70%</span>
                      </div>

                      {!quizResult?.submitted ? (
                        /* Active Quiz Questions Form */
                        <form id="lesson-quiz-form" onSubmit={handleQuizSubmit} className="space-y-6">
                          {quizQuestions.map((q, idx) => {
                            const options = [
                              { key: 'A', text: q.option_a },
                              { key: 'B', text: q.option_b },
                              { key: 'C', text: q.option_c },
                              { key: 'D', text: q.option_d }
                            ];

                            return (
                              <div key={q.id} className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800/80">
                                <h4 className="text-sm font-semibold text-zinc-101 flex gap-2">
                                  <span className="text-violet-400 font-mono">{idx + 1}.</span>
                                  {q.question_text}
                                </h4>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                  {options.map((opt) => {
                                    const isSelected = selectedAnswers[q.id] === opt.key;
                                    return (
                                      <button
                                        key={opt.key}
                                        type="button"
                                        id={`question-${q.id}-opt-${opt.key}`}
                                        onClick={() => handleQuizAnswer(q.id, opt.key)}
                                        className={`p-3 text-left rounded-xl border text-xs leading-relaxed transition-all cursor-pointer flex gap-3 items-center ${
                                          isSelected
                                            ? "bg-violet-950/20 border-violet-500 text-violet-200 font-semibold"
                                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
                                        }`}
                                      >
                                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold ${
                                          isSelected ? "bg-violet-500 text-white" : "bg-zinc-950 text-zinc-500"
                                        }`}>
                                          {opt.key}
                                        </span>
                                        <span>{opt.text}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          <button
                            id="submit-quiz"
                            type="submit"
                            className="px-6 py-3.5 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white font-semibold rounded-xl text-xs tracking-widest uppercase shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
                          >
                            <ClipboardCheck className="w-4 h-4" />
                            Wyślij Odpowiedzi na Serwer
                          </button>
                        </form>
                      ) : (
                        /* Quiz Results Panel with Retake button */
                        <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 space-y-6 text-center">
                          <div className="inline-flex p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                            <Award className={`w-8 h-8 ${quizResult.passed ? "text-amber-400" : "text-zinc-500"}`} />
                          </div>
                          
                          <div className="space-y-2">
                            <h4 className="text-xl font-display font-semibold text-white">
                              {quizResult.passed ? "Zaliczono Test!" : "Test Niezaliczony"}
                            </h4>
                            <p className="text-xs text-zinc-450 text-zinc-400 leading-relaxed max-w-sm mx-auto">
                              Uzyskałeś wynik <span className="font-bold text-white text-gradient">{quizResult.score_percent}%</span>. Odpowiedziałeś prawidłowo na {quizResult.correct_count} z {quizResult.total_count} pytań.
                            </p>
                          </div>

                          {/* Certificate generation reward sparkle notification! */}
                          {quizResult.passed && quizResult.score_percent === 100 && (
                            <div className="max-w-md mx-auto p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 font-mono text-xs text-center flex items-center gap-2.5 justify-center">
                              <Sparkles className="w-4 h-4 text-amber-400" />
                              <span>Maksymalny wynik! Dyplom gotowy do pobrania.</span>
                            </div>
                          )}

                          <div className="pt-2 flex justify-center gap-4">
                            <button
                              id="retake-quiz-button"
                              onClick={() => {
                                setSelectedAnswers({});
                                setQuizResult(null);
                              }}
                              className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-mono uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
                            >
                              <RotateCcw className="w-4 h-4" />
                              Powtórz Test (Retake)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {data && (
                <StudentEnterpriseTools
                  courseId={Number(id)}
                  courseTitle={data.course.title}
                  isEnrolled={data.enrolled}
                />
              )}
            </div>
          ) : (
            <div className="p-12 text-center border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-500 space-y-3">
              <BookOpen className="w-10 h-10 mx-auto opacity-40 text-violet-500" />
              <h3 className="text-white text-sm font-semibold">Brak wybranej lekcji</h3>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                Wybierz lekcję ze spisu treści po lewej stronie, aby otworzyć materiały dydaktyczne i rozpocząć trening.
              </p>
            </div>
          )
        )}
      </main>
    </div>
  );
};
