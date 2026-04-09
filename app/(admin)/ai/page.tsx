import { Suspense } from "react";
import { AiPageContent } from "./ai-page-content";

export default async function AiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;

  return (
    <Suspense fallback={<AiSkeleton />}>
      <AiPageContent initialMessage={params.q} />
    </Suspense>
  );
}

function AiSkeleton() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] -mx-4 md:-mx-6 -mt-4 md:-mt-6">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-[#0A0A0A]/10 bg-white">
        <div className="w-6 h-6 bg-[#0A0A0A]/10 animate-pulse" />
        <div className="w-24 h-4 bg-[#0A0A0A]/10 animate-pulse" />
      </div>
      <div className="flex-1 min-h-0 bg-white" />
    </div>
  );
}
