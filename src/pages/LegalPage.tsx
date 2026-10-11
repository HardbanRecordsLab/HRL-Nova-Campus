import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";

// Dokumenty prawne są wspólne dla całej platformy HardbanRecords Lab i mieszkają na
// hardbanrecordslab.online (jedno źródło: G:\HRL\Wordpress\legal). Tu tylko skrót dla Nova Campus.
const SITE = "https://hardbanrecordslab.online";
const DOCS = [
  { href: `${SITE}/terms/`, label: "Regulamin" },
  { href: `${SITE}/privacy/`, label: "Polityka prywatności" },
  { href: `${SITE}/cookies/`, label: "Polityka cookies" },
];

const LegalPage: React.FC<{ title: string; points: string[] }> = ({ title, points }) => (
  <div className="min-h-screen bg-white">
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-8">
        <ArrowLeft className="w-4 h-4" /> Strona główna
      </Link>
      <h1 className="text-3xl font-bold mb-2 text-gray-900">{title} — HRL Nova Campus</h1>
      <p className="text-xs text-gray-500 mb-8">
        Obowiązuje od 11 października 2026 r. · Kamil Skomra, HardbanRecords Lab
      </p>
      <p className="text-gray-700 leading-relaxed text-sm mb-6">
        HRL Nova Campus jest częścią HardbanRecords Lab. Obowiązują wspólne dokumenty całej platformy.
        Najważniejsze zasady dotyczące tej aplikacji:
      </p>
      <ul className="list-disc pl-5 space-y-2 text-gray-700 leading-relaxed text-sm mb-8">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        {DOCS.map((d) => (
          <a
            key={d.href}
            href={d.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 hover:bg-gray-50"
          >
            {d.label} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-8">
        Kontakt w sprawach prawnych i danych osobowych: legal@hardbanrecordslab.online
      </p>
    </div>
  </div>
);

export default LegalPage;
