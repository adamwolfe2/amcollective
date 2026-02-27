"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Source {
  title: string;
  url: string;
  snippet: string;
}

export default function AiPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [mode, setMode] = useState<"chat" | "research">("chat");
  const [sources, setSources] = useState<Source[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setSources([]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          conversationId,
          action: mode,
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const data = await res.json();

      setMessages([...updatedMessages, { role: "assistant", content: data.response }]);
      if (data.conversationId) setConversationId(data.conversationId);
      if (data.sources) setSources(data.sources);
    } catch {
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, conversationId, mode]);

  const quickPrompts = [
    "Show me all client health scores",
    "What's our current MRR?",
    "Any overdue invoices?",
    "Which rocks are at risk this quarter?",
    "Summarize unresolved alerts",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-serif tracking-tight">AM Agent</h1>
          <span className="px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white">AI</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("chat")}
            className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
              mode === "chat"
                ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                : "bg-white text-[#0A0A0A] border-[#0A0A0A]/20 hover:border-[#0A0A0A]"
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setMode("research")}
            className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
              mode === "research"
                ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                : "bg-white text-[#0A0A0A] border-[#0A0A0A]/20 hover:border-[#0A0A0A]"
            }`}
          >
            Research
          </button>
          <button
            onClick={() => {
              setMessages([]);
              setConversationId(undefined);
              setSources([]);
            }}
            className="px-3 py-1.5 text-xs font-mono border border-[#0A0A0A]/20 hover:border-[#0A0A0A] transition-colors"
          >
            New Chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto border border-[#0A0A0A]/10 bg-white p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4 font-serif">AM</div>
            <p className="text-[#0A0A0A]/60 font-serif mb-6 max-w-md">
              {mode === "chat"
                ? "Ask me anything about clients, projects, costs, invoices, or team performance. I have access to all your data."
                : "Research mode uses Tavily web search + Claude to synthesize answers from the web."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                  }}
                  className="px-3 py-1.5 text-xs font-mono border border-[#0A0A0A]/20 hover:border-[#0A0A0A] hover:bg-[#0A0A0A]/5 transition-colors text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 text-sm font-mono whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[#0A0A0A] text-white"
                    : "bg-[#F3F3EF] text-[#0A0A0A] border border-[#0A0A0A]/10"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-3 bg-[#F3F3EF] border border-[#0A0A0A]/10">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-[#0A0A0A]/40 animate-pulse" />
                <span className="w-2 h-2 bg-[#0A0A0A]/40 animate-pulse" style={{ animationDelay: "0.15s" }} />
                <span className="w-2 h-2 bg-[#0A0A0A]/40 animate-pulse" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sources (research mode) */}
      {sources.length > 0 && (
        <div className="border border-t-0 border-[#0A0A0A]/10 bg-[#F3F3EF] p-3">
          <p className="text-xs font-mono text-[#0A0A0A]/60 mb-2">Sources:</p>
          <div className="flex flex-wrap gap-2">
            {sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 text-xs font-mono border border-[#0A0A0A]/20 hover:border-[#0A0A0A] transition-colors truncate max-w-[200px]"
                title={s.snippet}
              >
                [{i + 1}] {s.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={
            mode === "chat"
              ? "Ask AM Agent anything..."
              : "Enter a research query..."
          }
          disabled={loading}
          className="flex-1 px-4 py-3 text-sm font-mono border border-[#0A0A0A]/20 focus:border-[#0A0A0A] focus:outline-none bg-white placeholder:text-[#0A0A0A]/40 disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="px-6 py-3 text-sm font-mono bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
