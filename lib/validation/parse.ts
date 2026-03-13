import { NextResponse } from "next/server";
import { z } from "zod";

type ParseSuccess<T> = { data: T; response?: never };
type ParseFailure = { data?: never; response: NextResponse };

/**
 * Parse and validate a request body against a Zod schema.
 * Returns `{ data }` on success or `{ response }` (400) on failure.
 */
export function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown
): ParseSuccess<T> | ParseFailure {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return {
      response: NextResponse.json(
        {
          error: "Validation failed",
          field: firstError?.path?.join(".") || undefined,
          message: firstError?.message,
        },
        { status: 400 }
      ),
    };
  }
  return { data: parsed.data };
}
