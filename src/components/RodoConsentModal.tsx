import React, { useState } from "react";
import { Award, ShieldCheck, X } from "lucide-react";
import { useApp } from "../context/AppContext";

interface RodoConsentModalProps {
  certificateCode: string;
  onClose: () => void;
}

export const RodoConsentModal: React.FC<RodoConsentModalProps> = ({ certificateCode, onClose }) => {
  const { token, addToast } = useApp();
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/certificates/${certificateCode}/consent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ consent })
      });
      if (res.ok) {
        addToast(
          consent
            ? "Dziękujemy! Twój wpis pojawi się w publicznej bazie absolwentów."
            : "Zapisano — Twoje dane nie zostaną opublikowane.",
          "success"
        );
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.message || "Nie udało się zapisać zgody.", "error");
      }
    } catch (err: any) {
      addToast("Błąd sieci: " + err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="rodo-consent-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-lg bg-zinc-950 border-2 border-amber-500/30 rounded-3xl p-8 space-y-6 shadow-2xl">
        <button
          id="rodo-consent-close"
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-display font-semibold text-white">Gratulacje z ukończeniem kursu!</h3>
            <p className="text-xs text-zinc-500 font-mono">Certyfikat: {certificateCode}</p>
          </div>
        </div>

        <p className="text-sm text-zinc-400 leading-relaxed">
          Twój certyfikat został wydany. Chcesz, aby Twoje imię i nazwisko oraz nazwa ukończonego
          kursu pojawiły się w publicznej, przeszukiwalnej bazie absolwentów HRL Academy? To
          całkowicie dobrowolne — możesz zmienić zdanie w każdej chwili.
        </p>

        <label
          id="rodo-consent-checkbox-label"
          className="flex items-start gap-3 p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl cursor-pointer hover:border-amber-500/40 transition-colors"
        >
          <input
            id="rodo-consent-checkbox"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-amber-500 flex-shrink-0"
          />
          <span className="text-xs text-zinc-300 leading-relaxed">
            Zgadzam się na publikację mojego imienia i nazwiska oraz nazwy ukończonego kursu w
            publicznej bazie absolwentów HRL Academy.
          </span>
        </label>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Certyfikat pozostaje ważny niezależnie od Twojej decyzji.</span>
        </div>

        <button
          id="rodo-consent-submit"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full px-5 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
        >
          {submitting ? "Zapisywanie..." : "Zapisz decyzję"}
        </button>
      </div>
    </div>
  );
};
