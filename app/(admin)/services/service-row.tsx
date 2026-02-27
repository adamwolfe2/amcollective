"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateService, deleteService } from "@/lib/actions/services";
import { Pencil, Trash2 } from "lucide-react";

type ServiceData = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  basePrice: number | null;
  pricePeriod: string | null;
  isActive: boolean;
  sortOrder: number;
};

export function ServiceRow({
  service,
  formattedPrice,
}: {
  service: ServiceData;
  formattedPrice: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const priceStr = formData.get("basePrice") as string;
    const priceCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : undefined;

    const result = await updateService(service.id, {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      category: (formData.get("category") as string) || undefined,
      basePrice: priceCents,
      pricePeriod: (formData.get("pricePeriod") as string) || undefined,
    });

    setLoading(false);
    if (result.success) {
      setEditOpen(false);
      router.refresh();
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this service? This cannot be undone.")) return;
    setDeleting(true);
    const result = await deleteService(service.id);
    setDeleting(false);
    if (result.success) {
      router.refresh();
    }
  }

  return (
    <TableRow className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]">
      <TableCell>
        <div>
          <span className="font-serif font-medium text-[#0A0A0A]">
            {service.name}
          </span>
          {service.description && (
            <span className="block text-xs text-[#0A0A0A]/40 font-serif mt-0.5">
              {service.description}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {service.category ? (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]/20 rounded-none bg-[#0A0A0A]/5 text-[#0A0A0A]/60">
            {service.category}
          </span>
        ) : (
          <span className="text-[#0A0A0A]/30">{"\u2014"}</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-sm text-[#0A0A0A]">
        {formattedPrice}
      </TableCell>
      <TableCell className="font-mono text-xs text-[#0A0A0A]/50">
        {service.pricePeriod || "\u2014"}
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
            service.isActive
              ? "border-green-800 bg-green-50 text-green-800"
              : "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/40"
          }`}
        >
          {service.isActive ? "active" : "inactive"}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <button className="p-1.5 text-[#0A0A0A]/30 hover:text-[#0A0A0A]">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </DialogTrigger>
            <DialogContent className="border-[#0A0A0A] rounded-none bg-[#F3F3EF]">
              <DialogHeader>
                <DialogTitle className="font-serif text-lg">
                  Edit Service
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpdate} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider">
                    Name
                  </Label>
                  <Input
                    name="name"
                    required
                    defaultValue={service.name}
                    className="border-[#0A0A0A] rounded-none bg-white font-serif"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider">
                    Description
                  </Label>
                  <Input
                    name="description"
                    defaultValue={service.description || ""}
                    className="border-[#0A0A0A] rounded-none bg-white font-serif"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider">
                    Category
                  </Label>
                  <Input
                    name="category"
                    defaultValue={service.category || ""}
                    className="border-[#0A0A0A] rounded-none bg-white font-serif"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase tracking-wider">
                      Price ($)
                    </Label>
                    <Input
                      name="basePrice"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={
                        service.basePrice !== null
                          ? (service.basePrice / 100).toFixed(2)
                          : ""
                      }
                      className="border-[#0A0A0A] rounded-none bg-white font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase tracking-wider">
                      Period
                    </Label>
                    <Input
                      name="pricePeriod"
                      defaultValue={service.pricePeriod || ""}
                      className="border-[#0A0A0A] rounded-none bg-white font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    className="border-[#0A0A0A] rounded-none font-mono text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="bg-[#0A0A0A] text-white rounded-none font-mono text-xs hover:bg-[#0A0A0A]/90"
                  >
                    {loading ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 text-[#0A0A0A]/30 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}
