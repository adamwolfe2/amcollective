"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Send,
  Plus,
  MessageSquare,
  Loader2,
  ChevronDown,
  ChevronRight,
  Wrench,
  Square,
  Search,
} from "lucide-react";

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

  // Extract tool name from type (e.g. "tool-get_costs" → "get costs")
  const toolName = part.type.replace(/^tool-/, "").replace(/_/g, " ");
  const isLoading = part.state === "input-streaming" || part.state === "input-available";
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
          // Tool invocation parts have type "tool-<name>"
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

// ─── Sidebar ────────────────────────────────────────────────────────────────

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

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AiPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [mode, setMode] = useState<"chat" | "research">("chat");
  const [sources, setSources] = useState<Source[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // useChat hook — streams messages
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    id: chatId,
  } = useChat({
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

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

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
    inputRef.current?.focus();
  }, [setMessages]);

  const handleSelectConversation = useCallback(
    async (convId: string) => {
      setActiveConvId(convId);
      setSources([]);
      try {
        const res = await fetch(
          `/api/ai/chat?conversationId=${convId}`
        );
        if (res.ok) {
          const data = await res.json();
          // Convert DB messages to UIMessage format
          const uiMessages: UIMessage[] = (data.messages ?? []).map(
            (m: { id: string; role: string; content: string | null; createdAt: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              parts: m.content ? [{ type: "text" as const, text: m.content }] : [],
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
        // Research mode — non-streaming
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

      // After first message in new chat, refresh conversations
      if (!activeConvId) {
        setTimeout(() => loadConversations(), 2000);
      }
    },
    [mode, sendMessage, activeConvId, setMessages, loadConversations]
  );

  // Keyboard handling for the input
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

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-6 -mt-6">
      {/* Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#0A0A0A]/10">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5" />
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
                    p.type === "text" && p.text && m === messages[messages.length - 1]
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
