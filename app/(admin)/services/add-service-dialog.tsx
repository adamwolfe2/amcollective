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
import { createService } from "@/lib/actions/services";
import { Plus } from "lucide-react";

export function AddServiceDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const priceStr = formData.get("basePrice") as string;
    const priceCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : undefined;

    const result = await createService({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      category: (formData.get("category") as string) || undefined,
      basePrice: priceCents,
      pricePeriod: (formData.get("pricePeriod") as string) || undefined,
      isActive: true,
    });

    setLoading(false);
    if (result.success) {
      setOpen(false);
      router.refresh();
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
          Add Service
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[#0A0A0A] rounded-none bg-[#F3F3EF] w-full max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Add Service</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="name" className="font-mono text-xs uppercase tracking-wider">
              Name
            </Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="Service name"
              className="border-[#0A0A0A] rounded-none bg-white font-serif"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="font-mono text-xs uppercase tracking-wider">
              Description
            </Label>
            <Input
              id="description"
              name="description"
              placeholder="Brief description"
              className="border-[#0A0A0A] rounded-none bg-white font-serif"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category" className="font-mono text-xs uppercase tracking-wider">
              Category
            </Label>
            <Input
              id="category"
              name="category"
              placeholder="e.g. Development, Design, Consulting"
              className="border-[#0A0A0A] rounded-none bg-white font-serif"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="basePrice" className="font-mono text-xs uppercase tracking-wider">
                Price ($)
              </Label>
              <Input
                id="basePrice"
                name="basePrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="border-[#0A0A0A] rounded-none bg-white font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricePeriod" className="font-mono text-xs uppercase tracking-wider">
                Period
              </Label>
              <Input
                id="pricePeriod"
                name="pricePeriod"
                placeholder="e.g. /month, /hour, /project"
                className="border-[#0A0A0A] rounded-none bg-white font-mono"
              />
            </div>
          </div>
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
              disabled={loading}
              className="bg-[#0A0A0A] text-white rounded-none font-mono text-xs hover:bg-[#0A0A0A]/90"
            >
              {loading ? "Adding..." : "Add Service"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
