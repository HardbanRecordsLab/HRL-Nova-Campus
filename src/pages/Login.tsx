import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Mail, Lock, LogIn, Sparkles } from "lucide-react";

export const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, addToast } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      addToast("Wpisz swoje dane logowania", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Błąd uwierzytelniania");
      }

      login(data.user, data.token);
      navigate("/");
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="login-page-wrapper" className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl relative">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent" />

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex p-3 bg-violet-600/10 rounded-xl mb-3 text-violet-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-display font-semibold text-white tracking-tight">
              Witaj ponownie w HRL
            </h2>
            <p className="text-sm text-zinc-400 mt-2">
              Zaloguj się, aby kontynuować edukacyjną podróż
            </p>
          </div>

          {/* Form */}
          <form id="login-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Adres E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                <input
                  id="login-input-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="np. mariusz@hardban.com"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none transition-all placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Hasło dostępowe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                <input
                  id="login-input-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none transition-all placeholder:text-zinc-600"
                />
              </div>
            </div>

            <button
              id="login-submit-button"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-violet-600/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Autoryzacja..." : (
                <>
                  <LogIn className="w-4 h-4" />
                  Zaloguj SIę
                </>
              )}
            </button>
          </form>

          <div className="text-center mt-6 text-sm text-zinc-500">
            Nie masz konta?{" "}
            <Link id="login-link-register" to="/register" className="text-violet-400 hover:underline">
              Zarejestruj się
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
