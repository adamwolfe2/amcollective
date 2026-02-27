"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProject } from "@/lib/actions/projects";

export function AddProjectDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const slug = (formData.get("slug") as string) || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const domain = formData.get("domain") as string;
    const githubRepo = formData.get("githubRepo") as string;
    const vercelProjectId = formData.get("vercelProjectId") as string;

    const result = await createProject({
      name,
      slug,
      domain: domain || undefined,
      githubRepo: githubRepo || undefined,
      vercelProjectId: vercelProjectId || undefined,
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
          className="rounded-none border-[#0A0A0A] font-mono text-xs uppercase tracking-wider"
        >
          Add Project
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-none border-[#0A0A0A] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Add Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">
              Name
            </Label>
            <Input
              name="name"
              placeholder="e.g. TaskSpace"
              required
              className="rounded-none border-[#0A0A0A]/30 focus-visible:border-[#0A0A0A]"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">
              Slug
            </Label>
            <Input
              name="slug"
              placeholder="e.g. taskspace (auto-generated if blank)"
              className="rounded-none border-[#0A0A0A]/30 focus-visible:border-[#0A0A0A]"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">
              Domain
            </Label>
            <Input
              name="domain"
              placeholder="e.g. trytaskspace.com"
              className="rounded-none border-[#0A0A0A]/30 focus-visible:border-[#0A0A0A]"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">
              GitHub Repo
            </Label>
            <Input
              name="githubRepo"
              placeholder="e.g. adamwolfe2/taskspace"
              className="rounded-none border-[#0A0A0A]/30 focus-visible:border-[#0A0A0A]"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">
              Vercel Project ID
            </Label>
            <Input
              name="vercelProjectId"
              placeholder="e.g. prj_YiLr..."
              className="rounded-none border-[#0A0A0A]/30 focus-visible:border-[#0A0A0A]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="rounded-none font-mono text-xs uppercase tracking-wider"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-none bg-[#0A0A0A] text-white font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/80"
            >
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
