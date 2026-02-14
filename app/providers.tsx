"use client"

import type { ReactNode } from "react"
import type { SSEConfig } from "reactive-swr"
import { SSEProvider } from "reactive-swr"
import { SWRConfig } from "swr"
import { fetcher } from "@/lib/fetcher"

interface ProvidersProps {
  children: ReactNode
  sseConfig?: SSEConfig
}

export function Providers({ children, sseConfig }: ProvidersProps) {
  const content = (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        dedupingInterval: 2000,
      }}
    >
      {children}
    </SWRConfig>
  )

  if (sseConfig) {
    return <SSEProvider config={sseConfig}>{content}</SSEProvider>
  }

  return content
}
