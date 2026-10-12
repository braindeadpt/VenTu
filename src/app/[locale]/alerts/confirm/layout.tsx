import type { Metadata } from 'next';

// URL one-shot com token — nunca indexável (ver scripts/check-export-routes.js
// NOINDEX_ROUTE_PATHS). A página em si é 'use client' e não pode exportar
// metadata; o layout server-side faz-o por ela.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AlertConfirmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
