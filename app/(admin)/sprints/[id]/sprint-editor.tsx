"use client";

import {
  useState,
  useTransition,
  useRef,
  useEffect,
  KeyboardEvent,
  useCallback,
} from "react";
import {
  Plus,
  Trash2,
  Check,
  X,
  Sparkles,
  Loader2,
  Link2,
  Link2Off,
  Copy,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Lock,
} from "lucide-react";
import { MentionInput, type MentionOption } from "./mention-input";
import {
  updateSprint,
  createSection,
  updateSection,
  deleteSection,
  createTask,
  toggleTask,
  updateTask,
  deleteTask,
  parseSprintText,
  importParsedSections,
  toggleSprintShare,
  closeSprint,
  type ParsedSprintSection,
} from "@/lib/actions/sprints";
import { updateSubtasks } from "@/lib/actions/tasks";
import type { SubtaskItem } from "@/lib/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SprintTask = {
  id: string;
  content: string;
  isCompleted: boolean;
  sortOrder: number;
  subtasks: SubtaskItem[];
};

export type SprintSection = {
  id: string;
  projectName: string;
  assigneeName: string | null;
  goal: string | null;
  sortOrder: number;
  tasks: SprintTask[];
};

export type SprintData = {
  id: string;
  title: string;
  weekOf: Date | null;
  weeklyFocus: string | null;
  topOfMind: string | null;
  shareToken: string | null;
  closedAt: Date | null;
  sections: SprintSection[];
};

export type ProjectOption = { id: string; name: string };
export type TeamMemberOption = { id: string; name: string };

