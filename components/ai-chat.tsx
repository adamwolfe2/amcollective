"use client";

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles,
  Send,
  Plus,
  MessageSquare,
  Loader2,
  ChevronDown,
  ChevronRight,
  Wrench,
  Square,
  Search,
  History,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Source {
  title: string;
  url: string;
  snippet: string;
}

// ─── Tool Call Display ──────────────────────────────────────────────────────

interface ToolPartProps {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
}

function ToolCallDisplay({ part }: { part: ToolPartProps }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = part.type.replace(/^tool-/, "").replace(/_/g, " ");
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available";
  const isDone = part.state === "output-available";

  return (
    <div className="my-2 border border-[#0A0A0A]/10 bg-[#F3F3EF]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-mono text-left hover:bg-[#0A0A0A]/5 transition-colors"
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin text-[#0A0A0A]/60" />
        ) : (
          <Wrench className="w-3 h-3 text-[#0A0A0A]/60" />
        )}
        <span className="font-medium">{toolName}</span>
        <span className="text-[#0A0A0A]/40 ml-auto">
          {isLoading ? "running..." : isDone ? "done" : part.state}
        </span>
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
      </button>
      {expanded && part.output != null && (
        <div className="px-3 pb-2 text-xs font-mono text-[#0A0A0A]/70 max-h-48 overflow-auto">
          <pre className="whitespace-pre-wrap break-words">
            {typeof part.output === "string"
              ? part.output
              : JSON.stringify(part.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] ${
          isUser
            ? "bg-[#0A0A0A] text-white px-4 py-3"
            : "bg-white border border-[#0A0A0A]/10 px-4 py-3"
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (isUser) {
              return (
                <p key={i} className="text-sm font-mono whitespace-pre-wrap">
                  {part.text}
                </p>
              );
            }
            return (
              <div
                key={i}
                className="text-sm prose prose-sm prose-stone max-w-none font-mono
                  prose-headings:font-serif prose-headings:tracking-tight
                  prose-code:bg-[#F3F3EF] prose-code:px-1 prose-code:py-0.5
                  prose-pre:bg-[#0A0A0A] prose-pre:text-white
                  prose-a:text-blue-700 prose-a:no-underline hover:prose-a:underline
                  prose-table:border-collapse prose-td:border prose-td:border-[#0A0A0A]/10 prose-td:px-2 prose-td:py-1
                  prose-th:border prose-th:border-[#0A0A0A]/10 prose-th:px-2 prose-th:py-1 prose-th:bg-[#F3F3EF]"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }
          if (part.type.startsWith("tool-")) {
            const toolPart = part as unknown as ToolPartProps;
            return <ToolCallDisplay key={i} part={toolPart} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

// ─── Conversation Sidebar (for full-page mode) ─────────────────────────────

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="w-64 border-r border-[#0A0A0A]/10 bg-[#F3F3EF] flex flex-col h-full">
      <div className="p-3 border-b border-[#0A0A0A]/10">
        <button
          onClick={onNew}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs font-mono border border-[#0A0A0A]/20 hover:border-[#0A0A0A] hover:bg-white transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 && (
          <p className="text-xs font-mono text-[#0A0A0A]/40 text-center py-4">
            No conversations yet
          </p>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`flex items-start gap-2 w-full px-3 py-2 text-left text-xs font-mono transition-colors truncate ${
              activeId === conv.id
                ? "bg-white border border-[#0A0A0A]/20"
                : "hover:bg-white/50"
            }`}
          >
            <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-[#0A0A0A]/40" />
            <span className="truncate">
              {conv.title || "New conversation"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main AI Chat Component ─────────────────────────────────────────────────

interface AiChatProps {
  /** "full" shows conversation sidebar; "embedded" shows dropdown history */
  variant?: "full" | "embedded";
  className?: string;
  /** Pre-fill and auto-submit this message (e.g. from floating bar ?q= param) */
  initialMessage?: string;
}

export function AiChat({ variant = "embedded", className, initialMessage }: AiChatProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [mode, setMode] = useState<"chat" | "research">("chat");
  const [sources, setSources] = useState<Source[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, setMessages, sendMessage, status, stop } = useChat({
    id: activeConvId ?? undefined,
    transport: new DefaultChatTransport({
      api: "/api/ai/chat",
      body: { conversationId: activeConvId },
    }),
    onError: (err) => {
      console.error("[AI Chat]", err);
    },
  });

  const isStreaming = status === "streaming";
  const isSubmitting = status === "submitted";

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Auto-submit initialMessage once (from floating bar ?q= param)
  const initialSentRef = useRef(false);
  useLayoutEffect(() => {
    if (initialMessage && !initialSentRef.current) {
      initialSentRef.current = true;
      handleSubmit(initialMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/chat");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setSources([]);
    setShowHistory(false);
    inputRef.current?.focus();
  }, [setMessages]);

  const handleSelectConversation = useCallback(
    async (convId: string) => {
      setActiveConvId(convId);
      setSources([]);
      setShowHistory(false);
      try {
        const res = await fetch(`/api/ai/chat?conversationId=${convId}`);
        if (res.ok) {
          const data = await res.json();
          const uiMessages: UIMessage[] = (
            data.messages ?? []
          ).map(
            (m: {
              id: string;
              role: string;
              content: string | null;
              createdAt: string;
            }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              parts: m.content
                ? [{ type: "text" as const, text: m.content }]
                : [],
            })
          );
          setMessages(uiMessages);
        }
      } catch {
        // Ignore
      }
    },
    [setMessages]
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      if (mode === "research") {
        setResearchLoading(true);
        setSources([]);
        const userMsg: UIMessage = {
          id: `user-${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text: text.trim() }],
        };
        setMessages((prev) => [...prev, userMsg]);

        try {
          const res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [userMsg],
              action: "research",
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const assistantMsg: UIMessage = {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              parts: [{ type: "text", text: data.response }],
            };
            setMessages((prev) => [...prev, assistantMsg]);
            if (data.sources) setSources(data.sources);
          }
        } catch {
          const errorMsg: UIMessage = {
            id: `error-${Date.now()}`,
            role: "assistant",
            parts: [
              {
                type: "text",
                text: "Research request failed. Please try again.",
              },
            ],
          };
          setMessages((prev) => [...prev, errorMsg]);
        } finally {
          setResearchLoading(false);
        }
        return;
      }

      // Chat mode — streaming
      sendMessage({ text: text.trim() });
      if (!activeConvId) {
        setTimeout(() => loadConversations(), 2000);
      }
    },
    [mode, sendMessage, activeConvId, setMessages, loadConversations]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = e.currentTarget.value;
        e.currentTarget.value = "";
        handleSubmit(text);
      }
    },
    [handleSubmit]
  );

  const quickPrompts = [
    "Show me current MRR and revenue trend",
    "Any overdue invoices?",
    "Which rocks are at risk this quarter?",
    "What's our cash position?",
    "Summarize unresolved alerts",
  ];

  // ─── Full-page variant ──────────────────────────────────────────────────

  if (variant === "full") {
    return (
      <div className={cn("flex h-full", className)}>
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
        />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-[#0A0A0A]/10">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5" />
              <h1 className="text-lg font-bold font-serif tracking-tight">
                AM Agent
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-[#0A0A0A] text-white">
                AI
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode("chat")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border transition-colors ${
                  mode === "chat"
                    ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                    : "bg-white text-[#0A0A0A] border-[#0A0A0A]/20 hover:border-[#0A0A0A]"
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                Chat
              </button>
              <button
                onClick={() => setMode("research")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border transition-colors ${
                  mode === "research"
                    ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                    : "bg-white text-[#0A0A0A] border-[#0A0A0A]/20 hover:border-[#0A0A0A]"
                }`}
              >
                <Search className="w-3 h-3" />
                Research
              </button>
              {activeConvId && (
                <a
                  href={`/api/ai/conversations/${activeConvId}/export`}
                  download
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[#0A0A0A]/20 bg-white text-[#0A0A0A] hover:border-[#0A0A0A] transition-colors"
                  title="Export conversation as markdown"
                >
                  <Download className="w-3 h-3" />
                  Export
                </a>
              )}
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
          >
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
                      onClick={() => handleSubmit(prompt)}
                      className="px-3 py-1.5 text-xs font-mono border border-[#0A0A0A]/20 hover:border-[#0A0A0A] hover:bg-[#0A0A0A]/5 transition-colors text-left"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))
            )}

            {(isStreaming || isSubmitting || researchLoading) &&
              !messages.some(
                (m) =>
                  m.role === "assistant" &&
                  m.parts.some(
                    (p) =>
                      p.type === "text" &&
                      p.text &&
                      m === messages[messages.length - 1]
                  )
              ) && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 bg-white border border-[#0A0A0A]/10">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-[#0A0A0A]/40 animate-pulse" />
                      <span
                        className="w-2 h-2 bg-[#0A0A0A]/40 animate-pulse"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <span
                        className="w-2 h-2 bg-[#0A0A0A]/40 animate-pulse"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
          </div>

          {/* Sources */}
          {sources.length > 0 && (
            <div className="border-t border-[#0A0A0A]/10 bg-[#F3F3EF] px-6 py-3">
              <p className="text-xs font-mono text-[#0A0A0A]/60 mb-2">
                Sources:
              </p>
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
          <div className="px-6 py-3 border-t border-[#0A0A0A]/10">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                rows={1}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === "chat"
                    ? "Ask AM Agent anything..."
                    : "Enter a research query..."
                }
                disabled={isStreaming || isSubmitting || researchLoading}
                className="flex-1 px-4 py-3 text-sm font-mono border border-[#0A0A0A]/20 focus:border-[#0A0A0A] focus:outline-none bg-white placeholder:text-[#0A0A0A]/40 disabled:opacity-50 resize-none min-h-[44px] max-h-[120px]"
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
              {isStreaming ? (
                <button
                  onClick={stop}
                  className="px-4 py-3 text-sm font-mono border border-red-500 text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (inputRef.current) {
                      const text = inputRef.current.value;
                      inputRef.current.value = "";
                      inputRef.current.style.height = "auto";
                      handleSubmit(text);
                    }
                  }}
                  disabled={isSubmitting || researchLoading}
                  className="px-4 py-3 text-sm font-mono bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Embedded variant ───────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "flex flex-col border border-[#0A0A0A]/10 bg-white",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#0A0A0A]/10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-bold font-serif tracking-tight">
            AM Agent
          </span>
          <span className="px-1.5 py-0.5 text-[8px] font-mono bg-[#0A0A0A] text-white">
            AI
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMode("chat")}
            className={`px-2 py-1 text-[10px] font-mono border transition-colors ${
              mode === "chat"
                ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                : "bg-white text-[#0A0A0A] border-[#0A0A0A]/20 hover:border-[#0A0A0A]"
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setMode("research")}
            className={`px-2 py-1 text-[10px] font-mono border transition-colors ${
              mode === "research"
                ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                : "bg-white text-[#0A0A0A] border-[#0A0A0A]/20 hover:border-[#0A0A0A]"
            }`}
          >
            Research
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`px-2 py-1 text-[10px] font-mono border transition-colors ${
              showHistory
                ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                : "bg-white text-[#0A0A0A] border-[#0A0A0A]/20 hover:border-[#0A0A0A]"
            }`}
            title="Chat History"
          >
            <History className="w-3 h-3" />
          </button>
          {activeConvId && (
            <a
              href={`/api/ai/conversations/${activeConvId}/export`}
              download
              className="px-2 py-1 text-[10px] font-mono border border-[#0A0A0A]/20 bg-white text-[#0A0A0A] hover:border-[#0A0A0A] transition-colors"
              title="Export"
            >
              <Download className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* History panel (collapsible) */}
      {showHistory && (
        <div className="border-b border-[#0A0A0A]/10 bg-[#F3F3EF] p-3 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#0A0A0A]/40">
              Conversations
            </span>
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1 text-[10px] font-mono text-[#0A0A0A]/60 hover:text-[#0A0A0A] transition-colors"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs font-mono text-[#0A0A0A]/40 text-center py-2">
              No conversations yet
            </p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs font-mono transition-colors truncate ${
                    activeConvId === conv.id
                      ? "bg-white border border-[#0A0A0A]/20"
                      : "hover:bg-white/50"
                  }`}
                >
                  <MessageSquare className="w-3 h-3 shrink-0 text-[#0A0A0A]/40" />
                  <span className="truncate">
                    {conv.title || "New conversation"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-3xl mb-3 font-serif">AM</div>
            <p className="text-[#0A0A0A]/60 font-serif text-sm mb-4 max-w-sm">
              {mode === "chat"
                ? "Ask about clients, projects, costs, invoices, or anything else. I have access to all your data."
                : "Research mode searches the web and synthesizes answers."}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-md">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSubmit(prompt)}
                  className="px-2.5 py-1 text-[10px] font-mono border border-[#0A0A0A]/20 hover:border-[#0A0A0A] hover:bg-[#0A0A0A]/5 transition-colors text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}

        {(isStreaming || isSubmitting || researchLoading) &&
          !messages.some(
            (m) =>
              m.role === "assistant" &&
              m.parts.some(
                (p) =>
                  p.type === "text" &&
                  p.text &&
                  m === messages[messages.length - 1]
              )
          ) && (
            <div className="flex justify-start">
              <div className="px-4 py-3 bg-white border border-[#0A0A0A]/10">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#0A0A0A]/40 animate-pulse" />
                  <span
                    className="w-2 h-2 bg-[#0A0A0A]/40 animate-pulse"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <span
                    className="w-2 h-2 bg-[#0A0A0A]/40 animate-pulse"
                    style={{ animationDelay: "0.3s" }}
                  />
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Sources (research mode) */}
      {sources.length > 0 && (
        <div className="border-t border-[#0A0A0A]/10 bg-[#F3F3EF] px-4 py-2">
          <p className="text-[10px] font-mono text-[#0A0A0A]/60 mb-1">
            Sources:
          </p>
          <div className="flex flex-wrap gap-1">
            {sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-1.5 py-0.5 text-[10px] font-mono border border-[#0A0A0A]/20 hover:border-[#0A0A0A] transition-colors truncate max-w-[180px]"
                title={s.snippet}
              >
                [{i + 1}] {s.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-2.5 border-t border-[#0A0A0A]/10">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "chat"
                ? "Ask AM Agent anything..."
                : "Enter a research query..."
            }
            disabled={isStreaming || isSubmitting || researchLoading}
            className="flex-1 px-3 py-2.5 text-sm font-mono border border-[#0A0A0A]/20 focus:border-[#0A0A0A] focus:outline-none bg-white placeholder:text-[#0A0A0A]/40 disabled:opacity-50 resize-none min-h-[40px] max-h-[100px]"
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 100)}px`;
            }}
          />
          {isStreaming ? (
            <button
              onClick={stop}
              className="px-3 py-2.5 text-sm font-mono border border-red-500 text-red-500 hover:bg-red-50 transition-colors"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                if (inputRef.current) {
                  const text = inputRef.current.value;
                  inputRef.current.value = "";
                  inputRef.current.style.height = "auto";
                  handleSubmit(text);
                }
              }}
              disabled={isSubmitting || researchLoading}
              className="px-3 py-2.5 text-sm font-mono bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
