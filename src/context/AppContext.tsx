import React, { createContext, useState, useEffect, useContext, ReactNode } from "react";
import { User, Toast, ActivityLog } from "../types";

interface AppContextType {
  user: User | null;
  token: string | null;
  toasts: Toast[];
  logs: ActivityLog[];
  login: (user: User, token: string) => void;
  logout: () => void;
  addToast: (message: string, type?: Toast["type"], duration?: number) => void;
  removeToast: (id: string) => void;
  isSocketConnected: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("hrl_user");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Failed to parse user from localStorage", e);
      localStorage.removeItem("hrl_user");
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("hrl_token");
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);

  // Authentication Helpers
  const login = (userData: User, userToken: string) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem("hrl_user", JSON.stringify(userData));
    localStorage.setItem("hrl_token", userToken);
    addToast(`Zalogowano pomyślnie jako ${userData.username}`, "success");
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("hrl_user");
    localStorage.removeItem("hrl_token");
    addToast("Wylogowano pomyślnie z platformy HRL", "info");
  };

  // Toast Helpers
  const addToast = (message: string, type: Toast["type"] = "info", duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // WebSocket Connection
  useEffect(() => {
    // VITE_WS_URL points at the VPS backend when frontend/backend are split (e.g. Vercel + VPS).
    // Falls back to same-origin for the monolith (backend serving its own built frontend).
    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
    let socket: WebSocket;

    const connectWS = () => {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setIsSocketConnected(true);
        console.log("WebSocket connected to HRL Academy Server");
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === "ACTIVITY_LOG") {
            const newLog = message.data as ActivityLog;
            setLogs((prev) => [newLog, ...prev.slice(0, 99)]); // Keep last 100 logs
            
            // Proactively show reactive toasts for admin audits or general milestones
            if (newLog.event_type === "certificate_generated") {
              addToast(`Gratulacje! Wygenerowano nowy certyfikat dla użytkownika.`, "success", 6000);
            }
          } else if (message.type === "SYSTEM_CONNECTED") {
            console.log("System connection established", message.data);
          }
        } catch (err) {
          console.error("Error parsing socket message", err);
        }
      };

      socket.onclose = () => {
        setIsSocketConnected(false);
        // Clean reconnection interval without throwing
        setTimeout(() => {
          if (socket.readyState === WebSocket.CLOSED) {
            connectWS();
          }
        }, 5000);
      };

      socket.onerror = () => {
        // Suppress loud error outputs for expected transient proxy drops
        setIsSocketConnected(false);
      };
    };

    connectWS();

    return () => {
      if (socket) socket.close();
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
        token,
        toasts,
        logs,
        login,
        logout,
        addToast,
        removeToast,
        isSocketConnected
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