// ─── Inline editable text ─────────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  className,
  placeholder,
  multiline = false,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    }
  }

  if (editing) {
    const sharedProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: handleKey,
      className: `${className} bg-transparent border-b border-[#0A0A0A]/30 focus:outline-none w-full resize-none`,
      placeholder,
    };
    if (multiline) {
      return (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          {...sharedProps}
          rows={3}
        />
      );
    }
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        {...sharedProps}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`${className} cursor-text hover:opacity-70 transition-opacity`}
      title="Click to edit"
    >
      {value || (
        <span className="opacity-30 italic">{placeholder ?? "Click to edit"}</span>
      )}
    </span>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  sprintId,
  onToggle,
  onUpdate,
  onDelete,
  onEnterCreate,
}: {
  task: SprintTask;
  sprintId: string;
  onToggle: (id: string, val: boolean) => void;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onEnterCreate?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.content);
  const inputRef = useRef<HTMLInputElement>(null);

  // Subtask state
  const [subtasksExpanded, setSubtasksExpanded] = useState(
    (task.subtasks?.length ?? 0) > 0
  );
  const [localSubtasks, setLocalSubtasks] = useState<SubtaskItem[]>(
    task.subtasks ?? []
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleToggle() {
    onToggle(task.id, !task.isCompleted);
    startTransition(async () => {
      await toggleTask(task.id, sprintId, !task.isCompleted);
    });
  }

  function commitEdit() {
    setEditing(false);
    if (draft.trim() && draft !== task.content) {
      onUpdate(task.id, draft.trim());
      startTransition(async () => {
        await updateTask(task.id, sprintId, draft.trim());
      });
    }
  }

  function handleDeleteTask() {
    onDelete(task.id);
    startTransition(async () => {
      await deleteTask(task.id, sprintId);
    });
  }

  // ── Subtask helpers ──────────────────────────────────────────────────────

  function saveSubtasks(items: SubtaskItem[]) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        await updateSubtasks(task.id, sprintId, items);
      });
    }, 500);
  }

  function toggleSubtask(id: string) {
    const updated = localSubtasks.map((s) =>
      s.id === id ? { ...s, isCompleted: !s.isCompleted } : s
    );
    setLocalSubtasks(updated);
    saveSubtasks(updated);
  }

  function updateSubtaskContent(id: string, content: string) {
    const updated = localSubtasks.map((s) =>
      s.id === id ? { ...s, content } : s
    );
    setLocalSubtasks(updated);
    saveSubtasks(updated);
  }

  function addSubtask(afterId?: string) {
    const newItem: SubtaskItem = {
      id: crypto.randomUUID(),
      content: "",
      isCompleted: false,
    };
    if (!afterId) {
      const updated = [...localSubtasks, newItem];
      setLocalSubtasks(updated);
      saveSubtasks(updated);
    } else {
      const idx = localSubtasks.findIndex((s) => s.id === afterId);
      const updated = [
        ...localSubtasks.slice(0, idx + 1),
        newItem,
        ...localSubtasks.slice(idx + 1),
      ];
      setLocalSubtasks(updated);
      saveSubtasks(updated);
    }
    return newItem.id;
  }

  function deleteSubtask(id: string) {
    const updated = localSubtasks.filter((s) => s.id !== id);
    setLocalSubtasks(updated);
    saveSubtasks(updated);
  }

  const subtaskCount = localSubtasks.length;

  return (
    <div className="py-1 group">
      {/* Main task row */}
      <div className="flex items-start gap-2.5">
        <button
          onClick={handleToggle}
          disabled={isPending}
          className={`mt-0.5 shrink-0 w-4 h-4 border flex items-center justify-center transition-colors ${
            task.isCompleted
              ? "bg-[#0A0A0A] border-[#0A0A0A]"
              : "border-[#0A0A0A]/30 hover:border-[#0A0A0A]/60"
          }`}
        >
          {task.isCompleted && <Check size={10} className="text-white" />}
        </button>

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitEdit();
                // After saving, trigger creating the next task
                setTimeout(() => onEnterCreate?.(), 0);
              }
              if (e.key === "Escape") {
                setDraft(task.content);
                setEditing(false);
              }
            }}
            className="flex-1 font-serif text-sm bg-transparent border-b border-[#0A0A0A]/30 focus:outline-none"
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            className={`flex-1 font-serif text-sm cursor-text leading-snug ${
              task.isCompleted
                ? "line-through text-[#0A0A0A]/30"
                : "text-[#0A0A0A]"
            }`}
          >
            {task.content}
          </span>
        )}

        {/* Subtask expand toggle — shown on hover */}
        {!task.isCompleted && (
          <button
            onClick={() => setSubtasksExpanded((v) => !v)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[#0A0A0A]/30 hover:text-[#0A0A0A]/60 shrink-0 mt-0.5 flex items-center gap-0.5"
            title={subtasksExpanded ? "Collapse subtasks" : "Expand subtasks"}
          >
            {subtaskCount > 0 && (
              <span className="font-mono text-[9px] text-[#0A0A0A]/40">
                {subtaskCount}
              </span>
            )}
            {subtasksExpanded ? (
              <ChevronUp size={11} />
            ) : (
              <ChevronDown size={11} />
            )}
          </button>
        )}

        <button
          onClick={handleDeleteTask}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#0A0A0A]/30 hover:text-[#0A0A0A] shrink-0 mt-0.5"
        >
          <X size={12} />
        </button>
      </div>

      {/* Subtask checklist */}
      {subtasksExpanded && !task.isCompleted && (
        <div className="ml-6.5 mt-1.5 space-y-1">
          {localSubtasks.map((sub, _idx) => (
            <SubtaskItemRow
              key={sub.id}
              item={sub}
              onToggle={() => toggleSubtask(sub.id)}
              onUpdate={(content) => updateSubtaskContent(sub.id, content)}
              onEnter={() => {
                const newId = addSubtask(sub.id);
                // Focus the new input after state update
                setTimeout(() => {
                  const el = document.getElementById(`subtask-${newId}`);
                  el?.focus();
                }, 10);
              }}
              onDelete={() => {
                if (localSubtasks.length > 1 || sub.content) {
                  deleteSubtask(sub.id);
                }
              }}
            />
          ))}
          <button
            onClick={() => {
              const newId = addSubtask();
              setTimeout(() => {
                const el = document.getElementById(`subtask-${newId}`);
                el?.focus();
              }, 10);
            }}
            className="font-mono text-[10px] text-[#0A0A0A]/25 hover:text-[#0A0A0A]/50 transition-colors flex items-center gap-1 mt-0.5"
          >
            <Plus size={9} />
            Add item
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Subtask Item Row ─────────────────────────────────────────────────────────

function SubtaskItemRow({
  item,
  onToggle,
  onUpdate,
  onEnter,
  onDelete,
}: {
  item: SubtaskItem;
  onToggle: () => void;
  onUpdate: (content: string) => void;
  onEnter: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 group/sub">
      <button
        onClick={onToggle}
        className={`shrink-0 w-3 h-3 border flex items-center justify-center transition-colors ${
          item.isCompleted
            ? "bg-[#0A0A0A]/60 border-[#0A0A0A]/60"
            : "border-[#0A0A0A]/20 hover:border-[#0A0A0A]/40"
        }`}
      >
        {item.isCompleted && <Check size={7} className="text-white" />}
      </button>
      <input
        id={`subtask-${item.id}`}
        value={item.content}
        onChange={(e) => onUpdate(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
          if (e.key === "Backspace" && !item.content) {
            e.preventDefault();
            onDelete();
          }
        }}
        placeholder="Subtask..."
        className={`flex-1 font-serif text-xs bg-transparent focus:outline-none placeholder:text-[#0A0A0A]/20 ${
          item.isCompleted ? "line-through text-[#0A0A0A]/30" : "text-[#0A0A0A]/70"
        }`}
      />
      <button
        onClick={onDelete}
        className="opacity-0 group-hover/sub:opacity-100 transition-opacity text-[#0A0A0A]/20 hover:text-[#0A0A0A] shrink-0"
      >
        <X size={10} />
      </button>
    </div>
  );
}

// ─── Section Block ────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  sprintId,
  onUpdateSection,
  onDeleteSection,
  onCreateTask,
  onToggleTask,
  onUpdateTask,
  onDeleteTask,
  projects: _projects,
}: {
  section: SprintSection;
  sprintId: string;
  onUpdateSection: (id: string, data: Partial<SprintSection>) => void;
  onDeleteSection: (id: string) => void;
  onCreateTask: (sectionId: string, content: string) => void;
  onToggleTask: (id: string, val: boolean) => void;
  onUpdateTask: (id: string, content: string) => void;
  onDeleteTask: (id: string) => void;
  projects: ProjectOption[];
}) {
  const isUnassigned = section.id === "__unassigned__";
  const [_isPending, startTransition] = useTransition();
  const [newTaskContent, setNewTaskContent] = useState("");
  const [showTaskInput, setShowTaskInput] = useState(false);
  const taskInputRef = useRef<HTMLInputElement>(null);

  const total = section.tasks.length;
  const done = section.tasks.filter((t) => t.isCompleted).length;

  useEffect(() => {
    if (showTaskInput) taskInputRef.current?.focus();
  }, [showTaskInput]);

  function handleAddTask() {
    const content = newTaskContent.trim();
    if (!content) {
      setShowTaskInput(false);
      return;
    }
    onCreateTask(section.id, content);
    startTransition(async () => {
      await createTask(section.id, sprintId, content, section.tasks.length);
    });
    setNewTaskContent("");
    taskInputRef.current?.focus();
  }

  function handleDeleteSection() {
    if (!confirm(`Remove "${section.projectName}" section?`)) return;
    onDeleteSection(section.id);
    startTransition(async () => {
      await deleteSection(section.id, sprintId);
    });
  }

  function saveProjectName(val: string) {
    onUpdateSection(section.id, { projectName: val });
    startTransition(async () => {
      await updateSection(section.id, sprintId, { projectName: val });
    });
  }

  function saveAssigneeName(val: string) {
    onUpdateSection(section.id, { assigneeName: val || null });
    startTransition(async () => {
      await updateSection(section.id, sprintId, { assigneeName: val || null });
    });
  }

  function saveGoal(val: string) {
    onUpdateSection(section.id, { goal: val || null });
    startTransition(async () => {
      await updateSection(section.id, sprintId, { goal: val || null });
    });
  }

  return (
    <div className="mb-8 group/section">
      {/* Section header */}
      <div className="flex items-start justify-between mb-1">
        {isUnassigned ? (
          <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/30">
            Unassigned
          </span>
        ) : (
          <InlineEdit
            value={section.projectName}
            onSave={saveProjectName}
            className="font-serif font-bold italic text-[#0A0A0A] text-base"
            placeholder="Project name"
          />
        )}
        {!isUnassigned && (
          <div className="flex items-center gap-2 opacity-0 group-hover/section:opacity-100 transition-opacity">
            {total > 0 && (
              <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                {done}/{total}
              </span>
            )}
            <button
              onClick={handleDeleteSection}
              className="text-[#0A0A0A]/20 hover:text-[#0A0A0A] transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
        {isUnassigned && total > 0 && (
          <span className="font-mono text-[10px] text-[#0A0A0A]/30">
            {done}/{total}
          </span>
        )}
      </div>

      {/* Goal + Assignee — only on real sections */}
      {!isUnassigned && (
        <>
          <div className="mb-1.5">
            <InlineEdit
              value={section.goal ?? ""}
              onSave={saveGoal}
              className="font-mono text-xs text-[#0A0A0A]/50"
              placeholder="goal — describe the week's objective for this project"
            />
          </div>
          <div className="mb-3">
            <span className="font-mono text-[10px] text-[#0A0A0A]/30">
              @{" "}
            </span>
            <InlineEdit
              value={section.assigneeName ?? ""}
              onSave={saveAssigneeName}
              className="font-mono text-[10px] text-[#0A0A0A]/50"
              placeholder="assignee"
            />
          </div>
        </>
      )}

      {/* Unassigned hint */}
      {isUnassigned && (
        <p className="font-mono text-[10px] text-[#0A0A0A]/25 mb-3">
          These tasks lost their section (section was deleted). Move them by
          deleting and re-adding.
        </p>
      )}

      {/* Tasks */}
      <div className="space-y-0.5 pl-0">
        {section.tasks
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              sprintId={sprintId}
              onToggle={onToggleTask}
              onUpdate={onUpdateTask}
              onDelete={onDeleteTask}
              onEnterCreate={() => {
                if (!isUnassigned) setShowTaskInput(true);
              }}
            />
          ))}
      </div>

      {/* Empty section state */}
      {!isUnassigned && section.tasks.length === 0 && !showTaskInput && (
        <button
          onClick={() => setShowTaskInput(true)}
          className="w-full mt-1 py-3 border border-dashed border-[#0A0A0A]/10 font-mono text-[10px] text-[#0A0A0A]/25 hover:text-[#0A0A0A]/50 hover:border-[#0A0A0A]/20 transition-colors text-center"
        >
          + Add first task
        </button>
      )}

      {/* Add task — only on real sections */}
      {!isUnassigned && (
        showTaskInput ? (
          <div className="flex items-center gap-2.5 mt-1.5">
            <div className="w-4 h-4 border border-[#0A0A0A]/20 shrink-0" />
            <input
              ref={taskInputRef}
              value={newTaskContent}
              onChange={(e) => setNewTaskContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTask();
                if (e.key === "Escape") {
                  setNewTaskContent("");
                  setShowTaskInput(false);
                }
              }}
              onBlur={() => {
                if (!newTaskContent.trim()) setShowTaskInput(false);
              }}
              placeholder="Add task — press Enter to save, Escape to cancel"
              className="flex-1 font-serif text-sm bg-transparent border-b border-[#0A0A0A]/20 focus:outline-none focus:border-[#0A0A0A]/50 text-[#0A0A0A]/70 placeholder:text-[#0A0A0A]/30"
            />
          </div>
        ) : section.tasks.length > 0 ? (
          <button
            onClick={() => setShowTaskInput(true)}
            className="mt-2 flex items-center gap-1 font-mono text-[10px] text-[#0A0A0A]/25 hover:text-[#0A0A0A]/50 transition-colors"
          >
            <Plus size={10} />
            Add task
          </button>
        ) : null
      )}
    </div>
  );
}

// ─── Close Sprint Button ──────────────────────────────────────────────────────

function CloseSprintButton({
  sprintId,
  closedAt,
}: {
  sprintId: string;
  closedAt: Date | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [localClosed, setLocalClosed] = useState(closedAt !== null);

  if (localClosed) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#0A0A0A]/10 text-[#0A0A0A]/30 font-mono text-xs cursor-default"
      >
        <Lock size={11} />
        Closed
      </button>
    );
  }

  function handleClose() {
    if (
      !confirm(
        "Close this sprint? A snapshot will be saved and this cannot be undone."
      )
    )
      return;

    startTransition(async () => {
      const result = await closeSprint(sprintId);
      if (result.success) {
        setLocalClosed(true);
      }
    });
  }

  return (
    <button
      onClick={handleClose}
      disabled={isPending}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-[#0A0A0A]/20 text-[#0A0A0A]/50 font-mono text-xs hover:border-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors disabled:opacity-40"
    >
      {isPending ? <Loader2 size={11} className="animate-spin" /> : <Lock size={11} />}
      Close Sprint
    </button>
  );
}

// ─── Share Button ─────────────────────────────────────────────────────────────

function SprintShareButton({
  sprintId,
  initialToken,
}: {
  sprintId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const shareUrl =
    typeof window !== "undefined" && token
      ? `${window.location.origin}/s/${token}`
      : token
      ? `/s/${token}`
      : null;

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleSprintShare(sprintId, token);
      if (result.success && result.data !== undefined) {
        setToken(result.data.shareToken);
        setCopied(false);
      }
    });
  }

  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!token) {
    return (
      <button
        onClick={handleToggle}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#0A0A0A]/20 text-[#0A0A0A]/50 font-mono text-xs hover:border-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors disabled:opacity-40"
      >
        {isPending ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Link2 size={11} />
        )}
        Share
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0A0A]/5 border border-[#0A0A0A]/20 text-[#0A0A0A]/70 font-mono text-xs hover:bg-[#0A0A0A]/10 transition-colors"
        title={shareUrl ?? ""}
      >
        {copied ? (
          <>
            <CheckCheck size={11} className="text-[#0A0A0A]" />
            Copied!
          </>
        ) : (
          <>
            <Copy size={11} />
            Copy link
          </>
        )}
      </button>
      <button
        onClick={handleToggle}
        disabled={isPending}
        className="p-1.5 border border-[#0A0A0A]/20 text-[#0A0A0A]/30 hover:text-[#0A0A0A] hover:border-[#0A0A0A]/40 transition-colors disabled:opacity-40"
        title="Disable public link"
      >
        {isPending ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Link2Off size={11} />
        )}
      </button>
    </div>
  );
}

