import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F3F3EF] flex flex-col items-center justify-center px-6 text-center">
      <p className="text-[10px] tracking-[0.3em] uppercase text-[#0A0A0A]/40 mb-6">
        404 · Page Not Found
      </p>
      <h1 className="font-serif text-5xl sm:text-7xl font-bold text-[#0A0A0A] mb-4 leading-none">
        Page not found.
      </h1>
      <p className="text-[#0A0A0A]/50 text-sm sm:text-base max-w-sm leading-relaxed mb-10">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 border border-[#0A0A0A] text-[#0A0A0A] px-7 py-3.5 text-sm font-medium hover:bg-[#0A0A0A] hover:text-[#F3F3EF] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>
    </div>
  )
}
