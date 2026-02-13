import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const siteUrl = process.env.SITE_URL || "http://localhost:3000"
const description = "An opinionated Next.js starter built for AI-assisted development."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "context-kit",
    template: "%s | context-kit",
  },
  description,
  openGraph: {
    title: "context-kit",
    description,
    type: "website",
    url: siteUrl,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  )
}
