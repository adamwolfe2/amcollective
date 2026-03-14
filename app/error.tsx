'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { captureError } from '@/lib/errors'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    captureError(error, { tags: { route: 'root' } })
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <AlertTriangle className="h-9 w-9 text-muted-foreground" />
      <div>
        <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Error</p>
        <h2 className="font-serif text-3xl sm:text-4xl font-bold">Something went wrong.</h2>
      </div>
      <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
        An unexpected error occurred. Your account and data are safe — try again or return to the dashboard.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button
          onClick={reset}
          className="bg-foreground text-background hover:bg-foreground/80 rounded-none h-10 px-6"
        >
          Try again
        </Button>
        <Button variant="outline" asChild className="rounded-none h-10 px-6">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
      {error.digest && (
        <p className="text-[10px] text-muted-foreground/50 font-mono mt-2">
          Error ID: {error.digest}
        </p>
      )}
    </div>
  )
}
