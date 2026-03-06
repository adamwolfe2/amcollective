"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { createInvoice } from "@/lib/actions/invoices";
import { Plus, Trash2 } from "lucide-react";

type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

type Client = {
  id: string;
  name: string;
  companyName: string | null;
  stripeCustomerId: string | null;
};

export function CreateInvoiceDialog({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState("");
  const [sendViaStripe, setSendViaStripe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const router = useRouter();

  const selectedClient = clients.find((c) => c.id === clientId);
  const clientHasStripe = !!selectedClient?.stripeCustomerId;

  function addLineItem() {
    setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems];
    if (field === "description") {
      updated[index] = { ...updated[index], description: value as string };
    } else if (field === "quantity") {
      updated[index] = { ...updated[index], quantity: Number(value) || 1 };
    } else if (field === "unitPrice") {
      updated[index] = { ...updated[index], unitPrice: Math.round(Number(value) * 100) };
    }
    setLineItems(updated);
  }

  function totalCents(): number {
    return lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientId) return;
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const validLineItems = lineItems.filter((li) => li.description.trim());

    const result = await createInvoice({
      clientId,
      amount: totalCents(),
      currency: "usd",
      number: (formData.get("number") as string) || undefined,
      dueDate: (formData.get("dueDate") as string) || undefined,
      lineItems: validLineItems.length > 0 ? validLineItems : undefined,
      sendViaStripe,
    });

    setLoading(false);
    if (result.success) {
      setOpen(false);
      setClientId("");
      setSendViaStripe(false);
      setError(null);
      setLineItems([{ description: "", quantity: 1, unitPrice: 0 }]);
      router.refresh();
    } else {
      setError(result.error || "Failed to create invoice");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90 hover:text-white rounded-none font-mono text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[#0A0A0A] rounded-none bg-[#F3F3EF] max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">
            Create Invoice
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">
              Client
            </Label>
            <Select
              value={clientId}
              onValueChange={(value) => {
                setClientId(value);
                // Reset Stripe toggle if new client has no Stripe ID
                const newClient = clients.find((c) => c.id === value);
                if (!newClient?.stripeCustomerId) {
                  setSendViaStripe(false);
                }
              }}
            >
              <SelectTrigger className="border-[#0A0A0A] rounded-none bg-white font-serif text-sm">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent className="border-[#0A0A0A] rounded-none bg-white">
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="font-serif text-sm">
                    {c.name}
                    {c.companyName ? ` (${c.companyName})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="number" className="font-mono text-xs uppercase tracking-wider">
                Invoice Number
              </Label>
              <Input
                id="number"
                name="number"
                placeholder="INV-001"
                className="border-[#0A0A0A] rounded-none bg-white font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate" className="font-mono text-xs uppercase tracking-wider">
                Due Date
              </Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                className="border-[#0A0A0A] rounded-none bg-white font-mono text-sm"
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-mono text-xs uppercase tracking-wider">
                Line Items
              </Label>
              <button
                type="button"
                onClick={addLineItem}
                className="font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A] underline"
              >
                + Add item
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      updateLineItem(index, "description", e.target.value)
                    }
                    className="flex-1 border-[#0A0A0A] rounded-none bg-white font-serif text-sm"
                  />
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) =>
                      updateLineItem(index, "quantity", e.target.value)
                    }
                    className="w-16 border-[#0A0A0A] rounded-none bg-white font-mono text-sm"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Price ($)"
                    value={item.unitPrice ? (item.unitPrice / 100).toFixed(2) : ""}
                    onChange={(e) =>
                      updateLineItem(index, "unitPrice", e.target.value)
                    }
                    className="w-24 border-[#0A0A0A] rounded-none bg-white font-mono text-sm"
                  />
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="p-2 text-[#0A0A0A]/30 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Send via Stripe */}
          <div className="border border-[#0A0A0A]/10 bg-white p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sendViaStripe"
                checked={sendViaStripe}
                onCheckedChange={(checked) =>
                  setSendViaStripe(checked === true)
                }
                disabled={!clientHasStripe && !!clientId}
                className="border-[#0A0A0A] rounded-none data-[state=checked]:bg-[#0A0A0A] data-[state=checked]:border-[#0A0A0A]"
              />
              <Label
                htmlFor="sendViaStripe"
                className="font-mono text-xs uppercase tracking-wider cursor-pointer"
              >
                Send via Stripe
              </Label>
            </div>
            {sendViaStripe && (
              <p className="font-mono text-[10px] text-[#0A0A0A]/50 pl-6">
                Invoice will be created in Stripe and emailed to the client
              </p>
            )}
            {clientId && !clientHasStripe && (
              <p className="font-mono text-[10px] text-red-600 pl-6">
                Selected client has no Stripe customer ID
              </p>
            )}
          </div>

          {/* Total */}
          <div className="flex justify-between items-center border-t border-[#0A0A0A]/10 pt-3">
            <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
              Total
            </span>
            <span className="font-mono text-lg font-medium text-[#0A0A0A]">
              ${(totalCents() / 100).toFixed(2)}
            </span>
          </div>

          {/* Error display */}
          {error && (
            <div className="border border-red-600 bg-red-50 p-2">
              <p className="font-mono text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-[#0A0A0A] rounded-none font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !clientId}
              className="bg-[#0A0A0A] text-white rounded-none font-mono text-xs hover:bg-[#0A0A0A]/90"
            >
              {loading
                ? sendViaStripe
                  ? "Sending via Stripe..."
                  : "Creating..."
                : sendViaStripe
                  ? "Create & Send via Stripe"
                  : "Create Invoice"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
