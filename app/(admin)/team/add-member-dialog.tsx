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
import { inviteMember } from "@/lib/actions/team";
import { Plus } from "lucide-react";

export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("member");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await inviteMember({
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      role: role as "owner" | "admin" | "member",
      title: (formData.get("title") as string) || undefined,
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
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[#0A0A0A] rounded-none bg-[#F3F3EF]">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">
            Add Team Member
          </DialogTitle>
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
              placeholder="Full name"
              className="border-[#0A0A0A] rounded-none bg-white font-serif"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="font-mono text-xs uppercase tracking-wider">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="email@example.com"
              className="border-[#0A0A0A] rounded-none bg-white font-serif"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role" className="font-mono text-xs uppercase tracking-wider">
              Role
            </Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="border-[#0A0A0A] rounded-none bg-white font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-[#0A0A0A] rounded-none bg-white">
                <SelectItem value="member" className="font-mono text-xs">member</SelectItem>
                <SelectItem value="admin" className="font-mono text-xs">admin</SelectItem>
                <SelectItem value="owner" className="font-mono text-xs">owner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title" className="font-mono text-xs uppercase tracking-wider">
              Title
            </Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Senior Developer"
              className="border-[#0A0A0A] rounded-none bg-white font-serif"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
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
              {loading ? "Adding..." : "Add Member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
