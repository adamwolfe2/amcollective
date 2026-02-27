/**
 * GET /api/ai/conversations/[id]/export — Export a conversation as markdown.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get conversation
    const [conversation] = await db
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.id, id))
      .limit(1);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get messages
    const messages = await db
      .select()
      .from(schema.aiMessages)
      .where(eq(schema.aiMessages.conversationId, id))
      .orderBy(asc(schema.aiMessages.createdAt));

    // Build markdown
    const lines: string[] = [
      `# ${conversation.title ?? "Untitled Conversation"}`,
      "",
      `**Date**: ${conversation.createdAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`,
      `**Model**: ${conversation.model ?? "unknown"}`,
      `**Messages**: ${messages.length}`,
      "",
      "---",
      "",
    ];

    for (const msg of messages) {
      const roleLabel =
        msg.role === "user"
          ? "You"
          : msg.role === "assistant"
            ? "AM Agent"
            : msg.role;

      lines.push(`### ${roleLabel}`);
      lines.push("");
      lines.push(msg.content ?? "*(no content)*");
      lines.push("");

      if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
        const calls = msg.toolCalls as Array<{ name: string; id: string }>;
        if (calls.length > 0) {
          lines.push(
            `*Tools used: ${calls.map((tc) => `\`${tc.name}\``).join(", ")}*`
          );
          lines.push("");
        }
      }

      lines.push("---");
      lines.push("");
    }

    const markdown = lines.join("\n");
    const filename = `conversation-${id.slice(0, 8)}.md`;

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "ai/conversations/export" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to export conversation" },
      { status: 500 }
    );
  }
}
