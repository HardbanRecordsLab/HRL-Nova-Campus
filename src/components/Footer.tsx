import React from "react";
import { Link } from "react-router-dom";

export const Footer: React.FC = () => {
  return (
    <footer id="main-footer" className="bg-[#0a1120] border-t border-cyan-500/10 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-zinc-500 text-sm">
          <img src="/icon.svg" alt="HRL Nova Campus" className="w-7 h-7 rounded-lg" />
          <span>&copy; {new Date().getFullYear()} Hardban Records Lab &middot; <span className="text-cyan-300/70 font-mono text-xs uppercase tracking-wider">Learn · Create · Evolve</span></span>
        </div>
        <div className="flex gap-6 text-xs font-mono text-zinc-500 uppercase tracking-widest">
          <Link to="/terms" className="hover:text-cyan-400 transition-colors">Regulamin</Link>
          <span className="hidden sm:inline">|</span>
          <Link to="/privacy" className="hover:text-cyan-400 transition-colors">Polityka Prywatności</Link>
        </div>
      </div>
    </footer>
  );
};
