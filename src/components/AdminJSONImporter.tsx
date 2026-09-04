import React, { useState } from "react";
import { Upload, Database, CheckCircle } from "lucide-react";
import { z } from "zod";

// --- Validation schemas ---
const CourseSchema = z.object({
  title: z.string().min(1, "Nazwa jest wymagana"),
  description: z.string().optional(),
  thumbnail: z.string().optional(),
  category: z.string().optional(),
  difficulty: z.string().optional(),
  instructor_name: z.string().optional(),
  pricing_model: z.string().optional(),
  one_time_price: z.number().optional(),
  subscription_price: z.number().optional(),
  subscription_interval: z.string().optional(),
  tenant_domain: z.string().optional()
});

const LessonSchema = z.object({
  module_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  content: z.string().optional(),
  access_level: z.string().optional(),
  duration_minutes: z.number().optional()
});

const UserSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["student", "instructor", "admin"]).optional()
});

const QuizSchema = z.object({
  lesson_id: z.string().min(1),
  question_text: z.string().min(1),
  option_a: z.string().optional(),
  option_b: z.string().optional(),
  option_c: z.string().optional(),
  option_d: z.string().optional(),
  correct_options: z.string().optional(),
  points_value: z.number().optional()
});

interface ImportReport {
  success: boolean;
  imported: number;
  updated: number;
  errors: number;
  details: any[];
}

