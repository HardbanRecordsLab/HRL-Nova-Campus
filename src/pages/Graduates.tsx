import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Search, Calendar, Award, ChevronLeft, ChevronRight } from "lucide-react";

interface GraduateEntry {
  id: string;
  certificateCode: string;
  studentDisplayName: string;
  courseTitle: string;
  issuedAt: string;
}

const PAGE_SIZE = 20;

export const Graduates: React.FC = () => {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GraduateEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (query.trim()) params.set("q", query.trim());

      fetch(`/api/graduates?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(handle);
  }, [query, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div id="graduates-registry" className="max-w-4xl mx-auto py-8 space-y-10">
      <section className="text-center space-y-4 max-w-xl mx-auto">
        <div className="inline-flex p-3 bg-violet-500/10 rounded-xl text-violet-400">
          <GraduationCap className="w-6 h-6" />
        </div>
        <h2 className="text-3xl font-display font-semibold tracking-tight text-white leading-tight">
          Publiczna Baza Absolwentów
        </h2>
        <p className="text-sm text-zinc-400">
          Absolwenci HRL Academy, którzy dobrowolnie zgodzili się na publikację swojego ukończenia
          w tym rejestrze. Każdy wpis odpowiada zweryfikowanemu certyfikatowi.
        </p>

        <div className="relative flex items-center bg-zinc-900 border border-zinc-800 focus-within:border-violet-500 rounded-2xl p-1.5 transition-all">
          <Search className="w-4 h-4 text-zinc-500 ml-3 flex-shrink-0" />
          <input
            id="graduates-search-input"
            type="text"
            value={query}
            onChange={(e) => {
              setPage(1);
              setQuery(e.target.value);
            }}
            placeholder="Szukaj po imieniu, nazwisku lub nazwie kursu..."
            className="w-full bg-transparent border-0 focus:ring-0 text-white pl-3 text-sm focus:outline-none placeholder:text-zinc-600"
          />
        </div>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-zinc-800 rounded-3xl text-zinc-500 space-y-3">
            <GraduationCap className="w-10 h-10 mx-auto opacity-40 text-violet-400" />
            <h3 className="text-zinc-300 font-medium text-sm">Brak wyników</h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              {query ? "Nie znaleziono absolwentów pasujących do wyszukiwania." : "Rejestr jest jeszcze pusty."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((entry) => (
              <Link
                key={entry.id}
                to={`/verify/${entry.certificateCode}`}
                className="p-5 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/40 rounded-2xl transition-colors flex items-start gap-4"
              >
                <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400 flex-shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">{entry.studentDisplayName}</h4>
                  <p className="text-xs text-zinc-400 truncate">{entry.courseTitle}</p>
                  <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1 mt-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(entry.issuedAt).toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric" })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              id="graduates-prev-page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-zinc-500">
              Strona {page} / {totalPages}
            </span>
            <button
              id="graduates-next-page"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
