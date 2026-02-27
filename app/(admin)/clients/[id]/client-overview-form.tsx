"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClient } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

type ClientData = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  portalAccess: boolean;
  accessLevel: string;
  clerkUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function ClientOverviewForm({ client }: { client: ClientData }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);

    const form = new FormData(e.currentTarget);
    const portalAccess = form.get("portalAccess") === "on";

    const result = await updateClient(client.id, {
      name: form.get("name") as string,
      companyName: (form.get("companyName") as string) || undefined,
      email: (form.get("email") as string) || undefined,
      phone: (form.get("phone") as string) || undefined,
      website: (form.get("website") as string) || undefined,
      notes: (form.get("notes") as string) || undefined,
      portalAccess,
    });

    setPending(false);

    if (!result.success) {
      setError(result.error || "Failed to update client.");
      return;
    }

    setSuccess(true);
    router.refresh();
    setTimeout(() => setSuccess(false), 2000);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Contact Info */}
        <div className="space-y-5">
          <h3 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 mb-4">
            Contact Information
          </h3>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Name
            </Label>
            <Input
              name="name"
              defaultValue={client.name}
              required
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Company
            </Label>
            <Input
              name="companyName"
              defaultValue={client.companyName || ""}
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Email
            </Label>
            <Input
              name="email"
              type="email"
              defaultValue={client.email || ""}
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Phone
            </Label>
            <Input
              name="phone"
              defaultValue={client.phone || ""}
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Website
            </Label>
            <Input
              name="website"
              defaultValue={client.website || ""}
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
            />
          </div>
        </div>

        {/* Notes & Settings */}
        <div className="space-y-5">
          <h3 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 mb-4">
            Settings & Notes
          </h3>

          <div className="flex items-center justify-between border border-[#0A0A0A]/10 p-4">
            <div>
              <p className="font-mono text-sm font-medium text-[#0A0A0A]">
                Portal Access
              </p>
              <p className="font-mono text-xs text-[#0A0A0A]/40 mt-0.5">
                Allow this client to access their portal
              </p>
            </div>
            <Switch
              name="portalAccess"
              defaultChecked={client.portalAccess}
            />
          </div>

          <div className="border border-[#0A0A0A]/10 p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
              Access Level
            </p>
            <p className="font-mono text-sm font-medium text-[#0A0A0A] capitalize">
              {client.accessLevel}
            </p>
          </div>

          {client.clerkUserId && (
            <div className="border border-[#0A0A0A]/10 p-4">
              <p className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
                Clerk User ID
              </p>
              <p className="font-mono text-xs text-[#0A0A0A]/60 break-all">
                {client.clerkUserId}
              </p>
            </div>
          )}

          <Separator className="bg-[#0A0A0A]/10" />

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Notes
            </Label>
            <Textarea
              name="notes"
              defaultValue={client.notes || ""}
              rows={5}
              placeholder="Internal notes about this client..."
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 mt-8 pt-6 border-t border-[#0A0A0A]/10">
        <Button
          type="submit"
          disabled={pending}
          className="font-mono text-xs uppercase tracking-wider rounded-none bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80"
        >
          {pending ? "Saving..." : "Save Changes"}
        </Button>
        {success && (
          <span className="font-mono text-xs text-[#0A0A0A]/40">
            Saved successfully.
          </span>
        )}
        {error && (
          <span className="font-mono text-xs text-red-600">{error}</span>
        )}
      </div>
    </form>
  );
}
