import React from "react";
import { Disc } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer id="main-footer" className="bg-[#0a1120] border-t border-cyan-500/10 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-zinc-500 text-sm">
          <img src="/logo_3d.jpg" alt="HRL Nova Campus" className="w-7 h-7 rounded-lg object-cover p-0.5 brand-logo-tile" />
          <span>&copy; {new Date().getFullYear()} Hardban Records Lab &middot; <span className="text-cyan-300/70 font-mono text-xs uppercase tracking-wider">Learn · Create · Evolve</span></span>
        </div>
        <div className="flex gap-6 text-xs font-mono text-zinc-500 uppercase tracking-widest">
          <span>Enterprise B2B SLA Verified</span>
          <span className="hidden sm:inline">|</span>
          <a href="#" className="hover:text-cyan-400 transition-colors">Polityka Bezpieczeństwa</a>
          <span className="hidden sm:inline">|</span>
          <a href="#" className="hover:text-cyan-400 transition-colors">API Spec</a>
        </div>
      </div>
    </footer>
  );
};
