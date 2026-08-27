import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Mail, Lock, User as UserIcon, UserPlus, CheckCircle2, AlertCircle } from "lucide-react";

export const Register: React.FC = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useApp();
  const navigate = useNavigate();

  // Password Strength Calculation
  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const strength = getPasswordStrength(password);

  const getStrengthLabel = () => {
    if (!password) return { label: "", color: "bg-zinc-800" };
    if (strength <= 2) return { label: "Słabe", color: "bg-rose-500" };
    if (strength <= 4) return { label: "Średnie", color: "bg-amber-500" };
    return { label: "Silne", color: "bg-emerald-500" };
  };

  const strengthInfo = getStrengthLabel();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) {
      addToast("Wszystkie pola są wymagane", "warning");
      return;
    }

    if (password.length < 6) {
      addToast("Hasło musi posiadać co najmniej 6 znaków", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, role: "student" })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Błąd podczas rejestracji");
      }

      addToast("Zarejestrowano pomyślnie! Zaloguj się na nowe konto.", "success");
      navigate("/login");
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="register-page-wrapper" className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl relative">
        <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent" />

        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 bg-violet-600/10 rounded-xl mb-3 text-violet-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-display font-semibold text-white tracking-tight">
              Dołącz do HRL Academy
            </h2>
            <p className="text-sm text-zinc-400 mt-2">
              Utwórz konto i zacznij certyfikowaną naukę
            </p>
          </div>

          <form id="register-form" onSubmit={handleRegister} className="space-y-5">

            <div className="space-y-1">
              <label htmlFor="register-input-username" className="block text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Nazwa Użytkownika <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                <input
                  id="register-input-username"
                  type="text"
                  required
                  aria-required="true"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="np. mariuszhans"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="register-input-email" className="block text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Adres e-mail <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                <input
                  id="register-input-email"
                  type="email"
                  required
                  aria-required="true"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="np. mariusz@gmail.com"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label htmlFor="register-input-password" className="block text-xs font-mono text-zinc-400 uppercase tracking-wider">
                  Hasło dostępowe <span className="text-rose-500">*</span>
                </label>
                {password && (
                  <span className="text-xs font-mono text-zinc-400">
                    Siła: <span className={strength <= 2 ? "text-rose-400" : strength <= 4 ? "text-amber-400" : "text-emerald-400"}>{strengthInfo.label}</span>
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                <input
                  id="register-input-password"
                  type="password"
                  required
                  aria-required="true"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:text-zinc-600"
                />
              </div>

              {/* Password strength bar indicator */}
              {password && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden flex gap-1 p-0.5 border border-zinc-800">
                    <div className={`h-full rounded-full transition-all duration-300 ${strength >= 1 ? strengthInfo.color : "bg-transparent"}`} style={{ width: "20%" }} />
                    <div className={`h-full rounded-full transition-all duration-300 ${strength >= 2 ? strengthInfo.color : "bg-transparent"}`} style={{ width: "20%" }} />
                    <div className={`h-full rounded-full transition-all duration-300 ${strength >= 3 ? strengthInfo.color : "bg-transparent"}`} style={{ width: "20%" }} />
                    <div className={`h-full rounded-full transition-all duration-300 ${strength >= 4 ? strengthInfo.color : "bg-transparent"}`} style={{ width: "20%" }} />
                    <div className={`h-full rounded-full transition-all duration-300 ${strength >= 5 ? strengthInfo.color : "bg-transparent"}`} style={{ width: "20%" }} />
                  </div>
                  <p className="text-[11px] text-zinc-500 font-sans">
                    Użyj co najmniej 8 znaków, wielkiej litery, cyfry i znaku specjalnego.
                  </p>
                </div>
              )}
            </div>

            <button
              id="register-submit-button"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-violet-600/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {isSubmitting ? "Tworzenie konta..." : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Zarejestruj się
                </>
              )}
            </button>
          </form>

          <div className="text-center mt-6 text-sm text-zinc-500">
            Masz już konto?{" "}
            <Link id="register-link-login" to="/login" className="text-violet-400 hover:underline font-medium">
              Zaloguj się
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
