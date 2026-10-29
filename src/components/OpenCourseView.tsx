import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Award, CheckCircle, Circle, ClipboardCheck, ExternalLink, Link2, ListChecks, Lock, RefreshCw, RotateCcw, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { RodoConsentModal } from "./RodoConsentModal";

// Kurs z katalogu bezpłatnych kursów zewnętrznych: strona kursu otwiera się w Nova Campus (w ramce, gdy strona źródłowa na to
// pozwala, w przeciwnym razie w nowej karcie), a obok działa panel postępu: etapy zapisywane na koncie ucznia,
// test końcowy i certyfikat HRL Nova Campus po jego zaliczeniu.
// Ten sam widok obsługuje też kursy interaktywne z AI Publish (HOSTED_HTML): kurs działa w ramce bez dostępu do danych Novy
// i rozmawia z panelem przez postMessage (gotowość, zaliczona lekcja, prośba o test końcowy); postęp zapisuje Nova na koncie ucznia.

interface StageLesson {
  id: string;
  title: string;
  has_quiz?: boolean;
  progress?: { percent: number; completed: number };
}

interface Props {
  courseId: string;
  course: any;
  structure: Array<{ id: string; title: string; lessons: StageLesson[] }>;
  enrolled: boolean;
  certificateCode: string | null;
  reload: () => Promise<void> | void;
  onCopyLink: () => void;
  copiedLink: boolean;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

interface QuizResult {
  score_percent: number;
  passed: boolean;
  correct_count: number;
  total_count: number;
}

const barButton =
  "px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-lg text-[11px] font-mono uppercase tracking-wide transition-all flex items-center gap-1.5 cursor-pointer";

export const OpenCourseView: React.FC<Props> = ({ courseId, course, structure, enrolled, certificateCode, reload, onCopyLink, copiedLink }) => {
  const { token, addToast } = useApp();
  const [top, setTop] = useState(64);
  const [reloadKey, setReloadKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const enrollTried = useRef(false);

  const [quizOpen, setQuizOpen] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingConsent, setPendingConsent] = useState<string | null>(null);

  const embedded = course.integration_type === "IFRAME";
  const hosted = course.integration_type === "HOSTED_HTML";
  const externalUrl: string = course.external_url;
  const [hostedHtml, setHostedHtml] = useState<string | null>(null);
  const [hostedError, setHostedError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const latest = useRef<any>({});

  useEffect(() => {
    const measure = () => {
      const nav = document.getElementById("main-navigation");
      setTop(nav ? Math.max(0, Math.round(nav.getBoundingClientRect().bottom)) : 64);
    };
    window.scrollTo(0, 0);
    measure();
    window.addEventListener("resize", measure);
    const html = document.documentElement;
    const prev = { html: html.style.overflow, body: document.body.style.overflow };
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (window.innerWidth < 1024) setPanelOpen(false);
    return () => {
      window.removeEventListener("resize", measure);
      html.style.overflow = prev.html;
      document.body.style.overflow = prev.body;
    };
  }, []);

  // Kursy zewnętrzne nie zużywają limitu zapisów, więc uczeń jest zapisywany przy pierwszym otwarciu (potrzebne do zapisu postępu).
  useEffect(() => {
    if (enrolled || enrollTried.current || !token) return;
    enrollTried.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}/enroll`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
        if (res.ok) await reload();
        else setEnrollError(((await res.json().catch(() => ({}))) as any).message || "Nie udało się zapisać Cię na kurs.");
      } catch (err: any) {
        setEnrollError(err.message);
      }
    })();
  }, [enrolled, token, courseId]);

  // Kurs HOSTED_HTML pobieramy dopiero po zapisie ucznia (serwer nie wydaje treści bez aktywnego zapisu).
  useEffect(() => {
    if (!hosted || !enrolled || !token) return;
    let cancelled = false;
    setHostedError(null);
    (async () => {
      try {
        const res = await fetch("/api/access/launch", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ courseId }) });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.hosted && data.htmlContent) setHostedHtml(data.htmlContent);
        else setHostedError(data.message || "Nie udało się załadować kursu.");
      } catch (err: any) {
        if (!cancelled) setHostedError(err.message || "Nie udało się załadować kursu.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hosted, enrolled, token, courseId, reloadKey]);

  const lessons = structure.flatMap((m) => m.lessons);
  const stages = lessons.filter((l) => !l.has_quiz);
  const test = lessons.find((l) => l.has_quiz) ?? null;
  const isDone = (l: StageLesson) => (l.id in override ? override[l.id] : l.progress?.completed === 1);
  const stagesDone = stages.filter(isDone).length;
  const allStagesDone = stages.length > 0 && stagesDone === stages.length;
  const testPassed = Boolean(certificateCode) || (test ? isDone(test) : false);
  const total = stages.length + (test ? 1 : 0);
  const percent = certificateCode ? 100 : total > 0 ? Math.min(99, Math.round(((stagesDone + (testPassed ? 1 : 0)) / total) * 100)) : 0;

  const setStage = async (lesson: StageLesson, next: boolean) => {
    if (!enrolled) {
      addToast("Poczekaj chwilę, zapisuję Cię na kurs...", "info");
      return;
    }
    setOverride((o) => ({ ...o, [lesson.id]: next }));
    try {
      const res = await fetch(`/api/lessons/${lesson.id}/progress`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ percent: next ? 100 : 0, completed: next ? 1 : 0, last_watched_timestamp: 0 }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any).message || "Nie udało się zapisać postępu.");
      await reload();
    } catch (err: any) {
      setOverride((o) => ({ ...o, [lesson.id]: !next }));
      addToast(err.message, "error");
    }
  };
  const toggleStage = (lesson: StageLesson) => setStage(lesson, !isDone(lesson));

  const openQuiz = async () => {
    if (!test) return;
    try {
      const res = await fetch(`/api/lessons/${test.id}/quiz`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Nie udało się pobrać pytań testu.");
      setQuestions(await res.json());
      setAnswers({});
      setResult(null);
      setQuizOpen(true);
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  latest.current = { stages, isDone, setStage, openQuiz, allStagesDone, addToast };
  useEffect(() => {
    if (!hosted) return;
    const onMessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (ev.source !== frameRef.current?.contentWindow || !m || m.source !== "hrl-course") return;
      const L = latest.current;
      if (m.type === "hrl-course-ready") {
        const completed = L.stages.map((s: StageLesson, i: number) => (L.isDone(s) ? i : -1)).filter((i: number) => i >= 0);
        frameRef.current?.contentWindow?.postMessage({ type: "hrl-course-init", host: "nova", completed }, "*");
      } else if (m.type === "hrl-course-progress" && Number.isInteger(m.index) && typeof m.completed === "boolean") {
        const s: StageLesson | undefined = L.stages[m.index];
        if (s && L.isDone(s) !== m.completed) L.setStage(s, m.completed);
      } else if (m.type === "hrl-course-open-test") {
        if (L.allStagesDone) L.openQuiz();
        else L.addToast("Najpierw ukończ wszystkie lekcje kursu.", "info");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [hosted]);

  const submitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!test) return;
    if (Object.keys(answers).length < questions.length) {
      addToast("Odpowiedz na wszystkie pytania przed wysłaniem.", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quiz/${test.id}/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Nie udało się wysłać testu.");
      setResult({ score_percent: data.score_percent, passed: data.passed, correct_count: data.correct_count, total_count: data.total_count });
      if (data.passed) {
        addToast(`Test zaliczony: ${data.score_percent}%. Certyfikat jest gotowy.`, "success");
        if (data.certificate?.needsConsent) setPendingConsent(data.certificate.code);
        await reload();
      } else {
        addToast(`Test niezaliczony: ${data.score_percent}% (wymagane 70%).`, "error");
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const panel = (
    <aside className="absolute lg:static inset-y-0 right-0 z-10 w-[min(92vw,360px)] lg:w-[360px] shrink-0 bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
      <div className="p-4 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Twój postęp</h3>
            <span className="text-sm font-mono text-cyan-400">{percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            {hosted ? "Kurs interaktywny HRL Nova Campus. Postęp zapisuje się na Twoim koncie." : `Kurs prowadzi: ${course.provider || "instytucja źródłowa"}. Postęp zapisuje się na Twoim koncie.`}
          </p>
        </div>

        {enrollError && <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/40 text-xs text-red-300">{enrollError}</div>}

        <div className="space-y-2">
          <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400">{hosted ? "Lekcje kursu" : "Etapy kursu"}</h4>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            {hosted
              ? "Lekcję zaliczasz w kursie, odpowiadając na quiz na jej końcu. Gdy ukończysz wszystkie lekcje, odblokuje się test końcowy."
              : "Odhaczaj etapy w miarę nauki. Gdy zaznaczysz wszystkie, odblokuje się test końcowy."}
          </p>
          <ul className="space-y-1.5">
            {stages.map((s) => {
              const done = isDone(s);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => !hosted && toggleStage(s)}
                    disabled={hosted}
                    className={`w-full flex items-start gap-2.5 text-left p-2.5 rounded-xl border text-xs leading-snug ${hosted ? "cursor-default" : "cursor-pointer"} transition-colors ${done ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-200" : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700"}`}
                  >
                    {done ? <CheckCircle className="w-4 h-4 mt-px shrink-0 text-emerald-400" /> : <Circle className="w-4 h-4 mt-px shrink-0 text-zinc-600" />}
                    <span>{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {test && (
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400">Test końcowy i certyfikat</h4>
            {certificateCode ? (
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 space-y-2">
                <div className="flex items-center gap-2 text-cyan-300 text-xs font-semibold">
                  <Award className="w-4 h-4" /> Certyfikat wystawiony
                </div>
                <p className="text-[11px] font-mono text-zinc-300 break-all">{certificateCode}</p>
                <div className="flex flex-wrap gap-2">
                  <Link to="/student" className={barButton}>Moje certyfikaty</Link>
                  <Link to={`/certificate-verify?code=${certificateCode}`} className={barButton}>Weryfikacja</Link>
                </div>
              </div>
            ) : allStagesDone ? (
              <button
                type="button"
                onClick={openQuiz}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-white text-xs font-mono font-bold uppercase tracking-wide rounded-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4" /> Rozpocznij test końcowy
              </button>
            ) : (
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-500 leading-relaxed flex gap-2">
                <Lock className="w-4 h-4 shrink-0 text-zinc-600" />
                <span>{`Test odblokuje się po odhaczeniu wszystkich etapów (${stagesDone} z ${stages.length}).`}</span>
              </div>
            )}
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              {hosted
                ? "Test składa się z pytań jednokrotnego wyboru, a próg zaliczenia to 70%. Certyfikat wystawia HRL Nova Campus po zaliczeniu testu końcowego."
                : "Test składa się z pytań jednokrotnego wyboru, a próg zaliczenia to 70%. Certyfikat wystawia HRL Nova Campus; nie jest certyfikatem instytucji prowadzącej kurs."}
            </p>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col bg-zinc-950" style={{ top }}>
      <div className="flex items-center justify-between gap-3 px-3 sm:px-4 h-11 shrink-0 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className={barButton}>
            ← <span className="hidden sm:inline">Katalog</span>
          </Link>
          <h2 className="text-sm font-medium text-white truncate">{course.title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => setPanelOpen((v) => !v)} className={barButton} title="Postęp i certyfikat">
            <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Postęp</span>
            <span className="text-cyan-400">{percent}%</span>
          </button>
          {!hosted && (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" className={barButton} title="Otwórz kurs w nowej karcie">
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden md:inline">Nowa karta</span>
            </a>
          )}
          {(embedded || hosted) && (
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={barButton} title="Odśwież kurs">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden md:inline">Odśwież</span>
            </button>
          )}
          <button type="button" onClick={onCopyLink} className={barButton} title="Skopiuj odnośnik do kursu">
            <Link2 className={`w-3.5 h-3.5 ${copiedLink ? "text-emerald-400" : "text-teal-400"}`} />
            <span className="hidden md:inline">{copiedLink ? "Skopiowano" : "Kopiuj link"}</span>
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 min-h-0 flex">
          {hosted ? (
            hostedHtml ? (
              <iframe
                key={reloadKey}
                ref={frameRef}
                srcDoc={hostedHtml}
                title={course.title}
                className="block w-full h-full border-0 bg-white"
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
              />
            ) : (
              <div className="m-auto max-w-md px-6 py-10 text-center space-y-3">
                {hostedError ? (
                  <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/40 text-xs text-red-300">{hostedError}</div>
                ) : (
                  <p className="text-sm text-zinc-400">Ładowanie kursu...</p>
                )}
              </div>
            )
          ) : embedded ? (
            <iframe
              key={reloadKey}
              src={externalUrl}
              title={course.title}
              className="block w-full h-full border-0 bg-white"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          ) : (
            <div className="m-auto max-w-lg px-6 py-10 text-center space-y-5">
              <ExternalLink className="w-12 h-12 text-cyan-500 mx-auto" />
              <h3 className="text-xl font-display font-semibold text-white">{course.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {`Strona tego kursu (${course.provider || "instytucja źródłowa"}) nie pozwala na wyświetlanie wewnątrz innych serwisów, dlatego otwiera się w nowej karcie. Wróć tutaj, aby odhaczać etapy, zapisać postęp i zdobyć certyfikat.`}
              </p>
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-white text-xs font-mono font-bold uppercase tracking-wide rounded-xl"
              >
                <ExternalLink className="w-4 h-4" /> Otwórz kurs
              </a>
            </div>
          )}
        </div>
        {panelOpen && panel}
      </div>

      {quizOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto my-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-7 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-display font-semibold text-white">Test końcowy</h3>
                <p className="text-xs text-zinc-500 mt-1">{course.title}</p>
              </div>
              <button type="button" onClick={() => setQuizOpen(false)} className={barButton} aria-label="Zamknij">
                <X className="w-4 h-4" />
              </button>
            </div>

            {result ? (
              <div className="text-center space-y-4 py-4">
                <Award className={`w-12 h-12 mx-auto ${result.passed ? "text-cyan-400" : "text-zinc-500"}`} />
                <h4 className="text-xl font-semibold text-white">{result.passed ? "Test zaliczony" : "Test niezaliczony"}</h4>
                <p className="text-sm text-zinc-400">
                  {`Wynik: ${result.score_percent}% (${result.correct_count} z ${result.total_count} punktów). Próg zaliczenia to 70%.`}
                </p>
                <div className="flex justify-center gap-3">
                  {!result.passed && (
                    <button type="button" onClick={() => { setAnswers({}); setResult(null); }} className={barButton}>
                      <RotateCcw className="w-3.5 h-3.5" /> Spróbuj ponownie
                    </button>
                  )}
                  <button type="button" onClick={() => setQuizOpen(false)} className={barButton}>Zamknij</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitQuiz} className="space-y-6">
                {questions.map((q, i) => (
                  <fieldset key={q.id} className="space-y-2">
                    <legend className="text-sm font-medium text-white mb-2">{i + 1}. {q.question_text}</legend>
                    {(["A", "B", "C", "D"] as const).map((letter) => {
                      const text = (q as any)[`option_${letter.toLowerCase()}`] as string;
                      const chosen = answers[q.id] === letter;
                      return (
                        <label
                          key={letter}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-sm cursor-pointer transition-colors ${chosen ? "bg-cyan-500/10 border-cyan-500/50 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700"}`}
                        >
                          <input type="radio" name={`q-${q.id}`} checked={chosen} onChange={() => setAnswers((a) => ({ ...a, [q.id]: letter }))} className="mt-1" />
                          <span><span className="font-mono text-zinc-500 mr-1.5">{letter}.</span>{text}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase tracking-wide rounded-xl cursor-pointer"
                >
                  {submitting ? "Wysyłanie..." : "Wyślij odpowiedzi"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {pendingConsent && <RodoConsentModal certificateCode={pendingConsent} onClose={() => setPendingConsent(null)} />}
    </div>
  );
};
