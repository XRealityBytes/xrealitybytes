import type { Metadata } from 'next';

import { PageTransition } from '@/components/PageTransition';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://xrealitybytes.com'),
  title: {
    default: 'XRealityBytes Lab | WebGPU + In-Browser AI Experiments',
    template: '%s | XRealityBytes Lab',
  },
  description:
    'XRealityBytes Lab is a public, weekly-evolving lab for WebGPU graphics and in-browser AI experiments with reliable fallback tiers.',
  openGraph: {
    title: 'XRealityBytes Lab',
    description:
      'Weekly experimental releases for WebGPU graphics and in-browser AI systems.',
    siteName: 'XRealityBytes Lab',
    type: 'website',
    images: ['/og/default-og.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'XRealityBytes Lab',
    description: 'WebGPU and in-browser AI experiments with production-grade fallback design.',
    images: ['/og/default-og.svg'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_90%_20%,rgba(56,189,248,0.14),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.5),transparent_40%)]" />
          <div className="absolute inset-0 bg-grid opacity-30" />
        </div>
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-12">
          <PageTransition>{children}</PageTransition>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
