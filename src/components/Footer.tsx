import React from "react";
import { Disc } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer id="main-footer" className="bg-zinc-950 border-t border-zinc-900 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-zinc-500 text-sm">
          <img src="/logo_3d.jpg" alt="Logo 3D" className="w-6 h-6 rounded-lg object-cover border border-zinc-800" />
          <span>&copy; {new Date().getFullYear()} Hardban Records Lab. Wszystkie prawa zastrzeżone.</span>
        </div>
        <div className="flex gap-6 text-xs font-mono text-zinc-500 uppercase tracking-widest">
          <span>Enterprise B2B SLA Verified</span>
          <span className="hidden sm:inline">|</span>
          <a href="#" className="hover:text-violet-400 transition-colors">Polityka Bezpieczeństwa</a>
          <span className="hidden sm:inline">|</span>
          <a href="#" className="hover:text-violet-400 transition-colors">API Spec</a>
        </div>
      </div>
    </footer>
  );
};
