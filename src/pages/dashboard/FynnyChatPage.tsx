import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Loader2, MessageCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const C = {
  bg: "#0A0B0D",
  bg2: "#111214",
  card: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.08)",
  text: "#E5E7EB",
  textDim: "rgba(229,231,235,0.6)",
  textMuted: "rgba(229,231,235,0.4)",
  success: "#1F5A46",
  ai: "#C41E1E",
};

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const suggestions = [
  "What's my cash position and runway?",
  "Who has overdue invoices right now?",
  "When is my next GST filing due?",
  "What's my MRR and ARR?",
  "What's my biggest financial risk?",
  "Show my top 5 vendors by spend",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fynny-chat`;

export default function FynnyChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages([{
      id: "1",
      role: "assistant",
      content:
        "Hi! I'm **Fynny**, your AI CFO. I have live access to your bank balances, transactions, subscriptions, payables, receivables, and GST filings.\n\nAsk me anything, *\"What's my runway?\"*, *\"Who hasn't paid?\"*, *\"What's my MRR?\"*",
      timestamp: new Date(),
    }]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    const userMsg: Message = {
      id: Date.now().toString(), role: "user", content: text, timestamp: new Date(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setShowSuggestions(false);
    setIsStreaming(true);

    let assistantSoFar = "";
    const assistantId = (Date.now() + 1).toString();
    let assistantStarted = false;
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        if (!assistantStarted) {
          assistantStarted = true;
          return [...prev, { id: assistantId, role: "assistant", content: assistantSoFar, timestamp: new Date() }];
        }
        return prev.map(m => m.id === assistantId ? { ...m, content: assistantSoFar } : m);
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in to chat with Fynny.");

      const apiMessages = next
        .filter(m => m.id !== "1") // skip the static greeting
        .map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) throw new Error("Too many requests. Try again in a moment.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
        const errBody = await resp.text().catch(() => "");
        throw new Error(errBody || "Fynny is unavailable right now.");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || !line.trim()) continue;
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(j);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) upsert(c);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
      if (!assistantStarted) upsert("(no response)");
    } catch (e: any) {
      toast.error(e?.message || "Fynny had a problem.");
      setMessages(prev => [...prev, {
        id: assistantId, role: "assistant",
        content: `⚠️ ${e?.message || "Something went wrong."}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  return (
    <DashboardLayout>
      <style>{`
        @keyframes fynnyPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.4); } }
        @keyframes fynnyTyping { 0%,100% { opacity: 0.2; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
        .fynny-input::placeholder { color: ${C.textMuted}; }
        .fynny-scroll::-webkit-scrollbar { width: 8px; }
        .fynny-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .fynny-md p { margin: 0 0 8px; }
        .fynny-md p:last-child { margin-bottom: 0; }
        .fynny-md ul, .fynny-md ol { margin: 4px 0 8px 20px; }
        .fynny-md li { margin-bottom: 2px; }
        .fynny-md strong { color: #fff; font-weight: 600; }
        .fynny-md code { background: rgba(255,255,255,0.08); padding: 1px 6px; border-radius: 4px; font-size: 0.9em; }
        .fynny-md h1, .fynny-md h2, .fynny-md h3 { margin: 8px 0 4px; font-weight: 600; }
      `}</style>

      <div style={{
        display: "flex", flexDirection: "column",
        height: "calc(100vh - 64px)",
        background: C.bg, color: C.text, fontFamily: "Inter, sans-serif",
      }}>
        {/* Header */}
        <div style={{
          flexShrink: 0, padding: "16px 24px",
          background: C.bg2, borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: `linear-gradient(135deg, ${C.ai}, #8B0000)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 18, color: "#fff",
                boxShadow: `0 0 24px ${C.ai}55`,
              }}>F</div>
              <span style={{
                position: "absolute", bottom: 0, right: 0,
                width: 12, height: 12, borderRadius: "50%",
                background: C.success, border: `2px solid ${C.bg2}`,
                animation: "fynnyPulse 2s ease-in-out infinite",
              }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>CFO Fynny</div>
              <div style={{ fontSize: 12, color: C.textDim }}>Live access to your financials</div>
            </div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 999,
            background: "rgba(196,30,30,0.1)", border: `1px solid ${C.ai}55`,
            fontSize: 12, fontWeight: 500, color: C.ai,
          }}>
            <Sparkles size={14} />
            AI-Powered
          </div>
        </div>

        {/* Messages */}
        <div className="fynny-scroll" style={{
          flex: 1, overflowY: "auto",
          padding: "24px clamp(16px, 4vw, 32px)",
        }}>
          <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <AnimatePresence initial={false}>
              {messages.map(m => <MessageBubble key={m.id} message={m} />)}
            </AnimatePresence>

            {isStreaming && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Avatar />
                <div style={{
                  padding: "14px 18px", borderRadius: "4px 14px 14px 14px",
                  background: C.card, border: `1px solid ${C.border}`,
                  display: "flex", gap: 6, alignItems: "center",
                }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 7, height: 7, borderRadius: "50%", background: C.ai,
                      animation: `fynnyTyping 1.2s ease-in-out ${i * 0.15}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            {showSuggestions && messages.length <= 1 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                  Try asking
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 8,
                }}>
                  {suggestions.map((s, i) => (
                    <button key={i}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      style={{
                        padding: "12px 14px",
                        background: C.card, border: `1px solid ${C.border}`,
                        borderRadius: 10, color: C.text,
                        fontSize: 14, fontWeight: 500, fontFamily: "Inter, sans-serif",
                        cursor: "pointer", textAlign: "left",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                      <MessageCircle size={14} color={C.ai} />
                      <span>{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div style={{
          flexShrink: 0,
          padding: "16px clamp(16px, 4vw, 24px)",
          background: C.bg2, borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", gap: 10 }}>
            <input
              ref={inputRef}
              className="fynny-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
              placeholder="Ask Fynny anything about your business..."
              disabled={isStreaming}
              style={{
                flex: 1, height: 52, padding: "0 20px",
                background: C.card, border: `2px solid ${C.ai}44`,
                borderRadius: 12, color: C.text, fontSize: 16,
                fontFamily: "Inter, sans-serif", outline: "none",
                opacity: isStreaming ? 0.6 : 1,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              style={{
                height: 52, padding: "0 22px",
                display: "flex", alignItems: "center", gap: 8,
                background: input.trim() && !isStreaming ? C.ai : "rgba(255,255,255,0.06)",
                color: input.trim() && !isStreaming ? "#fff" : C.textMuted,
                border: "none", borderRadius: 12,
                fontSize: 14, fontWeight: 600,
                cursor: input.trim() && !isStreaming ? "pointer" : "not-allowed",
                boxShadow: input.trim() && !isStreaming ? `0 4px 16px ${C.ai}55` : "none",
              }}
            >
              {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Avatar() {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${C.ai}, #8B0000)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: 14, color: "#fff",
    }}>F</div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isAI = message.role === "assistant";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        display: "flex", gap: 12,
        flexDirection: isAI ? "row" : "row-reverse",
        alignItems: "flex-start",
      }}
    >
      {isAI ? <Avatar /> : (
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: "rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 600, fontSize: 13, color: C.text,
        }}>You</div>
      )}

      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 6, alignItems: isAI ? "flex-start" : "flex-end" }}>
        <div style={{
          padding: "14px 18px",
          borderRadius: isAI ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
          background: isAI ? C.card : C.ai,
          border: isAI ? `1px solid ${C.border}` : "none",
          color: isAI ? C.text : "#fff",
          fontSize: 15, lineHeight: 1.6,
          wordBreak: "break-word",
        }}>
          {isAI ? (
            <div className="fynny-md"><ReactMarkdown>{message.content}</ReactMarkdown></div>
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
          )}
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          {message.timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </motion.div>
  );
}
