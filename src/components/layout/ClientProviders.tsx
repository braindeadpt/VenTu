'use client';

import ServiceWorkerRegistration from './ServiceWorkerRegistration';
import InstallPrompt from './InstallPrompt';
import OfflineBanner from './OfflineBanner';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegistration />
      <OfflineBanner />
      <InstallPrompt />
      {children}
    </>
  );
}