"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const COMPANY_TAGS = [
  "trackr",
  "wholesail",
  "taskspace",
  "cursive",
  "tbgc",
  "hook",
  "myvsl",
  "am_collective",
  "personal",
  "untagged",
] as const;

type CompanyTag = (typeof COMPANY_TAGS)[number];

interface Transaction {
  id: string;
  accountName: string;
  counterpartyName: string | null;
  amount: string;
  direction: string;
  status: string;
  description: string | null;
  companyTag: CompanyTag;
  postedAt: string | null;
  createdAt: string;
}

interface TransactionFeedProps {
  transactions: Transaction[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export function TransactionFeed({
  transactions,
  totalCount,
  page,
  pageSize,
}: TransactionFeedProps) {
  const [localTxns, setLocalTxns] = useState(transactions);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const totalPages = Math.ceil(totalCount / pageSize);

  async function updateTag(txnId: string, newTag: CompanyTag) {
    setUpdatingId(txnId);
    try {
      const res = await fetch(`/api/finance/transactions/${txnId}/tag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: newTag }),
      });
      if (res.ok) {
        setLocalTxns((prev) =>
          prev.map((t) => (t.id === txnId ? { ...t, companyTag: newTag } : t))
        );
      }
    } catch {
      // Silent fail — user can retry
    } finally {
      setUpdatingId(null);
    }
  }

  function formatAmount(amount: string, direction: string) {
    const num = Math.abs(Number(amount));
    const formatted = num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return direction === "credit" ? `+$${formatted}` : `-$${formatted}`;
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div>
      <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                Date
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                Account
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                Counterparty
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider text-right">
                Amount
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                Tag
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {localTxns.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-12 text-[#0A0A0A]/30 font-mono text-xs"
                >
                  No transactions found
                </TableCell>
              </TableRow>
            )}
            {localTxns.map((txn) => (
              <TableRow key={txn.id}>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                  {formatDate(txn.postedAt || txn.createdAt)}
                </TableCell>
                <TableCell className="font-serif text-sm">
                  {txn.accountName}
                </TableCell>
                <TableCell className="font-serif text-sm">
                  {txn.counterpartyName || (
                    <span className="text-[#0A0A0A]/30">—</span>
                  )}
                </TableCell>
                <TableCell
                  className={`font-mono text-sm text-right font-medium ${
                    txn.direction === "credit"
                      ? "text-[#0A0A0A]"
                      : txn.direction === "debit"
                        ? "text-[#0A0A0A]/60"
                        : ""
                  }`}
                >
                  {formatAmount(txn.amount, txn.direction)}
                </TableCell>
                <TableCell>
                  <select
                    value={txn.companyTag}
                    onChange={(e) =>
                      updateTag(txn.id, e.target.value as CompanyTag)
                    }
                    disabled={updatingId === txn.id}
                    className="text-[10px] font-mono uppercase tracking-wider bg-transparent border border-[#0A0A0A]/10 px-2 py-1 cursor-pointer hover:border-[#0A0A0A]/30 transition-colors disabled:opacity-50"
                  >
                    {COMPANY_TAGS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`rounded-none text-[9px] uppercase font-mono tracking-wider ${
                      txn.status === "pending"
                        ? "text-[#0A0A0A]/70 border-[#0A0A0A]/30"
                        : ""
                    }`}
                  >
                    {txn.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="font-mono text-xs text-[#0A0A0A]/50">
            {totalCount} total transactions
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/finance?page=${page - 1}`}
                className="px-3 py-1.5 text-xs font-mono border border-[#0A0A0A]/10 hover:border-[#0A0A0A]/30 transition-colors"
              >
                Prev
              </a>
            )}
            <span className="px-3 py-1.5 text-xs font-mono text-[#0A0A0A]/50">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <a
                href={`/finance?page=${page + 1}`}
                className="px-3 py-1.5 text-xs font-mono border border-[#0A0A0A]/10 hover:border-[#0A0A0A]/30 transition-colors"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
