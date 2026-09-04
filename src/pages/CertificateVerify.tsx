import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Award, ShieldCheck, Search, HelpCircle, Calendar, Disc, Share2, Clipboard, Globe, AlertCircle } from "lucide-react";

interface VerifiedCert {
  valid: boolean;
  code: string;
  student: string | null;
  course: string;
  issued_at: string;
  qr_payload_url: string | null;
  is_public: boolean;
}

export const CertificateVerify: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { addToast } = useApp();
  
  const [searchCode, setSearchCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [certificate, setCertificate] = useState<VerifiedCert | null>(null);
  const [searched, setSearched] = useState(false);

  const queryCode = searchParams.get("code");

  const verifyCode = async (codeToVerify: string) => {
    if (!codeToVerify.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/verify-certificate/${codeToVerify.trim()}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        setCertificate(data);
        addToast("Certyfikat seryjny zweryfikowany pomyślnie!", "success");
      } else {
        setCertificate(null);
        addToast(data.message || "Brak ważnego dyplomu o podanym kodzie seryjnym", "error");
      }
    } catch (err) {
      console.error("Error verifying serial certificate code", err);
      setCertificate(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (queryCode) {
      setSearchCode(queryCode);
      verifyCode(queryCode);
    }
  }, [queryCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyCode(searchCode);
  };

  const copyShareLink = () => {
    if (!certificate) return;
    const shareUrl = `${window.location.origin}/certificate-verify?code=${certificate.code}`;
    navigator.clipboard.writeText(shareUrl);
    addToast("Skopiowano link do weryfikacji do schowka!", "success");
  };

  return (
    <div id="certificate-verify-portal" className="max-w-3xl mx-auto py-8 space-y-12">
      
      {/* Search Bar section */}
      <section className="text-center space-y-4 max-w-xl mx-auto">
        <div className="inline-flex p-3 bg-amber-500/10 rounded-xl text-amber-500">
          <Award className="w-6 h-6 animate-pulse" />
        </div>
        <h2 className="text-3xl font-display font-semibold tracking-tight text-white leading-tight">
          Publiczny Rejestr Certyfikatów HRL
        </h2>
        <p className="text-sm text-zinc-400">
          Wprowadź alfanumeryczny kod seryjny dyplomu, aby potwierdzić autentyczność ukończenia szkoleń inżynierskich w Hardban Records Lab.
        </p>

        <form id="verify-code-form" onSubmit={handleSubmit} className="pt-2">
          <div className="relative flex items-center bg-zinc-90 w-full bg-zinc-900 border border-zinc-800 focus-within:border-amber-500 rounded-2xl p-1.5 transition-all">
            <Search className="w-4 h-4 text-zinc-500 ml-3 flex-shrink-0" />
            <input
              id="verify-input-code"
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              placeholder="np. HRL-ACAD-J7F6D-171732-F22B"
              className="w-full bg-transparent border-0 focus:ring-0 text-white pl-3 text-sm focus:outline-none placeholder:text-zinc-650"
            />
            <button
              id="verify-code-submit"
              type="submit"
              disabled={loading || !searchCode.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex-shrink-0"
            >
              {loading ? "Szukam..." : "Weryfikuj"}
            </button>
          </div>
        </form>
      </section>

      {/* Main Results View */}
      <div id="verification-result">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-zinc-400 text-xs font-mono">Przeszukiwanie baz danych B2B...</span>
          </div>
        ) : certificate ? (
          
          /* GORGEOUS GOLDEN DESIGNED CERTIFICATE REPRESENTATION */
          <div
            id="verified-certificate-card animate-fade-in"
            className="bg-zinc-950 border-2 border-amber-500/30 rounded-3xl p-8 md:p-12 relative overflow-hidden space-y-8 shadow-2xl relative"
          >
            {/* Background design accents */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/5 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute top-4 right-4 text-amber-500 opacity-5">
              <Award className="w-56 h-56" />
            </div>

            {/* Header certified tag */}
            <div className="flex items-center justify-between gap-4 border-b border-amber-500/20 pb-6 flex-wrap">
              <div className="flex items-center gap-3">
                <Disc className="w-5 h-5 text-amber-500 animate-spin-pulse" />
                <span className="font-display font-medium text-xs tracking-widest text-amber-400 uppercase font-bold leading-none">
                  HRL ACADEMY OFFICIAL RECORD
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-800/40 rounded-full text-xs font-mono text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>STATUS: VERIFIED (AKTUALNY)</span>
              </div>
            </div>

            {/* Recipient body description */}
            <div className="space-y-4 text-center py-4 relative">
              <p className="text-zinc-400 text-sm italic font-serif">Niniejszym potwierdza się, że student</p>
              <h3 className="text-3xl md:text-4xl font-display font-semibold text-white tracking-widest uppercase">
                {certificate.student ?? "Zweryfikowany Absolwent"}
              </h3>
              {!certificate.student && (
                <p className="text-[10px] text-zinc-500 font-mono">
                  Absolwent nie wyraził zgody na publikację danych osobowych w rejestrze.
                </p>
              )}
              <p className="text-zinc-400 text-sm italic font-serif leading-relaxed">
                pomyślnie zaliczył wszystkie moduły, lekcje techniczne oraz wymagane testy wiedzy i uzyskał dyplom ukończenia kursu programowego klasy Enterprise
              </p>
              <h4 className="text-gradient font-display text-xl md:text-2xl font-bold tracking-tight">
                {certificate.course}
              </h4>
            </div>

            {/* Serial code, issue date and verify shares */}
            <div className="border-t border-amber-500/20 pt-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none">NUMER SERYJNY CERTYFIKATU</span>
                <span className="block text-sm font-mono text-amber-300 font-bold leading-none">{certificate.code}</span>
              </div>

              <div className="space-y-2 text-center md:text-left">
                <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none">DATA WYSTANIA</span>
                <span className="block text-xs text-zinc-300 font-mono flex items-center justify-center md:justify-start gap-1 leading-none">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  {new Date(certificate.issued_at).toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric" })}
                </span>
              </div>

              {certificate.qr_payload_url && (
                <img
                  id="cert-qr-code"
                  src={certificate.qr_payload_url}
                  alt="Kod QR weryfikacji certyfikatu"
                  className="w-20 h-20 rounded-lg border border-amber-500/30 bg-white p-1 flex-shrink-0"
                />
              )}

              <div className="flex gap-2 flex-shrink-0">
                <button
                  id="cert-btn-copy"
                  onClick={copyShareLink}
                  className="px-4 py-2.5 bg-zinc-90 w-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Clipboard className="w-4 h-4" />
                  Kopiuj Link
                </button>
              </div>
            </div>

          </div>
        ) : searched ? (
          
          /* Empty/Fail report fallback */
          <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-3xl max-w-xl mx-auto space-y-4">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <h3 className="text-white font-medium text-base">Niepoprawny kod certyfikatu</h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
              Certyfikat o kodzie seryjnym <span className="font-mono text-red-400">{searchCode}</span> nie widnieje w rejestrach HRL Academy. Upewnij się, że wpisałeś go poprawnie (często ze złą wielkością liter lub bez myślników).
            </p>
          </div>
        ) : (
          /* Simple placeholder welcome card */
          <div className="p-12 text-center border border-dashed border-zinc-800 rounded-3xl max-w-xl mx-auto text-zinc-500 space-y-3">
            <Globe className="w-10 h-10 mx-auto text-amber-500 opacity-40 animate-pulse" />
            <h3 className="text-zinc-300 font-medium text-sm">Wprowadź kod seryjny</h3>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Jeżeli otrzymałeś certyfikat od studenta HRL Academy Core, wprowadź jego kod powyżej, aby natychmiastowo zwerfikować cyfrowe poświadczenie ukończenia szkolenia.
            </p>
          </div>
        )}
      </div>

    </div>
  );
};