// ─── AI Import Modal ──────────────────────────────────────────────────────────

type ReviewSection = ParsedSprintSection & { assigneeName: string };

/** Pre-process raw text before sending to AI — splits [ ] checkboxes onto separate lines */
function normalizeSprintText(raw: string): string {
  return raw
    .replace(/\[\s*x\s*\]/gi, "\n- [done] ")
    .replace(/\[\s*\]/g, "\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function SprintAIImport({
  sprintId,
  projects,
  teamMembers,
  currentSectionCount,
  onImported,
}: {
  sprintId: string;
  projects: ProjectOption[];
  teamMembers: TeamMemberOption[];
  currentSectionCount: number;
  onImported: (sections: Array<ReviewSection & { id: string }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ReviewSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  function handleClose() {
    setOpen(false);
    setRawText("");
    setParsed(null);
    setError(null);
  }

  function handleParse() {
    if (!rawText.trim()) return;
    setError(null);
    setParsed(null);
    startTransition(async () => {
      const normalized = normalizeSprintText(rawText);
      const result = await parseSprintText(
        normalized,
        projects.map((p) => p.name),
        teamMembers.map((m) => m.name)
      );
      if (result.success && result.data) {
        setParsed(
          result.data.map((s) => ({ ...s, assigneeName: s.assigneeName ?? "" }))
        );
      } else {
        setError(result.error ?? "Parse failed");
      }
    });
  }

  function updateAssignee(idx: number, val: string) {
    setParsed((prev) =>
      prev
        ? prev.map((s, i) => (i === idx ? { ...s, assigneeName: val } : s))
        : prev
    );
  }

  function removeSection(idx: number) {
    setParsed((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  function handleImport() {
    if (!parsed || parsed.length === 0) return;
    startTransition(async () => {
      const result = await importParsedSections(
        sprintId,
        parsed.map((s) => ({
          projectName: s.projectName,
          goal: s.goal,
          assigneeName: s.assigneeName || null,
          tasks: s.tasks.filter(Boolean),
        })),
        currentSectionCount
      );
      if (result.success) {
        const optimistic = parsed.map((s) => ({ ...s, id: crypto.randomUUID() }));
        onImported(optimistic);
        handleClose();
      } else {
        setError(result.error ?? "Import failed");
      }
    });
  }

  const totalTasks = parsed?.reduce((n, s) => n + s.tasks.length, 0) ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0A0A] text-white font-mono text-xs hover:bg-[#0A0A0A]/80 transition-colors shrink-0"
      >
        <Sparkles size={11} />
        AI Parse
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#0A0A0A]/40 pt-16 px-4">
          <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl bg-white border border-[#0A0A0A]/20 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#0A0A0A]/10 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[#0A0A0A]/50" />
                <span className="font-serif font-bold text-[#0A0A0A]">
                  AI Sprint Import
                </span>
              </div>
              <button
                onClick={handleClose}
                className="text-[#0A0A0A]/30 hover:text-[#0A0A0A]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <div className="p-6 border-b border-[#0A0A0A]/10">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-3">
                  Paste your notes — include projects, tasks, assignees (@adam,
                  @maggie), and goals. Any format works.
                </p>
                <textarea
                  ref={textareaRef}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                      handleParse();
                  }}
                  placeholder={
                    "Trackr — @adam\ngoal: keep outbound running, fix cost sync\n[ ] Fix tool cost sync\n[ ] Update pricing page\n[ ] Review Stripe webhook\n\nCursive — @maggie\n[ ] Onboard ABC Corp\n[ ] Fix lead import bug\n[ ] Send weekly report\n\nGeneral\n[ ] Review contracts\n[ ] Team standup notes"
                  }
                  rows={10}
                  className="w-full font-mono text-sm text-[#0A0A0A]/80 bg-[#F3F3EF] border border-[#0A0A0A]/10 p-4 focus:outline-none focus:border-[#0A0A0A]/30 resize-none placeholder:text-[#0A0A0A]/25 leading-relaxed"
                />
                {error && (
                  <p className="font-mono text-xs text-[#0A0A0A]/70 mt-2">{error}</p>
                )}
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={handleParse}
                    disabled={!rawText.trim() || isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-[#0A0A0A] text-white font-mono text-xs disabled:opacity-40 hover:bg-[#0A0A0A]/80 transition-colors"
                  >
                    {isPending && !parsed ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Parsing...
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        Parse
                      </>
                    )}
                  </button>
                  <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                    Cmd+Enter
                  </span>
                </div>
              </div>

              {parsed && (
                <div className="p-6">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-4">
                    {parsed.length} project{parsed.length !== 1 ? "s" : ""},{" "}
                    {totalTasks} task{totalTasks !== 1 ? "s" : ""} — assign
                    each section then import
                  </p>

                  <div className="space-y-3">
                    {parsed.map((section, si) => (
                      <div
                        key={si}
                        className="border border-[#0A0A0A]/10 p-4 flex items-start gap-4 bg-[#F3F3EF]/40"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-serif font-bold italic text-[#0A0A0A] text-sm">
                            {section.projectName}
                          </p>
                          {section.goal && (
                            <p className="font-mono text-[10px] text-[#0A0A0A]/50 mt-0.5 mb-2">
                              {section.goal}
                            </p>
                          )}
                          <div className="mt-1.5 space-y-0.5">
                            {section.tasks.slice(0, 5).map((t, ti) => (
                              <div key={ti} className="flex items-start gap-1.5">
                                <div className="w-2.5 h-2.5 border border-[#0A0A0A]/20 shrink-0 mt-1" />
                                <span className="font-serif text-xs text-[#0A0A0A]/70 leading-snug">
                                  {t}
                                </span>
                              </div>
                            ))}
                            {section.tasks.length > 5 && (
                              <p className="font-mono text-[10px] text-[#0A0A0A]/30 pl-4">
                                +{section.tasks.length - 5} more
                              </p>
                            )}
                            {section.tasks.length === 0 && (
                              <p className="font-mono text-[10px] text-[#0A0A0A]/30 italic">
                                No tasks
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={section.assigneeName}
                            onChange={(e) => updateAssignee(si, e.target.value)}
                            className="border border-[#0A0A0A]/20 bg-white px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-[#0A0A0A]/40"
                          >
                            <option value="">Unassigned</option>
                            {teamMembers.map((m) => (
                              <option key={m.id} value={m.name}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeSection(si)}
                            className="text-[#0A0A0A]/20 hover:text-[#0A0A0A] transition-colors p-1"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {parsed && (
              <div className="px-6 py-4 border-t border-[#0A0A0A]/10 flex items-center gap-3 shrink-0 bg-white">
                <button
                  onClick={handleImport}
                  disabled={isPending || parsed.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#0A0A0A] text-white font-mono text-xs disabled:opacity-40 hover:bg-[#0A0A0A]/80 transition-colors"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      Import {parsed.length} section
                      {parsed.length !== 1 ? "s" : ""} · {totalTasks} tasks
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setParsed(null);
                    setError(null);
                  }}
                  className="px-4 py-2.5 border border-[#0A0A0A]/20 font-mono text-xs hover:bg-[#0A0A0A]/5"
                >
                  Re-parse
                </button>
                <button
                  onClick={handleClose}
                  className="font-mono text-xs text-[#0A0A0A]/40 hover:text-[#0A0A0A] ml-auto"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Add Section Form ─────────────────────────────────────────────────────────

function AddSectionForm({
  sprintId,
  onAdd,
  projects,
  teamMembers,
  nextSortOrder,
}: {
  sprintId: string;
  onAdd: (section: SprintSection) => void;
  projects: ProjectOption[];
  teamMembers: TeamMemberOption[];
  nextSortOrder: number;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [assigneeName, setAssigneeName] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [goal, setGoal] = useState("");

  const projectOptions: MentionOption[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
  }));
  const memberOptions: MentionOption[] = teamMembers.map((m) => ({
    id: m.id,
    name: m.name,
  }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;

    const tempSection: SprintSection = {
      id: crypto.randomUUID(),
      projectName: projectName.trim(),
      assigneeName: assigneeName.trim() || null,
      goal: goal.trim() || null,
      sortOrder: nextSortOrder,
      tasks: [],
    };
    onAdd(tempSection);
    setProjectName("");
    setProjectId(null);
    setAssigneeName("");
    setAssigneeId(null);
    setGoal("");
    setOpen(false);

    startTransition(async () => {
      await createSection(sprintId, {
        projectName: tempSection.projectName,
        projectId,
        assigneeName: tempSection.assigneeName,
        assigneeId,
        goal: tempSection.goal,
        sortOrder: nextSortOrder,
      });
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#0A0A0A]/20 text-[#0A0A0A]/30 font-mono text-xs hover:border-[#0A0A0A]/40 hover:text-[#0A0A0A]/50 transition-colors w-full"
      >
        <Plus size={12} />
        Add project section
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[#0A0A0A]/10 bg-white p-5"
    >
      <p className="font-serif font-bold text-[#0A0A0A] mb-4">
        Add Project Section
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <MentionInput
            label="Project / Client *"
            value={projectName}
            onChange={(v) => {
              setProjectName(v);
              if (!v) setProjectId(null);
            }}
            onSelect={(opt) => setProjectId(opt?.id ?? null)}
            options={projectOptions}
            placeholder="DevSwarm, SOHO, TVTC..."
            emptyText="No matching project — will be saved as free text"
          />
          {projectId && (
            <p className="font-mono text-[9px] text-[#0A0A0A]/30 mt-0.5">
              linked to project
            </p>
          )}
        </div>
        <div>
          <MentionInput
            label="Assignee"
            value={assigneeName}
            onChange={(v) => {
              setAssigneeName(v);
              if (!v) setAssigneeId(null);
            }}
            onSelect={(opt) => setAssigneeId(opt?.id ?? null)}
            options={memberOptions}
            placeholder="@ Adam, Maggie..."
            emptyText="No matching team member"
          />
          {assigneeId && (
            <p className="font-mono text-[9px] text-[#0A0A0A]/30 mt-0.5">
              linked to team member
            </p>
          )}
        </div>
        <div className="col-span-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
            Goal
          </label>
          <input
            className="w-full border-b border-[#0A0A0A]/20 py-1 font-mono text-sm bg-transparent focus:outline-none focus:border-[#0A0A0A]/50 placeholder:text-[#0A0A0A]/30"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="goal — what needs to happen this week for this project"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || !projectName.trim()}
          className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-xs disabled:opacity-50"
        >
          Add Section
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 border border-[#0A0A0A]/20 font-mono text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Top of Mind Notes ────────────────────────────────────────────────────────

function TopOfMindEditor({
  sprintId,
  value,
  onChange,
}: {
  sprintId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    setDraft(v);
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        await updateSprint(sprintId, { topOfMind: v });
      });
    }, 800);
  }

  return (
    <div className="mb-8">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-2">
        Top of Mind
      </p>
      <textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="• Key thoughts, context, and notes for the week..."
        rows={5}
        className="w-full font-serif text-sm text-[#0A0A0A]/70 bg-transparent border border-[#0A0A0A]/10 p-4 focus:outline-none focus:border-[#0A0A0A]/30 resize-none placeholder:text-[#0A0A0A]/25 leading-relaxed"
      />
      {isPending && (
        <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
          Saving...
        </p>
      )}
    </div>
  );
}

// ─── Main Sprint Editor ───────────────────────────────────────────────────────

export function SprintEditor({
  sprint,
  projects,
  teamMembers,
}: {
  sprint: SprintData;
  projects: ProjectOption[];
  teamMembers: TeamMemberOption[];
}) {
  const [, startTransition] = useTransition();

  const [title, setTitle] = useState(sprint.title);
  const [weeklyFocus, setWeeklyFocus] = useState(sprint.weeklyFocus ?? "");
  const [topOfMind, setTopOfMind] = useState(sprint.topOfMind ?? "");
  const [sections, setSections] = useState<SprintSection[]>(sprint.sections);
  const shareToken = sprint.shareToken ?? null;

  // Prevent Cmd+S from opening browser save dialog — sprint auto-saves
  const handleGlobalKeyDown = useCallback((e: globalThis.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  function saveTitle(val: string) {
    setTitle(val);
    startTransition(async () => {
      await updateSprint(sprint.id, { title: val });
    });
  }

  function saveWeeklyFocus(val: string) {
    setWeeklyFocus(val);
    startTransition(async () => {
      await updateSprint(sprint.id, { weeklyFocus: val });
    });
  }

  function handleAddSection(section: SprintSection) {
    setSections((prev) => [...prev, section]);
  }

  function handleImportSections(
    imported: Array<ParsedSprintSection & { assigneeName: string; id: string }>
  ) {
    const newSections: SprintSection[] = imported.map((s, i) => ({
      id: s.id,
      projectName: s.projectName,
      assigneeName: s.assigneeName || null,
      goal: s.goal,
      sortOrder: sections.length + i,
      tasks: s.tasks.map((content, j) => ({
        id: crypto.randomUUID(),
        content,
        isCompleted: false,
        sortOrder: j,
        subtasks: [],
      })),
    }));
    setSections((prev) => [...prev, ...newSections]);
  }

  function handleUpdateSection(id: string, data: Partial<SprintSection>) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...data } : s))
    );
  }

  function handleDeleteSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  function handleCreateTask(sectionId: string, content: string) {
    const newTask: SprintTask = {
      id: crypto.randomUUID(),
      content,
      isCompleted: false,
      sortOrder: 0,
      subtasks: [],
    };
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, tasks: [...s.tasks, newTask] } : s
      )
    );
  }

  function handleToggleTask(taskId: string, val: boolean) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === taskId ? { ...t, isCompleted: val } : t
        ),
      }))
    );
  }

  function handleUpdateTask(taskId: string, content: string) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, content } : t)),
      }))
    );
  }

  function handleDeleteTask(taskId: string) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        tasks: s.tasks.filter((t) => t.id !== taskId),
      }))
    );
  }

  const totalTasks = sections.reduce((s, sec) => s + sec.tasks.length, 0);
  const doneTasks = sections.reduce(
    (s, sec) => s + sec.tasks.filter((t) => t.isCompleted).length,
    0
  );

  return (
    <div className="max-w-3xl">
      {/* Sprint title */}
      <div className="mb-3">
        <InlineEdit
          value={title}
          onSave={saveTitle}
          className="text-3xl font-bold font-serif text-[#0A0A0A] tracking-tight block"
          placeholder="Sprint title"
        />
      </div>

      {/* Weekly focus + action buttons */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1">
          <InlineEdit
            value={weeklyFocus}
            onSave={saveWeeklyFocus}
            className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/40"
            placeholder="WEEKLY FOCUS: ..."
          />
        </div>
        <SprintShareButton sprintId={sprint.id} initialToken={shareToken} />
        <SprintAIImport
          sprintId={sprint.id}
          projects={projects}
          teamMembers={teamMembers}
          currentSectionCount={sections.length}
          onImported={handleImportSections}
        />
        <CloseSprintButton sprintId={sprint.id} closedAt={sprint.closedAt} />
      </div>

      {/* Progress bar */}
      {totalTasks > 0 && (
        <div className="flex items-center gap-3 mb-8 mt-4">
          <div className="flex-1 h-1 bg-[#0A0A0A]/10">
            <div
              className="h-full bg-[#0A0A0A] transition-all"
              style={{
                width: `${Math.round((doneTasks / totalTasks) * 100)}%`,
              }}
            />
          </div>
          <span className="font-mono text-xs text-[#0A0A0A]/40 shrink-0">
            {doneTasks}/{totalTasks} done
          </span>
        </div>
      )}

      {!totalTasks && <div className="mb-8" />}

      {/* Top of mind notes */}
      <TopOfMindEditor
        sprintId={sprint.id}
        value={topOfMind}
        onChange={setTopOfMind}
      />

      {/* Divider */}
      <div className="border-t border-[#0A0A0A]/10 mb-8" />

      {/* Project sections */}
      {sections
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            sprintId={sprint.id}
            projects={projects}
            onUpdateSection={handleUpdateSection}
            onDeleteSection={handleDeleteSection}
            onCreateTask={handleCreateTask}
            onToggleTask={handleToggleTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        ))}

      {/* Empty state when no sections */}
      {sections.length === 0 && (
        <div className="border border-dashed border-[#0A0A0A]/15 py-12 text-center mb-8">
          <p className="font-serif text-base text-[#0A0A0A]/40 mb-1">
            No project sections yet.
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/25 uppercase tracking-wider mb-6">
            Add a section for each project you are working on this week.
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30">
            Use <span className="border border-[#0A0A0A]/15 px-1.5 py-0.5">Add project section</span> below, or <span className="border border-[#0A0A0A]/15 px-1.5 py-0.5">AI Parse</span> to import from notes.
          </p>
        </div>
      )}

      {/* Add section */}
      <AddSectionForm
        sprintId={sprint.id}
        onAdd={handleAddSection}
        projects={projects}
        teamMembers={teamMembers}
        nextSortOrder={sections.length}
      />

      {/* Keyboard shortcut legend */}
      <div className="mt-8 pt-6 border-t border-[#0A0A0A]/5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/20 mb-3">
          Keyboard shortcuts
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          {[
            { keys: "Enter",   description: "Create next task" },
            { keys: "Escape",  description: "Cancel edit" },
            { keys: "Cmd+S",   description: "Auto-saves (no dialog)" },
            { keys: "Cmd+Enter", description: "Parse AI import" },
          ].map(({ keys, description }) => (
            <div key={keys} className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] border border-[#0A0A0A]/10 px-1.5 py-0.5 text-[#0A0A0A]/35 bg-[#0A0A0A]/[0.02]">
                {keys}
              </span>
              <span className="font-mono text-[9px] text-[#0A0A0A]/25">
                {description}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
