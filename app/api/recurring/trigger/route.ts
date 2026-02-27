/**
 * POST /api/recurring/trigger — Manual trigger for recurring invoice generation.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { inngest } from "@/lib/inngest/client";

export async function POST() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await inngest.send({
      name: "inngest/function.invoked",
      data: {
        function_id: "generate-recurring-invoices",
      },
    });

    return NextResponse.json({ success: true, message: "Recurring invoice generation triggered" });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring/trigger" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to trigger" },
      { status: 500 }
    );
  }
}
