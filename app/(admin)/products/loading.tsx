export default function ProductsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-40 bg-[#0A0A0A]/5 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-[#0A0A0A]/10 p-6 space-y-4 h-48 bg-[#0A0A0A]/[0.01] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
