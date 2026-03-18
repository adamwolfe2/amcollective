import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { TaskDetailActions } from "./task-detail-actions";
import { TaskCommentForm } from "./task-comment-form";

type PageProps = { params: Promise<{ id: string }> };

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "border-[#0A0A0A] bg-[#0A0A0A] text-white",
  high: "border-[#0A0A0A]/30 bg-transparent text-[#0A0A0A]/70",
  medium: "border-[#0A0A0A]/25 bg-[#0A0A0A]/5 text-[#0A0A0A]/60",
  low: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/40",
};

const STATUS_STYLES: Record<string, string> = {
  backlog: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/40",
  todo: "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/50",
  in_progress: "border-[#0A0A0A]/25 bg-[#0A0A0A]/5 text-[#0A0A0A]/60",
  in_review: "border-[#0A0A0A]/30 bg-transparent text-[#0A0A0A]/70",
  done: "border-[#0A0A0A] bg-[#0A0A0A] text-white",
  cancelled: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/30",
};

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [[row], comments, teamMembers] = await Promise.all([
    db
      .select({
        task: schema.tasks,
        assigneeName: schema.teamMembers.name,
        projectName: schema.portfolioProjects.name,
      })
      .from(schema.tasks)
      .leftJoin(
        schema.teamMembers,
        eq(schema.tasks.assigneeId, schema.teamMembers.id)
      )
      .leftJoin(
        schema.portfolioProjects,
        eq(schema.tasks.projectId, schema.portfolioProjects.id)
      )
      .where(eq(schema.tasks.id, id))
      .limit(1),
    db
      .select()
      .from(schema.taskComments)
      .where(eq(schema.taskComments.taskId, id))
      .orderBy(asc(schema.taskComments.createdAt))
      .limit(100),
    db
      .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
      .from(schema.teamMembers)
      .where(eq(schema.teamMembers.isActive, true))
      .orderBy(schema.teamMembers.name),
  ]);

  if (!row) notFound();

  const { task } = row;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            {task.title}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
                STATUS_STYLES[task.status] || STATUS_STYLES.todo
              }`}
            >
              {task.status.replace("_", " ")}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
                PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium
              }`}
            >
              {task.priority}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left -- Description + Comments */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <div className="border border-[#0A0A0A] bg-white p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
              Description
            </h2>
            {task.description ? (
              <p className="font-serif text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
                {task.description}
              </p>
            ) : (
              <p className="font-serif text-sm text-[#0A0A0A]/30 italic">
                No description provided.
              </p>
            )}
          </div>

          {/* Comments */}
          <div className="border border-[#0A0A0A] bg-white p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
              Comments ({comments.length})
            </h2>
            <div className="space-y-3 mb-4">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="border-l-2 border-[#0A0A0A]/10 pl-3 py-1"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs font-medium text-[#0A0A0A]">
                      {c.authorName || "Unknown"}
                    </span>
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                      {format(c.createdAt, "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  <p className="font-serif text-sm text-[#0A0A0A]/70">
                    {c.content}
                  </p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="font-serif text-sm text-[#0A0A0A]/30 italic">
                  No comments yet.
                </p>
              )}
            </div>
            <TaskCommentForm taskId={id} />
          </div>
        </div>

        {/* Right -- Details + Actions */}
        <div className="space-y-4">
          <div className="border border-[#0A0A0A] bg-white p-6 space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
              Details
            </h2>

            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                Assignee
              </p>
              <p className="font-serif text-sm">
                {row.assigneeName || "Unassigned"}
              </p>
            </div>

            {row.projectName && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                  Project
                </p>
                <p className="font-serif text-sm">{row.projectName}</p>
              </div>
            )}

            {task.dueDate && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                  Due Date
                </p>
                <p
                  className={`font-mono text-sm ${
                    new Date(task.dueDate) < new Date() &&
                    !["done", "cancelled"].includes(task.status)
                      ? "text-[#0A0A0A]/70 font-bold"
                      : ""
                  }`}
                >
                  {format(new Date(task.dueDate), "MMM d, yyyy")}
                </p>
              </div>
            )}

            {task.labels && task.labels.length > 0 && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                  Labels
                </p>
                <div className="flex gap-1 flex-wrap">
                  {task.labels.map((label) => (
                    <span
                      key={label}
                      className="font-mono text-[10px] border border-[#0A0A0A]/20 px-1.5 py-0.5"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                Created
              </p>
              <p className="font-mono text-sm">
                {format(task.createdAt, "MMM d, yyyy")}
              </p>
            </div>

            {task.completedAt && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                  Completed
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {format(task.completedAt, "MMM d, yyyy")}
                </p>
              </div>
            )}
          </div>

          <TaskDetailActions
            taskId={id}
            currentStatus={task.status}
            currentAssigneeId={task.assigneeId}
            teamMembers={teamMembers}
          />
        </div>
      </div>
    </div>
  );
}
