import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Disc, ShieldAlert, LogOut, LayoutDashboard, UserCheck, GraduationCap, Award, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Navigation: React.FC = () => {
  const { user, logout, isSocketConnected } = useApp();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const handleLogoutClick = () => {
    logout();
    navigate("/");
  };

  const toggleLanguage = () => {
    const nextLng = i18n.language === 'pl' ? 'en' : 'pl';
    i18n.changeLanguage(nextLng);
  };

  return (
    <nav id="main-navigation" className="sticky top-0 z-40 bg-zinc-950/80 border-b border-zinc-800 blurred-backdrop">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Telemetry Indicator */}
          <div className="flex items-center gap-6">
            <Link id="nav-brand-logo" to="/" className="flex items-center gap-3 group">
              <div className="relative p-0.5 bg-gradient-to-tr from-violet-600 via-amber-400 to-pink-500 rounded-2xl group-hover:scale-105 transition-transform shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                <img
                  src="/logo_3d.jpg"
                  alt="HRL Pro Logo"
                  className="w-9 h-9 rounded-xl object-cover border border-zinc-900"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-display font-bold text-lg leading-none tracking-tight text-white flex items-center gap-1.5">
                  HRL Academy
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-gradient-to-r from-amber-500/20 to-violet-500/20 border border-amber-500/30 text-amber-300 rounded-md">
                    PRO 3D
                  </span>
                </span>
                <span className="text-[10px] font-mono tracking-wider text-zinc-400 font-medium uppercase leading-none mt-1">
                  Digital Sovereignty Core
                </span>
              </div>
            </Link>

            {/* Socket connection dot */}
            <div
              id="ws-status-badge"
              className="hidden sm:flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-[11px] font-mono"
              title={isSocketConnected ? "Konwergencja WebSocket aktywna" : "Rozłączono z bramką serwera"}
            >
              <span className={`w-2 h-2 rounded-full ${isSocketConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
              <span className="text-zinc-400">{isSocketConnected ? "LIVE" : "OFFLINE"}</span>
            </div>
          </div>

          {/* Links */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink
              id="nav-link-courses"
              to="/"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive ? "bg-zinc-800 text-white font-semibold" : "text-zinc-400 hover:text-white"
                }`
              }
            >
               {t('courses') || "Kursy"}
            </NavLink>

            <NavLink
              id="nav-link-certificate-verify"
              to="/certificate-verify"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive ? "bg-zinc-800 text-white font-semibold" : "text-zinc-400 hover:text-white"
                }`
              }
            >
              Weryfikacja Dyplomów
            </NavLink>

            {/* Student Panel links */}
            {user && (
              <NavLink
                id="nav-link-student"
                to="/student"
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    isActive ? "bg-zinc-800 text-white font-semibold" : "text-zinc-400 hover:text-white"
                  }`
                }
              >
                <Award className="w-4 h-4" />
                {t('student_panel') || "Panel Kursanta"}
              </NavLink>
            )}

            {/* Admin only links */}
            {user && user.role === "admin" && (
              <NavLink
                id="nav-link-admin"
                to="/admin"
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    isActive ? "bg-zinc-805 bg-violet-950/40 border border-violet-800/40 text-violet-200 font-semibold" : "text-violet-400 hover:text-violet-200"
                  }`
                }
              >
                <ShieldAlert className="w-4 h-4" />
                Administracja
              </NavLink>
            )}
          </div>

          {/* Profile list or login action */}
          <div className="flex items-center gap-3">
            <button
               onClick={toggleLanguage}
               className="p-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-violet-400 rounded-xl transition-all cursor-pointer flex items-center gap-2 font-mono text-[10px] font-bold"
               title="Zmień język"
            >
               <Globe className="w-4 h-4" />
               {i18n.language === 'pl' ? 'ENG' : 'PL'}
            </button>
            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-zinc-800">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-sm font-semibold text-zinc-100 leading-tight">
                    {user.username}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest leading-none mt-1">
                    {user.role === "admin" ? "ADMINISTRATOR" : "STUDENT"}
                  </span>
                </div>
                <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300">
                  <UserCheck className="w-4 h-4" />
                </div>
                <button
                  id="nav-button-logout"
                  onClick={handleLogoutClick}
                  className="p-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-red-400 rounded-xl transition-all cursor-pointer"
                  title="Wyloguj się"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pl-4 border-l border-zinc-800">
                <Link
                  id="nav-link-login"
                  to="/login"
                  className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
                >
                  Zaloguj
                </Link>
                <Link
                  id="nav-link-register"
                  to="/register"
                  className="px-4 py-2 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white rounded-xl text-sm font-medium transition-all shadow-lg hover:shadow-violet-600/20"
                >
                  Rejestracja
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
