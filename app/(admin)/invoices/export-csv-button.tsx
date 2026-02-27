"use client";

import { Button } from "@/components/ui/button";

type InvoiceRow = {
  number: string;
  client: string;
  amount: number;
  status: string;
  dueDate: string;
  paidDate: string;
  created: string;
};

export function ExportCsvButton({ invoices }: { invoices: InvoiceRow[] }) {
  function handleExport() {
    const headers = [
      "Number",
      "Client",
      "Amount",
      "Status",
      "Due Date",
      "Paid Date",
      "Created",
    ];
    const rows = invoices.map((inv) => [
      inv.number,
      inv.client,
      `$${(inv.amount / 100).toFixed(2)}`,
      inv.status,
      inv.dueDate,
      inv.paidDate,
      inv.created,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      onClick={handleExport}
      variant="outline"
      className="border-[#0A0A0A] rounded-none font-mono text-xs"
      disabled={invoices.length === 0}
    >
      Export CSV
    </Button>
  );
}
