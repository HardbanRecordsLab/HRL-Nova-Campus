import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { 
  Terminal, 
  Send, 
  RefreshCw, 
  MessageSquare, 
  ArrowUpRight, 
  Cpu, 
  ShieldCheck, 
  CheckCircle,
  HelpCircle
} from "lucide-react";

interface StudentEnterpriseToolsProps {
  courseId: number;
  courseTitle: string;
  isEnrolled: boolean;
}

export const StudentEnterpriseTools: React.FC<StudentEnterpriseToolsProps> = ({
  courseId,
  courseTitle,
  isEnrolled,
}) => {
  const { token, user, addToast } = useApp();

  // JWT External Launch states
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [tokenPayload, setTokenPayload] = useState<any>(null);
  const [loadingLaunch, setLoadingLaunch] = useState(false);

  // Sync Progress states
  const [syncPercent, setSyncPercent] = useState(85);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);

  // Chat Support states
  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  // Analytics event states
  const [trackedEvents, setTrackedEvents] = useState<any[]>([]);

  // 1. Initialize Conversation and load past support chats
  useEffect(() => {
    if (!token || !user || !isEnrolled) return;

    const initChat = async () => {
      try {
        setLoadingChat(true);
        // Init/get a support conversation specifically for this course
        const res = await fetch("/api/messages/conversations/init", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: `Wsparcie: ${courseTitle}` }),
        });

        if (res.ok) {
          const conv = await res.json();
          setConversation(conv);
          fetchMessages(conv.id);
        }
      } catch (err) {
        console.error("Failed to load help messages", err);
      } finally {
        setLoadingChat(false);
      }
    };

    initChat();
  }, [token, user, isEnrolled, courseId]);

  const fetchMessages = async (convId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/messages/conversations/${convId}/messages`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 2. Fetch Signed JWT External Launch URL
  const handleGenerateLaunchToken = async () => {
    if (!token) {
      addToast("Musisz się zalogować", "warning");
      return;
    }
    try {
      setLoadingLaunch(true);
      const res = await fetch("/api/access/launch", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ courseId }),
      });

      const resData = await res.json();
      if (res.ok && resData.launchUrl) {
        setLaunchUrl(resData.launchUrl);
        addToast("Wygenerowano podpisany token dostępowy JWT!", "success");

        // Parse/decode the token fragment to display JWT claims beautifully
        try {
          const urlObj = new URL(resData.launchUrl);
          const tknStr = urlObj.searchParams.get("token");
          if (tknStr) {
            const parts = tknStr.split(".");
            if (parts.length === 3) {
              const decoded = JSON.parse(atob(parts[1]));
              setTokenPayload(decoded);
            }
          }
        } catch (_) {}

        // Track analytics event
        trackEvent("course_external_launch_pushed", { url: resData.launchUrl });
      } else {
        addToast(resData.message || "Błąd generowania dostępu zewnętrznego", "error");
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoadingLaunch(false);
    }
  };

  // 3. Manual Cloud Progress Sync
  const handleProgressSync = async () => {
    if (!token) return;
    try {
      setSyncing(true);
      const res = await fetch("/api/progress/sync", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId,
          percentage: syncPercent,
          completedLessons: 4,
          totalLessons: 5,
          minutesSpent: 120,
          lesson: "Zarządzanie stanem i JWT",
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        setLastSyncResult(resData);
        addToast("Sukces! Wynik zsynchronizowany z bazą chmurową", "success");
        trackEvent("course_progress_synchronized", { percentage: syncPercent });
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  // 4. Send Message to support conversation
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newMessage.trim() || !conversation) return;

    try {
      setSendingMsg(true);
      const res = await fetch(`/api/messages/${conversation.id}/send`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: newMessage.trim() }),
      });

      if (res.ok) {
        // Optimistic update
        const tempMsg = {
          id: Date.now(),
          sender_name: user?.username || "Ty",
          body: newMessage.trim(),
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, tempMsg]);
        setNewMessage("");

        // Auto answer stimulation
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              sender_name: "Asystent HRL",
              body: `Otrzymaliśmy Twoje pytanie dotyczące kursu "${courseTitle}". Nasz koordynator merytoryczny przeanalizuje je w przeciągu 15 minut.`,
              created_at: new Date().toISOString(),
            },
          ]);
        }, 1200);

        // Track event
        trackEvent("client_support_chat_sent", { courseId });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingMsg(false);
    }
  };

  // 5. Trigger telemetry/analytics events logger
  const trackEvent = async (eventName: string, props: any) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      await fetch("/api/events/track", {
        method: "POST",
        headers,
        body: JSON.stringify({ eventName, courseId, properties: props }),
      });

      // Keep local log snapshot for UI visualization
      setTrackedEvents((prev) => [
        {
          id: Date.now(),
          eventName,
          timestamp: new Date().toLocaleTimeString(),
          props,
        },
        ...prev,
      ]);
    } catch (err) {
      console.error("Telemetry failed", err);
    }
  };

  return (
    <div className="space-y-6 pt-6 border-t border-zinc-800">
      <div className="flex items-center gap-2 mb-2">
        <Cpu className="w-5 h-5 text-violet-400" />
        <h3 className="font-display font-semibold text-lg text-white">
          Ulepszenia Platformy & Pulpit Techniczny LTI
        </h3>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Wszystkie nowo wdrożone zaawansowane funkcje i ulepszenia chmurowe (JWT Gateway, synchroniczne support pipeline i telemetry) są teraz połączone w poniższym pulpicie integracyjnym bezpośrednio dla tego kursu!
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PANEL A: JWT / LTI Portal Launcher Gate */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <span className="text-xs font-mono font-bold uppercase text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Zewnętrzny Launch JWT (LTI)
            </span>
            <span className="text-[10px] font-mono bg-zinc-950 px-2 py-0.5 rounded text-zinc-500 uppercase tracking-widest">
              LTI Gateway Active
            </span>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-zinc-400 leading-normal">
              Ta technologia pozwala na bezpieczne zalogowanie studenta do zewnętrznych platform partnerskich (np. JupyterLab, wirtualne laby HRL) za pomocą jednorazowych, podpisanych certyfikatów JWT.
            </p>
          </div>

          {!isEnrolled ? (
            <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-xl text-[11px] font-mono text-red-400 text-center">
              Zapisz się do kursu, aby uzyskać dostęp i korzystać z integracji LTI z zewnętrznym systemem.
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateLaunchToken}
                  disabled={loadingLaunch}
                  className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-800 hover:text-white text-zinc-300 font-mono text-xs font-bold rounded-xl border border-zinc-800 hover:border-zinc-700 cursor-pointer flex items-center justify-center gap-2 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-violet-400 ${loadingLaunch ? "animate-spin" : ""}`} />
                  {loadingLaunch ? "Uwierzytelnianie..." : "Wygeneruj Uwierzytelnienie JWT"}
                </button>
              </div>

              {launchUrl && (
                <div className="space-y-3 pt-2">
                  <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2">
                    <span className="text-[10px] font-mono text-zinc-500 block">Zaszyfrowany Token w parametrze URL</span>
                    <input
                      type="text"
                      readOnly
                      value={launchUrl}
                      className="w-full bg-zinc-900 text-zinc-300 border border-zinc-850 p-2 rounded-lg text-[10px] font-mono focus:outline-none"
                    />
                    <a
                      href={launchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 font-bold"
                    >
                      Uruchom port partnerski (Nowa karta)
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {tokenPayload && (
                    <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-850 space-y-1">
                      <span className="text-[10px] uppercase font-mono text-zinc-400 tracking-wider font-bold flex items-center gap-1.5">
                        <Terminal className="w-3 h-3 text-emerald-400" />
                        Dekodery JWT Claims (Claims Payload)
                      </span>
                      <pre className="text-[10px] font-mono text-emerald-300 bg-zinc-950/60 p-2 rounded overflow-x-auto leading-relaxed">
                        {JSON.stringify(tokenPayload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* PANEL B: Live Support Chat Widget */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <span className="text-xs font-mono font-bold uppercase text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-violet-400" />
              Komunikator Wspierający (Support Hub)
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="Konsultant HRL online" />
          </div>

          {!user ? (
            <div className="text-center p-8 bg-zinc-950 rounded-xl">
              <HelpCircle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">Zaloguj się, aby rozmawiać z konsultantem dydaktycznym.</p>
            </div>
          ) : (
            <div className="flex-grow flex flex-col h-[280px]">
              {/* Chat Messages */}
              <div className="flex-grow overflow-y-auto mb-3 space-y-2 p-2 bg-zinc-950/40 border border-zinc-850 rounded-xl custom-scrollbar">
                {loadingChat ? (
                  <div className="text-center py-10 font-mono text-xs text-zinc-500">Ładowanie wiadomości pomocy...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10 text-zinc-500 max-w-xs mx-auto text-xs flex flex-col items-center justify-center gap-2">
                    <MessageSquare className="w-6 h-6 text-zinc-700" />
                    <span>Masz pytanie naukowe dotyczące {courseTitle}? Napisz do swojego Mentora poniżej!</span>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMyMsg = m.sender_name !== "Asystent HRL" && m.sender_name !== "Support HRL";
                    return (
                      <div
                        key={m.id}
                        className={`max-w-[85%] p-2.5 rounded-xl text-xs space-y-1 ${
                          isMyMsg
                            ? "bg-violet-950/30 border border-violet-800/40 text-violet-200 ml-auto text-right"
                            : "bg-zinc-950 border border-zinc-850 text-zinc-300"
                        }`}
                      >
                        <div className="text-[9px] font-mono text-zinc-500">
                          {m.sender_name} • {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Zadaj pytanie mentorowi..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-grow bg-zinc-950 border border-zinc-800/80 rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-all font-mono"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !newMessage.trim()}
                  className="p-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-all cursor-pointer flex items-center justify-center disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER ROW: Interactive Progress Sync and Logs Telemetry Console */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        {/* Sync Progress Slider Console */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-4 md:col-span-1">
          <span className="text-xs font-mono font-bold uppercase text-white flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-pink-400" />
            Synchronizacja Postępu
          </span>
          <p className="text-xs text-zinc-400 leading-normal">
            Trwały mechanizm synchronizacji postępów zapisuje Twoje lekcje i czasy w chmurowej bazie danych. Zmień suwak i wyślij:
          </p>

          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
                <span>Zaliczony postęp:</span>
                <span className="text-pink-400 font-bold">{syncPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={syncPercent}
                onChange={(e) => setSyncPercent(Number(e.target.value))}
                className="w-full accent-pink-500 cursor-pointer h-1.5 bg-zinc-950 rounded-lg appearance-none"
              />
            </div>

            <button
              onClick={handleProgressSync}
              disabled={syncing || !isEnrolled}
              className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-pink-500 hover:opacity-90 disabled:opacity-40 text-white font-mono text-xs font-bold uppercase tracking-wide rounded-xl shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-white ${syncing ? "animate-spin" : ""}`} />
              Wyślij do chmury
            </button>

            {lastSyncResult && (
              <div className="p-2.5 bg-zinc-950 border border-zinc-850 rounded-xl text-[10px] font-mono text-emerald-400 text-center flex items-center justify-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Stan: Postęp zsynchronizowany OK</span>
              </div>
            )}
          </div>
        </div>

        {/* Telemetry Console (Real-Time Events log viewer) */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-3 md:col-span-2">
          <span className="text-xs font-mono font-bold uppercase text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-violet-400" />
            Telemetria i Dziennik Aktywności (Analytics Tracker console)
          </span>
          <p className="text-xs text-zinc-400 leading-normal">
            Dziennik telemetrii śledzi zdarzenia i loguje je bezpośrednio do tabeli i aktywności chmurowej przy pomocy wywołań <code className="bg-zinc-950 px-1 rounded text-violet-400 text-[11px] font-mono">/api/events/track</code>. Wykonaj dowolną akcję powyżej, a pojawi się tutaj:
          </p>

          <div className="bg-zinc-950 border border-zinc-850 p-3 rounded-xl h-[120px] overflow-y-auto font-mono text-[10px] text-zinc-400 leading-relaxed space-y-1.5">
            {trackedEvents.length === 0 ? (
              <span className="text-zinc-600 block text-center py-6">Konsola telemetrii gotowa do zapisu... Wygeneruj token, napisz wiadomość lub wyślij postęp.</span>
            ) : (
              trackedEvents.map((evt) => (
                <div key={evt.id} className="border-b border-zinc-900 pb-1 flex justify-between items-start gap-4">
                  <div>
                    <span className="text-violet-400 font-bold">[{evt.timestamp}]</span>{" "}
                    <span className="text-emerald-400">{evt.eventName}</span>
                    <span className="text-zinc-500 block text-[9px]">Payload: {JSON.stringify(evt.props)}</span>
                  </div>
                  <span className="text-[9px] bg-zinc-900 px-1 py-0.2 rounded text-zinc-500">200 OK</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
