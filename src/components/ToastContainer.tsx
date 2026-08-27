import React from "react";
import { useApp } from "../context/AppContext";
import { CheckCircle, AlertTriangle, Info, X, AlertCircle } from "lucide-react";

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div id="toast-container" className="fixed top-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const bgClass = {
          success: "bg-emerald-950/90 border-emerald-500 text-emerald-200",
          error: "bg-red-950/90 border-red-500 text-red-200",
          warning: "bg-amber-950/90 border-amber-500 text-amber-200",
          info: "bg-blue-950/90 border-blue-500 text-blue-200"
        }[toast.type] || "bg-zinc-900 border-zinc-700 text-zinc-200";

        const Icon = {
          success: CheckCircle,
          error: AlertCircle,
          warning: AlertTriangle,
          info: Info
        }[toast.type] || Info;

        return (
          <div
            key={toast.id}
            id={`toast-${toast.id}`}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border blurred-backdrop shadow-2xl transition-all duration-300 animate-slide-in`}
          >
            <div className={`flex-shrink-0 p-1 rounded-lg ${bgClass}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-grow text-sm font-medium leading-relaxed text-zinc-100">
              {toast.message}
            </div>
            <button
              id={`close-toast-${toast.id}`}
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
