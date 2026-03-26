"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as messagesRepo from "@/lib/db/repositories/messages";
import { requireAuth } from "@/lib/auth";

const sendMessageSchema = z.object({
  channel: z.enum(["email", "sms", "blooio", "slack"]),
  to: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1),
  clientId: z.string().uuid().optional(),
  threadId: z.string().optional(),
});

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};


export async function getMessageThreads(): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await messagesRepo.getMessageThreads();
  return { success: true, data };
}

export async function getThread(threadId: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await messagesRepo.getThread(threadId);
  return { success: true, data };
}

export async function sendMessage(
  formData: z.infer<typeof sendMessageSchema>
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = sendMessageSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const msg = await messagesRepo.createMessage(
    {
      direction: "outbound",
      channel: parsed.data.channel,
      from: "team@amcollectivecapital.com",
      to: parsed.data.to,
      subject: parsed.data.subject,
      body: parsed.data.body,
      clientId: parsed.data.clientId,
      threadId: parsed.data.threadId,
    },
    userId
  );

  revalidatePath("/messages");
  return { success: true, data: msg };
}

export async function markThreadRead(threadId: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  await messagesRepo.markThreadRead(threadId);
  revalidatePath("/messages");
  return { success: true };
}
