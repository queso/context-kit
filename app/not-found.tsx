import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted font-sans">
      <main className="flex flex-col items-center gap-6 px-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          404 — Page not found
        </h1>
        <p className="max-w-md text-lg leading-8 text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button asChild size="lg">
          <Link href="/">Go back home</Link>
        </Button>
      </main>
    </div>
  )
}
