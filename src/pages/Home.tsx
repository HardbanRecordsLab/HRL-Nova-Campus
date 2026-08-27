import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { 
  BookOpen, Award, CheckCircle, ArrowRight, Play, Star, Zap, Search, 
  SlidersHorizontal, Trash2, Globe, ShieldCheck, Users, Sparkles, 
  HelpCircle, ChevronDown, ChevronUp, GraduationCap, Clock, Check
} from "lucide-react";

interface CourseWithMeta {
  id: number;
  title: string;
  description: string;
  thumbnail: string;
  category?: string;
  difficulty?: string;
  instructor_name?: string;
  modules_count: number;
  lessons_count: number;
  tenant_domain?: string;
  pricing_model?: "free" | "one_time" | "subscription";
  one_time_price?: number;
  subscription_price?: number;
  subscription_interval?: string;
}

export const Home: React.FC = () => {
  const [courses, setCourses] = useState<CourseWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEnrollments, setUserEnrollments] = useState<Record<number, boolean>>({});
  const [userProgress, setUserProgress] = useState<Record<number, number>>({});
  const { user, token, addToast } = useApp();

  // Search & Filter state variables
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const [selectedInstructor, setSelectedInstructor] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>("all_domains");

  // FAQ accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const fetchCourses = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (selectedCategory) params.append("category", selectedCategory);
      if (selectedDifficulty) params.append("difficulty", selectedDifficulty);
      if (selectedInstructor) params.append("instructor", selectedInstructor);
      if (selectedDomain && selectedDomain !== "all_domains") {
        params.append("domain", selectedDomain);
      }

      const res = await fetch(`/api/courses?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setCourses(data);
      }
    } catch (err) {
      console.error("Failed to load courses list", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserEnrollmentsAndProgress = async () => {
    if (!user || !token || courses.length === 0) return;
    
    try {
      const updatedEnrollments: Record<number, boolean> = {};
      const updatedProgress: Record<number, number> = {};

      for (let i = 0; i < courses.length; i++) {
        const c = courses[i];
        const res = await fetch(`/api/courses/${c.id}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const details = await res.json();
        
        if (res.ok) {
          updatedEnrollments[c.id] = details.enrolled;
          
          let totalLessons = 0;
          let completedLessons = 0;

          if (details.structure && Array.isArray(details.structure)) {
            details.structure.forEach((mod: any) => {
              if (mod.lessons && Array.isArray(mod.lessons)) {
                mod.lessons.forEach((les: any) => {
                  totalLessons++;
                  if (les.progress && les.progress.completed) {
                    completedLessons++;
                  }
                });
              }
            });
          }

          const completionPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
          updatedProgress[c.id] = completionPercent;
        }
      }

      setUserEnrollments(updatedEnrollments);
      setUserProgress(updatedProgress);
    } catch (err) {
      console.error("Error updating user enrollment overlay details", err);
    }
  };

  const fetchDomains = async () => {
    try {
      const res = await fetch("/api/courses/domains");
      if (res.ok) {
        setDomains(await res.json());
      }
    } catch (err) {
      console.error("Failed to load unique domains", err);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [searchTerm, selectedCategory, selectedDifficulty, selectedInstructor, selectedDomain]);

  useEffect(() => {
    fetchUserEnrollmentsAndProgress();
  }, [user, token, courses]);

  const handleEnroll = async (courseId: number) => {
    if (!user) {
      addToast("Zaloguj się lub załóż darmowe konto, aby zapisać się na kurs", "warning");
      return;
    }

    try {
      const res = await fetch(`/api/courses/${courseId}/enroll`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        fetchUserEnrollmentsAndProgress();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  const categoriesList = [
    "Wszystkie",
    "Programowanie",
    "Projektowanie",
    "Analiza Danych",
    "Biznes i Zarządzanie",
    "Rozwój Osobisty",
    "Duchowość 2.0"
  ];

  const faqs = [
    {
      q: "Jak zacząć naukę w HRL Academy?",
      a: "Wystarczy założyć bezpłatne konto lub zarejestrować się w portalu. Po zalogowaniu możesz jednym kliknięciem zapisać się na dowolny darmowy lub płatny kurs i rozpocząć lekcje wideo oraz interaktywne testy."
    },
    {
      q: "W jaki sposób wydawane i weryfikowane są certyfikaty?",
      a: "Po zaliczeniu wszystkich modułów kursu oraz uzyskaniu min. 70% punktów w testach wiedzy, system automatycznie generuje Twój unikalny dyplom w formacie PDF. Każdy certyfikat posiada unikalny numer seryjny, który pracodawcy i instytucje mogą natychmiast zweryfikować na naszej stronie."
    },
    {
      q: "Czy dostęp do materiałów jest bezterminowy?",
      a: "Tak, raz zapisany kurs pozostaje na Twoim koncie na zawsze. Możesz powracać do lekcji, materiałów pomocniczych oraz testów w dowolnym momencie."
    },
    {
      q: "Czy mogę przeglądać kursy bez zakładania konta?",
      a: "Oczywiście! Możesz przeglądać pełen katalog kursów, ich opis, sylabus oraz strukturę modułów. Założenie darmowego konta jest wymagane jedynie do zapisywania postępów i rozwiązywania quizów."
    }
  ];

  return (
    <div id="home-landing-wrapper" className="space-y-16 pb-20">
      
      {/* 1. HERO BANNER LANDING SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 border border-amber-500/20 p-8 md:p-14 text-center md:text-left shadow-2xl mt-4">
        {/* Glow ambient background elements */}
        <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-[350px] h-[350px] bg-violet-600/15 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto md:mx-0 flex flex-col md:flex-row items-center gap-10 justify-between">
          <div className="space-y-5 flex-grow max-w-2xl">
            
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-amber-500/15 via-violet-500/15 to-pink-500/15 border border-amber-500/30 rounded-full text-xs font-mono text-amber-300 shadow-inner">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span className="font-semibold tracking-wide">Innowacyjna Platforma Edukacyjna & Certyfikacja</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold tracking-tight text-white leading-[1.1]">
              Rozwijaj Swoje Kompetencje z{" "}
              <span className="bg-gradient-to-r from-amber-300 via-violet-400 to-pink-400 bg-clip-text text-transparent">
                HRL Academy Pro
              </span>
            </h1>

            <p className="text-zinc-300 text-base md:text-lg leading-relaxed font-sans">
              Odkryj certyfikowane programy e-learningowe z zakresu programowania, nowoczesnego UI/UX, analizy danych oraz cyfrowej suwerenności. Ucz się w swoim tempie i zdobywaj uznawane dyplomy.
            </p>

            {/* Quick Action CTAs */}
            <div className="pt-3 flex flex-wrap items-center justify-center md:justify-start gap-4">
              <a
                href="#courses-explorer-section"
                id="hero-cta-button"
                className="px-7 py-4 bg-gradient-to-r from-amber-500 via-violet-600 to-pink-600 hover:from-amber-400 hover:to-pink-500 text-white font-bold rounded-2xl text-sm transition-all shadow-xl hover:shadow-amber-500/20 flex items-center gap-2.5 group cursor-pointer"
              >
                <BookOpen className="w-5 h-5 text-amber-200" />
                Przeglądaj Katalog Kursów
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>

              {!user ? (
                <Link
                  to="/register"
                  id="hero-register-btn"
                  className="px-6 py-4 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700/80 rounded-2xl text-sm font-semibold transition-all shadow-md flex items-center gap-2"
                >
                  <Users className="w-4 h-4 text-violet-400" />
                  Załóż darmowe konto
                </Link>
              ) : (
                <Link
                  to="/student"
                  id="hero-dashboard-btn"
                  className="px-6 py-4 bg-zinc-900/90 hover:bg-zinc-800 text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-2xl text-sm font-semibold transition-all flex items-center gap-2"
                >
                  <GraduationCap className="w-5 h-5 text-amber-400" />
                  Przejdź do Mojego Panelu
                </Link>
              )}
            </div>

            {/* Trust highlights bar */}
            <div className="pt-4 flex flex-wrap items-center justify-center md:justify-start gap-6 text-xs text-zinc-400 font-mono">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>100% Certyfikat Seryjny</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-amber-400" />
                <span>Bezterminowy Dostęp</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-violet-400 fill-violet-400/30" />
                <span>Oceny 4.9/5 Od Słuchaczy</span>
              </div>
            </div>

          </div>

          {/* 3D Gold Logo Showcase */}
          <div className="relative flex-shrink-0 group">
            <div className="p-1.5 bg-gradient-to-tr from-amber-500 via-violet-600 to-pink-500 rounded-3xl shadow-[0_0_45px_rgba(245,158,11,0.3)] hover:scale-105 transition-all duration-300">
              <img
                src="/logo_3d.jpg"
                alt="HRL Academy Pro 3D Logo"
                className="w-44 h-44 sm:w-52 sm:h-52 md:w-60 md:h-60 rounded-2xl object-cover border-2 border-zinc-900 shadow-2xl"
              />
            </div>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-zinc-950/90 border border-amber-500/40 rounded-xl text-[11px] font-mono text-amber-300 font-bold whitespace-nowrap shadow-lg">
              ★ OFFICIAL ACADEMY CORE ★
            </div>
          </div>
        </div>
      </section>

      {/* 2. VALUE PROPOSITION PILLARS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 bg-zinc-900/60 backdrop-blur border border-zinc-800/80 hover:border-amber-500/40 transition-all rounded-3xl space-y-3 group shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-base font-display font-bold text-white">Certyfikaty z Weryfikacją</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Każdy ukończony kurs daje automatycznie wygenerowany imienny dyplom z cyfrowym numerem seryjnym do weryfikacji.
          </p>
        </div>

        <div className="p-6 bg-zinc-900/60 backdrop-blur border border-zinc-800/80 hover:border-violet-500/40 transition-all rounded-3xl space-y-3 group shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-base font-display font-bold text-white">Praktyczne Projektowanie</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Materiały nastawione na praktyczne umiejętności. Twórz własne projekty, rozwiązuj testy i buduj profesjonalne portfolio.
          </p>
        </div>

        <div className="p-6 bg-zinc-900/60 backdrop-blur border border-zinc-800/80 hover:border-pink-500/40 transition-all rounded-3xl space-y-3 group shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 group-hover:scale-110 transition-transform">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-display font-bold text-white">Nauka we Własnym Tempie</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Dostęp 24/7 na smartfonie, tablecie lub komputerze. Przerabiaj lekcje w najbardziej dogodnym dla Ciebie momencie.
          </p>
        </div>

        <div className="p-6 bg-zinc-900/60 backdrop-blur border border-zinc-800/80 hover:border-emerald-500/40 transition-all rounded-3xl space-y-3 group shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-display font-bold text-white">Darmowy Dostęp Próbny</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Sprawdzaj programy zajęć i pierwsze moduły bez żadnych zobowiązań ani ukrytych opłat.
          </p>
        </div>
      </section>

      {/* 3. COURSE SEARCH & EXPLORER SECTION */}
      <section id="courses-explorer-section" className="space-y-6">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono text-amber-400 uppercase tracking-widest mb-1">
              <BookOpen className="w-4 h-4" />
              <span>Programy Szkoleniowe</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
              Odkryj Nasze Certyfikowane Kursy
            </h2>
          </div>

          <p className="text-xs text-zinc-400 font-mono">
            Znaleziono: <strong className="text-white">{courses.length}</strong> programów
          </p>
        </div>

        {/* Search Bar & Filters Panel */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-amber-400" />
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">Filtruj wg Twoich potrzeb</h3>
            </div>
            
            {(searchTerm || selectedCategory || selectedDifficulty || selectedInstructor || (selectedDomain && selectedDomain !== "all_domains")) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("");
                  setSelectedDifficulty("");
                  setSelectedInstructor("");
                  setSelectedDomain("all_domains");
                }}
                className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-500/30 rounded-xl text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Resetuj filtry
              </button>
            )}
          </div>

          {/* Category Quick Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-none">
            {categoriesList.map((cat) => {
              const catValue = cat === "Wszystkie" ? "" : cat;
              const isActive = selectedCategory === catValue;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(catValue)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-medium font-mono whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? "bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/20"
                      : "bg-zinc-950/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1">
            {/* Search phrase */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-zinc-500" />
              </span>
              <input
                type="text"
                placeholder="Szukaj frazy..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-all font-mono"
              />
            </div>

            {/* Difficulty SELECT filter */}
            <div>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-all cursor-pointer font-mono"
              >
                <option value="">Wszystkie Poziomy</option>
                <option value="Początkujący">Początkujący</option>
                <option value="Średniozaawansowany">Średniozaawansowany</option>
                <option value="Zaawansowany">Zaawansowany</option>
              </select>
            </div>

            {/* Instructor SELECT filter */}
            <div>
              <select
                value={selectedInstructor}
                onChange={(e) => setSelectedInstructor(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-all cursor-pointer font-mono"
              >
                <option value="">Wszyscy Instruktorzy</option>
                <option value="Michał Kowalski">Michał Kowalski</option>
                <option value="Anna Nowak">Anna Nowak</option>
                <option value="Tomasz Mazur">Tomasz Mazur</option>
              </select>
            </div>

            {/* Domain SELECT filter */}
            <div>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-950 border border-emerald-800/60 focus:border-emerald-500 rounded-xl text-xs text-emerald-300 focus:outline-none transition-all cursor-pointer font-mono bg-emerald-950/20"
              >
                <option value="all_domains" className="text-zinc-300 bg-zinc-950">Wszystkie domeny</option>
                {domains.map((dom) => (
                  <option key={dom} value={dom} className="text-zinc-300 bg-zinc-950">
                    Domena: {dom}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Courses Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-96 bg-zinc-900 border border-zinc-800 rounded-3xl" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/40 border border-zinc-800 rounded-3xl space-y-4">
            <BookOpen className="w-14 h-14 text-zinc-600 mx-auto" />
            <h3 className="text-lg font-semibold text-white">Brak kursów dla wybranych kryteriów</h3>
            <p className="text-zinc-400 font-mono text-xs max-w-md mx-auto">
              Spróbuj zmienić frazę wyszukiwania lub zresetować filtry kategorii.
            </p>
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedCategory("");
                setSelectedDifficulty("");
                setSelectedInstructor("");
              }}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs font-mono rounded-xl cursor-pointer shadow-lg"
            >
              Resetuj Filtry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => {
              const isEnrolled = !!userEnrollments[course.id];
              const courseCompletion = userProgress[course.id] ?? 0;
              const hasStarted = courseCompletion > 0;
              const isExternal = !!(course.tenant_domain && course.tenant_domain !== "all_domains" && course.tenant_domain !== "");

              return (
                <div
                  key={course.id}
                  id={`course-card-${course.id}`}
                  className="group bg-zinc-900/70 border border-zinc-800 hover:border-amber-500/40 rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl flex flex-col justify-between"
                >
                  <div>
                    {/* Thumbnail Image Header */}
                    <Link
                      to={`/course/${course.id}`}
                      className="block h-52 relative overflow-hidden bg-zinc-950"
                    >
                      <img
                        referrerPolicy="no-referrer"
                        src={course.thumbnail}
                        alt={course.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-85"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                      
                      {/* Lessons Badge */}
                      <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-950/90 border border-zinc-800 rounded-full text-[10px] font-mono font-semibold uppercase text-zinc-300 backdrop-blur">
                        <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>{course.lessons_count} Lekcji</span>
                      </div>

                      {/* Float Price Tag */}
                      <div className="absolute top-4 right-4 inline-flex items-center gap-1 px-3 py-1 bg-zinc-950/90 border border-zinc-800 rounded-xl text-[11px] font-mono font-extrabold backdrop-blur">
                        {course.pricing_model === "one_time" ? (
                          <span className="text-pink-400">{course.one_time_price || 49} PLN</span>
                        ) : course.pricing_model === "subscription" ? (
                          <span className="text-violet-400">
                            {course.subscription_price || 9} PLN/{course.subscription_interval === "year" ? "rok" : "m-c"}
                          </span>
                        ) : (
                          <span className="text-emerald-400">DARMOWY</span>
                        )}
                      </div>
                    </Link>

                    {/* Body Content */}
                    <div className="p-6 space-y-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[9px] font-mono text-zinc-300 uppercase font-semibold">
                          {course.category || "Ogólny"}
                        </span>
                        <span className="px-2.5 py-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[9px] font-mono text-amber-400 font-bold uppercase">
                          {course.difficulty || "Dowolny"}
                        </span>
                        {isExternal && (
                          <span className="px-2.5 py-0.5 bg-amber-950/60 border border-amber-500/40 rounded-lg text-[9px] font-mono text-amber-300 font-bold uppercase animate-pulse">
                            Partner
                          </span>
                        )}
                      </div>
                      
                      <Link to={`/course/${course.id}`} className="block">
                        <h3 className="text-xl font-display font-bold text-white leading-snug group-hover:text-amber-300 transition-colors">
                          {course.title}
                        </h3>
                      </Link>

                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {course.description}
                      </p>

                      <div className="text-[10px] font-mono text-zinc-500 pt-1 flex items-center justify-between">
                        <span>Prowadzący: <strong className="text-zinc-300">{course.instructor_name || "HRL Team"}</strong></span>
                      </div>

                      {/* Logged in progress tracker */}
                      {isEnrolled && (
                        <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
                          <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
                            <span>Twój postęp:</span>
                            <span className="text-amber-400 font-bold">{courseCompletion}%</span>
                          </div>
                          <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                            <div
                              className="h-full bg-gradient-to-r from-amber-500 to-violet-500 rounded-full transition-all duration-500"
                              style={{ width: `${courseCompletion}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="p-6 pt-0">
                    <div className="pt-3 flex items-center justify-between gap-3 border-t border-zinc-800/60">
                      {user && (user.role === "admin") ? (
                        <Link
                          id={`btn-open-course-admin-${course.id}`}
                          to={`/course/${course.id}`}
                          className="w-full py-3 bg-zinc-950 hover:bg-zinc-800 text-amber-400 border border-amber-500/40 rounded-xl text-xs font-bold font-mono tracking-wide uppercase transition-all flex items-center justify-center gap-2 group cursor-pointer"
                        >
                          <BookOpen className="w-4 h-4 text-amber-400" />
                          <span>Podgląd Administracyjny</span>
                        </Link>
                      ) : isEnrolled ? (
                        <Link
                          id={`btn-open-course-${course.id}`}
                          to={`/course/${course.id}`}
                          className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs font-mono tracking-wide uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                        >
                          <Play className="w-4 h-4 text-amber-300 fill-amber-300" />
                          <span>{hasStarted ? "Kontynuuj Naukę" : "Rozpocznij Kurs"}</span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 w-full">
                          <button
                            id={`btn-enroll-course-${course.id}`}
                            onClick={() => handleEnroll(course.id)}
                            className="flex-grow py-3 bg-gradient-to-r from-amber-500 via-amber-600 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-zinc-950 font-extrabold rounded-xl text-xs text-center uppercase tracking-wide cursor-pointer transition-all shadow-md block"
                          >
                            Zapisz Się Teraz
                          </button>
                          <Link
                            id={`btn-preview-course-${course.id}`}
                            to={`/course/${course.id}`}
                            className="p-3 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-xl transition-all"
                            title="Przeglądaj sylabus i opis"
                          >
                            <BookOpen className="w-4 h-4" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. CERTIFICATE VERIFICATION SPOTLIGHT */}
      <section className="bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 border border-amber-500/30 rounded-3xl p-8 md:p-12 relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-8 justify-between">
          <div className="space-y-4 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-xs font-mono text-amber-300">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Weryfikacja Kryptograficzna</span>
            </div>
            <h2 className="text-3xl font-display font-bold text-white tracking-tight">
              Sprawdź Autentyczność Dyplomu
            </h2>
            <p className="text-zinc-300 text-sm leading-relaxed max-w-xl">
              Pracodawcy i rekruterzy mogą natychmiast zweryfikować certyfikat wydany przez HRL Academy wpisując unikalny kod seryjny w ogólnodostępnym weryfikatorze.
            </p>
            <div className="pt-2">
              <Link
                to="/certificate-verify"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-2xl text-xs font-mono uppercase tracking-wide transition-all shadow-lg"
              >
                <Search className="w-4 h-4" />
                Otwórz Weryfikator Certyfikatów
              </Link>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-3 w-full max-w-xs shadow-2xl text-left font-mono">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 border-b border-zinc-800 pb-2">
              <span>PODGLĄD DYPLOMU</span>
              <span className="text-emerald-400 font-bold">STATUS: AKTYWNY</span>
            </div>
            <div className="text-xs text-white space-y-1">
              <p className="text-amber-300 font-bold">SERIAL: HRL-2026-X892</p>
              <p className="text-zinc-400 text-[11px]">Słuchacz: Jan Kowalski</p>
              <p className="text-zinc-400 text-[11px]">Program: Full-Stack React & Node</p>
            </div>
            <div className="pt-2 flex items-center gap-1.5 text-[10px] text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span>Suma kontrolna zweryfikowana</span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. STUDENT TESTIMONIALS */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <span className="text-xs font-mono text-amber-400 uppercase tracking-widest">Opinie Słuchaczy</span>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-white">Dlaczego Warto Uczyć Się z Nami?</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-1 text-amber-400">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400" />
              ))}
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed italic">
              "Certyfikat HRL Academy pomógł mi w rozmowie rekrutacyjnej na stanowisko Junior Web Developera. Bardzo jasny podział na lekcje i konkretne zadania testowe."
            </p>
            <div className="pt-2 border-t border-zinc-800 text-xs font-mono">
              <strong className="text-white block">Marek Wiśniewski</strong>
              <span className="text-zinc-500">Absolwent Ścieżki Frontend</span>
            </div>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-1 text-amber-400">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400" />
              ))}
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed italic">
              "Świetny interfejs i możliwość nauki na własnych zasadach. System automatycznie zapisuje postęp i od razu generuje dyplom po quizie."
            </p>
            <div className="pt-2 border-t border-zinc-800 text-xs font-mono">
              <strong className="text-white block">Karolina Zielińska</strong>
              <span className="text-zinc-500">UX/UI Designerka</span>
            </div>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-1 text-amber-400">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400" />
              ))}
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed italic">
              "Najlepsza platforma edukacyjna z jaką miałem do czynienia. Bez zbędnego lania wody, same inżynieryjne przykłady i czysta wiedza."
            </p>
            <div className="pt-2 border-t border-zinc-800 text-xs font-mono">
              <strong className="text-white block">Piotr Adamski</strong>
              <span className="text-zinc-500">Programista Python</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FAQ ACCORDION SECTION */}
      <section className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-8 space-y-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-white">Najczęściej Zadawane Pytania (FAQ)</h2>
            <p className="text-xs text-zinc-400">Wszystko, co musisz wiedzieć przed rozpoczęciem nauki</p>
          </div>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950/60 transition-colors"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 font-semibold text-sm text-white hover:text-amber-300 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. CLOSING CTA BANNER */}
      {!user && (
        <section className="bg-gradient-to-r from-amber-500 via-violet-600 to-pink-600 rounded-3xl p-8 md:p-12 text-center text-zinc-950 shadow-2xl relative overflow-hidden">
          <div className="max-w-2xl mx-auto space-y-4 relative z-10">
            <h2 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-white">
              Gotowy Na Przełom W Swojej Karierze?
            </h2>
            <p className="text-zinc-100 text-sm font-medium leading-relaxed">
              Dołącz do społeczności HRL Academy. Załóż darmowe konto w 30 sekund i zacznij swoją pierwszą certyfikowaną lekcję.
            </p>
            <div className="pt-2 flex justify-center gap-4">
              <Link
                to="/register"
                className="px-8 py-4 bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold rounded-2xl text-xs font-mono uppercase tracking-wider transition-all shadow-2xl cursor-pointer"
              >
                Załóż Darmowe Konto
              </Link>
            </div>
          </div>
        </section>
      )}

    </div>
  );
};

