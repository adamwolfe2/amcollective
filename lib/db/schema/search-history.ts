/**
 * Search History Schema -- per-user recent search queries for the command palette.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const recentSearches = pgTable(
  "recent_searches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    query: text("query").notNull(),
    resultCount: integer("result_count").notNull().default(0),
    clickedType: varchar("clicked_type", { length: 50 }),
    clickedId: uuid("clicked_id"),
    searchedAt: timestamp("searched_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("recent_searches_user_searched_idx").on(
      table.userId,
      table.searchedAt
    ),
  ]
);
