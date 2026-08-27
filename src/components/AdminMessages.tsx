import React, { useState, useEffect } from 'react';
import { Mail, Reply, Archive, ShieldAlert, CheckCircle, Search, MessageSquare, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AdminMessages: React.FC = () => {
  const { token, addToast } = useApp();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchConversations = async () => {
    if (!token) return;
    try {
      setLoadingConvs(true);
      const res = await fetch("/api/messages/conversations", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error("Failed to load support conversations", err);
    } finally {
      setLoadingConvs(false);
    }
  };

  const fetchMessagesForConversation = async (convId: number) => {
    if (!token) return;
    try {
      setLoadingMsgs(true);
      const res = await fetch(`/api/messages/conversations/${convId}/messages`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data);
      }
    } catch (err) {
      console.error("Failed to load chat messages", err);
    } finally {
      setLoadingMsgs(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [token]);

  useEffect(() => {
    if (selectedConv) {
      fetchMessagesForConversation(selectedConv.id);
    } else {
      setChatMessages([]);
    }
  }, [selectedConv]);

  const handleSendReply = async () => {
    if (!selectedConv || !replyText.trim() || !token) return;
    try {
      const res = await fetch(`/api/messages/${selectedConv.id}/send`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ body: replyText })
      });
      if (res.ok) {
        addToast("Odpowiedź została wysłana!", "success");
        setReplyText("");
        fetchMessagesForConversation(selectedConv.id);
      } else {
        addToast("Błąd wysyłania odpowiedzi.", "error");
      }
    } catch (err: any) {
      addToast(`Błąd: ${err.message}`, "error");
    }
  };

  const filteredConversations = conversations.filter(c => {
    const titleMatch = c.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const participantsMatch = c.participants?.toLowerCase().includes(searchQuery.toLowerCase());
    return titleMatch || participantsMatch;
  });

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2 text-violet-400">
          <Mail className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-350 text-gradient font-bold leading-normal">
            Wiadomości & Wsparcie - Czat ze Studentami
          </h3>
        </div>
        <button
          onClick={fetchConversations}
          disabled={loadingConvs}
          className="p-1 px-3 bg-zinc-800/80 hover:bg-zinc-850 border border-zinc-700/60 rounded-md text-zinc-400 hover:text-white flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingConvs ? "animate-spin text-violet-500" : ""}`} />
          Odśwież
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[600px]">
        {/* Left column: conversation list */}
        <div className="lg:col-span-4 bg-zinc-950 border border-zinc-850 rounded-xl flex flex-col pt-4 overflow-hidden">
          <div className="px-4 pb-2 space-y-3 border-b border-zinc-900">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Szukaj wątków i studentów..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 focus:bg-zinc-800 border-none rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder-zinc-500 focus:outline-none" 
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-violet-950 text-violet-400 text-[10px] font-bold rounded">
                Wszystkich wątków: {filteredConversations.length}
              </span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="p-8 text-center text-xs font-mono text-zinc-600 animate-pulse">Ładowanie wątków...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-zinc-600">Brak otwartych konwersacji</div>
            ) : (
              filteredConversations.map(conv => (
                <div 
                  key={conv.id} 
                  className={`p-4 border-b border-zinc-900 cursor-pointer transition-colors ${selectedConv?.id === conv.id ? 'bg-zinc-900/80' : 'hover:bg-zinc-900/40'}`}
                  onClick={() => setSelectedConv(conv)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 bg-violet-500" />
                    <div className="w-full min-w-0">
                      <h5 className="text-xs font-bold text-white truncate">{conv.title || "Wsparcie"}</h5>
                      <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                        Student: {conv.participants || "Wyszukiwanie..."}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[9px] font-mono text-zinc-500">ID wątku: #{conv.id}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column: active chat messages */}
        <div className="lg:col-span-8 bg-zinc-950 border border-zinc-850 rounded-xl flex flex-col p-6 overflow-hidden">
          {selectedConv ? (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex justify-between items-start border-b border-zinc-850 pb-4 mb-4 flex-shrink-0">
                <div>
                  <h4 className="text-sm font-bold text-white">{selectedConv.title || "Wątek wsparcia"}</h4>
                  <p className="text-xs text-zinc-400 mt-1">Student: {selectedConv.participants || "Student"}</p>
                </div>
                <button 
                  onClick={() => fetchMessagesForConversation(selectedConv.id)}
                  className="p-1 px-2.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-400 text-xs hover:text-white"
                >
                  Odśwież czat
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
                {loadingMsgs ? (
                  <div className="text-center py-12 text-xs font-mono text-zinc-650 animate-pulse">Ładowanie historii...</div>
                ) : chatMessages.length === 0 ? (
                  <div className="text-center py-12 text-xs font-mono text-zinc-600">Brak wiadomości w tym wątku. Wyślij pierwszą wiadomość poniżej!</div>
                ) : (
                  chatMessages.map((msg, index) => {
                    const isAdminSender = msg.sender_name?.toLowerCase() === 'admin' || msg.sender_user_id === 1;
                    return (
                      <div key={msg.id || index} className={`flex ${isAdminSender ? "justify-end" : "justify-start"}`}>
                        <div className={`p-4 rounded-xl max-w-[85%] border shadow-inner ${
                          isAdminSender 
                            ? "bg-violet-950/40 border-violet-850 text-right text-violet-100" 
                            : "bg-zinc-900 border-zinc-850 text-left text-zinc-200"
                        }`}>
                          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5 block">
                            {msg.sender_name || "Kursant"}
                          </span>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-zinc-850 pt-4 space-y-3 flex-shrink-0">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">Twoja odpowiedź:</span>
                <textarea 
                  rows={3} 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none resize-none"
                  placeholder="Wpisz odpowiedź do studenta..."
                />
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setReplyText("Dziękuję za zgłoszenie. Sprawdzę rygorystyczne testy i zaraz wracam z informacją.")} 
                      className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] font-mono text-zinc-400 hover:text-white transition-colors"
                    >
                      [Szybka odp: Sprawdzę]
                    </button>
                    <button 
                      onClick={() => setReplyText("Zgłoszenie pomyślnie zweryfikowane. Certyfikat został wyemitowany do Twojego panelu.")} 
                      className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] font-mono text-zinc-400 hover:text-white transition-colors"
                    >
                      [Emisja certyfikatu]
                    </button>
                  </div>
                  <button 
                    onClick={handleSendReply}
                    disabled={!replyText.trim()}
                    className="px-6 py-2 bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white font-semibold rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                  >
                    <Reply className="w-4 h-4" />
                    Wyślij
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3">
              <MessageSquare className="w-8 h-8 opacity-20" />
              <p className="text-xs font-mono uppercase tracking-widest">Wybierz wątek z lewej strony, aby otworzyć czat</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
