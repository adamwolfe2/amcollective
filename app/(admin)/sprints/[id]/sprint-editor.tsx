"use client";

import {
  useState,
  useTransition,
  useRef,
  useEffect,
  KeyboardEvent,
} from "react";
import {
  Plus,
  Trash2,
  Check,
  X,
  Sparkles,
  Loader2,
} from "lucide-react";
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
  type ParsedSprintSection,
} from "@/lib/actions/sprints";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SprintTask = {
  id: string;
  content: string;
  isCompleted: boolean;
  sortOrder: number;
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
  weeklyFocus: string | null;
  topOfMind: string | null;
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
    const Tag = multiline ? "textarea" : "input";
    return (
      <Tag
        ref={ref as any}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className={`${className} bg-transparent border-b border-[#0A0A0A]/30 focus:outline-none w-full resize-none`}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
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
}: {
  task: SprintTask;
  sprintId: string;
  onToggle: (id: string, val: boolean) => void;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.content);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleToggle() {
    onToggle(task.id, !task.isCompleted);
    startTransition(async () => { await toggleTask(task.id, sprintId, !task.isCompleted); });
  }

  function commitEdit() {
    setEditing(false);
    if (draft.trim() && draft !== task.content) {
      onUpdate(task.id, draft.trim());
      startTransition(async () => { await updateTask(task.id, sprintId, draft.trim()); });
    }
  }

  function handleDeleteTask() {
    onDelete(task.id);
    startTransition(async () => { await deleteTask(task.id, sprintId); });
  }

  return (
    <div className="flex items-start gap-2.5 py-1 group">
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
            if (e.key === "Enter") commitEdit();
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

      <button
        onClick={handleDeleteTask}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[#0A0A0A]/30 hover:text-red-500 shrink-0 mt-0.5"
      >
        <X size={12} />
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
  projects,
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
  const [isPending, startTransition] = useTransition();
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
    startTransition(async () => { await deleteSection(section.id, sprintId); });
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
        <InlineEdit
          value={section.projectName}
          onSave={saveProjectName}
          className="font-serif font-bold italic text-[#0A0A0A] text-base"
          placeholder="Project name"
        />
        <div className="flex items-center gap-2 opacity-0 group-hover/section:opacity-100 transition-opacity">
          {total > 0 && (
            <span className="font-mono text-[10px] text-[#0A0A0A]/40">
              {done}/{total}
            </span>
          )}
          <button
            onClick={handleDeleteSection}
            className="text-[#0A0A0A]/20 hover:text-red-500 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Goal */}
      <div className="mb-1.5">
        <InlineEdit
          value={section.goal ?? ""}
          onSave={saveGoal}
          className="font-mono text-xs text-[#0A0A0A]/50"
          placeholder="goal — describe the week's objective for this project"
        />
      </div>

      {/* Assignee */}
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
            />
          ))}
      </div>

      {/* Add task input */}
      {showTaskInput ? (
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
            placeholder="Add task — press Enter"
            className="flex-1 font-serif text-sm bg-transparent border-b border-[#0A0A0A]/20 focus:outline-none focus:border-[#0A0A0A]/50 text-[#0A0A0A]/70 placeholder:text-[#0A0A0A]/30"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowTaskInput(true)}
          className="mt-2 flex items-center gap-1 font-mono text-[10px] text-[#0A0A0A]/25 hover:text-[#0A0A0A]/50 transition-colors"
        >
          <Plus size={10} />
          Add task
        </button>
      )}
    </div>
  );
}

// ─── AI Import Modal ──────────────────────────────────────────────────────────

type ReviewSection = ParsedSprintSection & { assigneeName: string };

