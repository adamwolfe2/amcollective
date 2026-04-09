"use client"

import { usePathname } from "next/navigation"

interface PageTransitionProps {
  children: React.ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()

  return (
    <div
      key={pathname}
      className="h-full animate-page-in motion-reduce:animate-none"
    >
      {children}
    </div>
  )
}
