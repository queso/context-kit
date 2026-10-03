"use client"

import { Button } from "@/components/ui/button"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted font-sans">
      <main className="flex flex-col items-center gap-6 px-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          An unexpected error occurred
        </h1>
        <p className="max-w-md text-lg leading-8 text-muted-foreground">
          We ran into a problem loading this page. Please try again.
        </p>
        <Button onClick={reset} size="lg">
          Try again
        </Button>
      </main>
    </div>
  )
}