/** Pre-process raw text before sending to AI — splits [ ] checkboxes onto separate lines */
function normalizeSprintText(raw: string): string {
  return raw
    .replace(/\[\s*x\s*\]/gi, "\n- [done] ")  // [x] → done bullet
    .replace(/\[\s*\]/g, "\n- ")               // [ ] → new bullet line
    .replace(/\n{3,}/g, "\n\n")               // collapse excessive blank lines
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
        setParsed(result.data.map((s) => ({ ...s, assigneeName: s.assigneeName ?? "" })));
      } else {
        setError(result.error ?? "Parse failed");
      }
    });
  }

  function updateAssignee(idx: number, val: string) {
    setParsed((prev) =>
      prev ? prev.map((s, i) => (i === idx ? { ...s, assigneeName: val } : s)) : prev
    );
  }

  function removeSection(idx: number) {
    setParsed((prev) => prev ? prev.filter((_, i) => i !== idx) : prev);
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
      {/* Trigger button — rendered inline by the parent */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#0A0A0A]/15 text-[#0A0A0A]/50 font-mono text-xs hover:border-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors"
      >
        <Sparkles size={11} />
        AI Parse
      </button>

      {/* Full-screen overlay modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16 px-4">
          <div className="w-full max-w-2xl bg-white border border-[#0A0A0A]/20 shadow-2xl max-h-[80vh] flex flex-col">
            {/* Modal header */}
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
              {/* ── Input area ── */}
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
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleParse();
                  }}
                  placeholder={
                    "Trackr — @adam\ngoal: keep outbound running, fix cost sync\n[ ] Fix tool cost sync\n[ ] Update pricing page\n[ ] Review Stripe webhook\n\nCursive — @maggie\n[ ] Onboard ABC Corp\n[ ] Fix lead import bug\n[ ] Send weekly report\n\nGeneral\n[ ] Review contracts\n[ ] Team standup notes"
                  }
                  rows={10}
                  className="w-full font-mono text-sm text-[#0A0A0A]/80 bg-[#F3F3EF] border border-[#0A0A0A]/10 p-4 focus:outline-none focus:border-[#0A0A0A]/30 resize-none placeholder:text-[#0A0A0A]/25 leading-relaxed"
                />
                {error && (
                  <p className="font-mono text-xs text-red-600 mt-2">{error}</p>
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

              {/* ── Parsed preview ── */}
              {parsed && (
                <div className="p-6">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-4">
                    {parsed.length} project{parsed.length !== 1 ? "s" : ""},{" "}
                    {totalTasks} task{totalTasks !== 1 ? "s" : ""} — assign each
                    section then import
                  </p>

                  <div className="space-y-3">
                    {parsed.map((section, si) => (
                      <div
                        key={si}
                        className="border border-[#0A0A0A]/10 p-4 flex items-start gap-4 bg-[#F3F3EF]/40"
                      >
                        {/* Left: project + tasks */}
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

                        {/* Right: assignee + remove */}
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
                            className="text-[#0A0A0A]/20 hover:text-red-500 transition-colors p-1"
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

            {/* Footer */}
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
                      Import {parsed.length} section{parsed.length !== 1 ? "s" : ""} · {totalTasks} tasks
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setParsed(null); setError(null); }}
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
  const [assigneeName, setAssigneeName] = useState("");
  const [goal, setGoal] = useState("");

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
    setAssigneeName("");
    setGoal("");
    setOpen(false);

    startTransition(async () => {
      await createSection(sprintId, {
        projectName: tempSection.projectName,
        assigneeName: tempSection.assigneeName,
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

  const inputCls =
    "w-full border-b border-[#0A0A0A]/20 py-1 font-mono text-sm bg-transparent focus:outline-none focus:border-[#0A0A0A]/50 placeholder:text-[#0A0A0A]/30";

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[#0A0A0A]/10 bg-white p-5"
    >
      <p className="font-serif font-bold text-[#0A0A0A] mb-4">
        Add Project Section
      </p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
            Project Name *
          </label>
          <input
            className={inputCls}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Cursive, TBGC, Wholesail..."
            list="project-options"
            required
            autoFocus
          />
          <datalist id="project-options">
            {projects.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
            Assignee
          </label>
          <input
            className={inputCls}
            value={assigneeName}
            onChange={(e) => setAssigneeName(e.target.value)}
            placeholder="adam wolfe, Maggie Byrne..."
            list="member-options"
          />
          <datalist id="member-options">
            {teamMembers.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </div>
        <div className="col-span-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
            Goal
          </label>
          <input
            className={inputCls}
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
      startTransition(async () => { await updateSprint(sprintId, { topOfMind: v }); });
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

  // Local state for optimistic updates
  const [title, setTitle] = useState(sprint.title);
  const [weeklyFocus, setWeeklyFocus] = useState(sprint.weeklyFocus ?? "");
  const [topOfMind, setTopOfMind] = useState(sprint.topOfMind ?? "");
  const [sections, setSections] = useState<SprintSection[]>(sprint.sections);

  // Sprint header edits
  function saveTitle(val: string) {
    setTitle(val);
    startTransition(async () => { await updateSprint(sprint.id, { title: val }); });
  }

  function saveWeeklyFocus(val: string) {
    setWeeklyFocus(val);
    startTransition(async () => { await updateSprint(sprint.id, { weeklyFocus: val }); });
  }

  // Section operations
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

  // Task operations (optimistic)
  function handleCreateTask(sectionId: string, content: string) {
    const newTask: SprintTask = {
      id: crypto.randomUUID(),
      content,
      isCompleted: false,
      sortOrder: 0,
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
      {/* Sprint title + AI Import button */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1">
          <InlineEdit
            value={title}
            onSave={saveTitle}
            className="text-3xl font-bold font-serif text-[#0A0A0A] tracking-tight block"
            placeholder="Sprint title"
          />
        </div>
        <div className="mt-2 shrink-0">
          <SprintAIImport
            sprintId={sprint.id}
            projects={projects}
            teamMembers={teamMembers}
            currentSectionCount={sections.length}
            onImported={handleImportSections}
          />
        </div>
      </div>

      {/* Weekly focus */}
      <div className="mb-2">
        <InlineEdit
          value={weeklyFocus}
          onSave={saveWeeklyFocus}
          className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/40"
          placeholder="WEEKLY FOCUS: ..."
        />
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

      {/* Add section */}
      <AddSectionForm
        sprintId={sprint.id}
        onAdd={handleAddSection}
        projects={projects}
        teamMembers={teamMembers}
        nextSortOrder={sections.length}
      />
    </div>
  );
}
