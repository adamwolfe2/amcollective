export default function ScorecardLoading() {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="h-8 w-36 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse mt-2" />
      </div>

      {/* Scorecard matrix skeleton */}
      <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
        <table className="min-w-[800px] w-full">
          <thead>
            <tr className="border-b border-[#0A0A0A]/10">
              <th className="min-w-[200px] p-2">
                <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
              </th>
              <th className="min-w-[60px] p-2">
                <div className="h-4 w-10 bg-[#0A0A0A]/5 animate-pulse" />
              </th>
              {Array.from({ length: 13 }).map((_, i) => (
                <th key={i} className="min-w-[64px] p-2">
                  <div className="h-4 w-10 bg-[#0A0A0A]/5 animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, row) => (
              <tr key={row} className="border-b border-[#0A0A0A]/5">
                <td className="p-2">
                  <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse" />
                  <div className="h-3 w-20 bg-[#0A0A0A]/5 animate-pulse mt-1" />
                </td>
                <td className="p-2">
                  <div className="h-4 w-8 bg-[#0A0A0A]/5 animate-pulse" />
                </td>
                {Array.from({ length: 13 }).map((_, col) => (
                  <td key={col} className="p-2">
                    <div className="h-4 w-8 bg-[#0A0A0A]/5 animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
