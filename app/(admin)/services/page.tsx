import type { Metadata } from "next";
import { getServices } from "@/lib/db/repositories/services";

export const metadata: Metadata = {
  title: "Services | AM Collective",
};
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddServiceDialog } from "./add-service-dialog";
import { ServiceRow } from "./service-row";

function formatPrice(cents: number | null, _period: string | null): string {
  if (cents === null) return "\u2014";
  const dollars = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `$${dollars}`;
}

export default async function ServicesPage() {
  const services = await getServices();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Services
        </h1>
        <AddServiceDialog />
      </div>

      <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/20">
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Name
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Category
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Price
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Period
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Active
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                >
                  No services yet. Add your first service to get started.
                </TableCell>
              </TableRow>
            )}
            {services.map((service) => (
              <ServiceRow
                key={service.id}
                service={{
                  id: service.id,
                  name: service.name,
                  description: service.description,
                  category: service.category,
                  basePrice: service.basePrice,
                  pricePeriod: service.pricePeriod,
                  isActive: service.isActive,
                  sortOrder: service.sortOrder,
                }}
                formattedPrice={formatPrice(service.basePrice, service.pricePeriod)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