export const AdminJSONImporter: React.FC<{ token: string | null; addToast: (msg: string, type: "success" | "warning" | "error" | "info") => void }> = ({ token, addToast }) => {
  const [importType, setImportType] = useState<"lessons" | "users" | "courses" | "quiz">("courses");
  const [rawJson, setRawJson] = useState("");
  const [parsedPreview, setParsedPreview] = useState<any[] | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const validateData = (data: any[]) => {
    let schema;
    if (importType === "courses") schema = z.array(CourseSchema);
    else if (importType === "lessons") schema = z.array(LessonSchema);
    else if (importType === "users") schema = z.array(UserSchema);
    else if (importType === "quiz") schema = z.array(QuizSchema);

    if (schema) {
      return schema.safeParse(data);
    }
    return { success: true, data };
  };

  const preventDragDefault = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const val = event.target.result as string;
          setRawJson(val);
          processRawJson(val);
        }
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
      if (!Array.isArray(parsedPayload)) {
         parsedPayload = [parsedPayload];
      }
    } catch (err: any) {
      addToast("Błąd składniowy JSON: " + err.message, "error");
      return;
    }

    const validation = validateData(parsedPayload);
    if (!validation.success) {
      addToast("Błąd schematu JSON. Sprawdź format danych i spróbuj ponownie. " + validation.error.errors.map(e => e.message).join(", "), "error");
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
        body: JSON.stringify(validation.data)
      });
      const data = await res.json();
      if (res.ok) {
        addToast(`Zakończono importowanie. Sukces: ${data.importedCount}, Zaktualizowano: ${data.updatedCount}`, "success");
        setImportReport({
          success: true,
          imported: data.importedCount,
          updated: data.updatedCount,
          errors: data.errorCount,
          details: data.details
        });
        setRawJson("");
        setParsedPreview(null);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      addToast("Błąd importu HTTP: " + err.message, "error");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column Config */}
        <div className="lg:col-span-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-850 pb-2 bg-gradient-to-tr">
            <Database className="w-4 h-4 text-violet-400" />
            <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-300">Wytwórnia danych</h4>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Typ docelowego zasobu</label>
            <select
              title="Import Type"
              value={importType}
              onChange={(e) => setImportType(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 px-4 text-sm text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="courses">Kursy (courses)</option>
              <option value="lessons">Lekcje (lessons)</option>
              <option value="users">Użytkownicy (users)</option>
              <option value="quiz">Pytania quizowe (quiz)</option>
            </select>
          </div>

          <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-850 space-y-2 text-xs text-zinc-400 leading-normal">
            <h5 className="font-semibold text-white font-mono uppercase text-[10px] tracking-wider">Oczekiwany Schemat JSON:</h5>
            {importType === "courses" ? (
              <pre className="text-emerald-400 font-mono leading-relaxed p-1 block overflow-x-auto text-[10px]">
{`[
  {
    "title": "Nowy Kurs",
    "description": "Opis",
    "thumbnail": "url",
    "category": "Kategoria",
    "difficulty": "Trudność",
    "instructor_name": "Imię",
    "pricing_model": "free",
    "one_time_price": 0,
    "subscription_price": 0,
    "subscription_interval": "month",
    "tenant_domain": "all_domains"
  }
]`}
              </pre>
            ) : importType === "lessons" ? (
              <pre className="text-emerald-400 font-mono leading-relaxed p-1 block overflow-x-auto text-[10px]">
{`[
  {
    "module_id": 1,
    "title": "Nowa Lekcja",
    "description": "Opis",
    "content": "Długi tekst",
    "access_level": "free_preview",
    "duration_minutes": 15
  }
]`}
              </pre>
            ) : importType === "users" ? (
              <pre className="text-emerald-400 font-mono leading-relaxed p-1 block overflow-x-auto text-[10px]">
{`[
  {
    "username": "nowy_student",
    "email": "student2@gmail.com",
    "password": "studentPassword",
    "role": "student"
  }
]`}
              </pre>
            ) : (
              <pre className="text-emerald-400 font-mono leading-relaxed p-1 block overflow-x-auto text-[10px]">
{`[
  {
    "lesson_id": "clxyz123...",
    "question_text": "Pytanie egzaminacyjne?",
    "option_a": "Odpowiedź A",
    "option_b": "Odpowiedź B",
    "option_c": "Odpowiedź C",
    "option_d": "Odpowiedź D",
    "correct_options": "A",
    "points_value": 1
  }
]`}
              </pre>
            )}
          </div>
        </div>

        {/* Right Column Dropzone and Text Field */}
        <div className="lg:col-span-8 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-6">
          <div
            onDragOver={preventDragDefault}
            onDragEnter={preventDragDefault}
            onDrop={handleFileDrop}
            className="border-2 border-dashed border-zinc-850 hover:border-violet-500 bg-zinc-950/40 rounded-2xl p-8 hover:bg-zinc-950/20 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group"
          >
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-850 group-hover:scale-110 flex items-center justify-center text-zinc-400 group-hover:text-violet-400 transition-all shadow-xl">
              <Upload className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Przeciągnij i upuść plik JSON</p>
              <p className="text-xs text-zinc-500 font-mono">Pliki seryjne .json o strukturze masowej</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">Lub wklej ciąg tekstowy JSON</label>
            <textarea
              rows={6}
              value={rawJson}
              onChange={handleTextareaChange}
              placeholder="[{ ... }, { ... }]"
              className="w-full bg-zinc-950 border border-zinc-850 focus:border-violet-500 rounded-xl p-4 text-xs font-mono text-emerald-400 focus:outline-none transition-all"
            />
          </div>

          {parsedPreview && (
            <div className="bg-zinc-950/80 p-4 border border-zinc-850 rounded-xl space-y-2">
              <h5 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Podgląd sprawności parsowania (Pierwsze rekordy)</h5>
              <pre className="text-[10px] font-mono leading-relaxed text-zinc-400 overflow-x-auto">
                {JSON.stringify(parsedPreview, null, 2)}
              </pre>
            </div>
          )}

          <button
            onClick={handleJsonImportSubmit}
            disabled={isImporting || !rawJson.trim()}
            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white font-semibold rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-bold"
          >
            {isImporting ? "Uruchamianie procedury..." : "Zainicjuj Masowy Import"}
          </button>
        </div>
      </div>

      {importReport && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-850 pb-2.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-mono uppercase tracking-wider text-emerald-300">Audytor importu zakończony</h4>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl">
              <span className="block text-2xl font-display font-medium text-white">{importReport.imported}</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Zarejestrowano</span>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl">
              <span className="block text-2xl font-display font-medium text-white">{importReport.updated}</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Zaktualizowano</span>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl">
              <span className="block text-2xl font-display font-medium text-red-400">{importReport.errors}</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Pominięte błędy</span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <h5 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Szczegółowy log operacji:</h5>
            <div className="max-h-48 overflow-y-auto divide-y divide-zinc-850 bg-zinc-950 border border-zinc-850 px-4 rounded-xl">
              {importReport.details.map((det, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-300">{det.title || det.username || `Pozycja #${idx + 1}`}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase font-bold ${
                      det.status === 'success' || det.status === 'updated' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {det.status === 'success' ? 'DODANO' : det.status === 'updated' ? 'ZAKTUALIZOWANO' : 'BŁĄD'}
                    </span>
                    {det.error && <span className="text-red-400">{det.error}</span>}
                  </div>
                </div>
              ))}
              {importReport.details.length === 0 && (
                <div className="py-4 text-center text-zinc-500 text-xs font-mono">Brak wpisów logu raportu</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
