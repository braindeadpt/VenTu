'use client';

import ServiceWorkerRegistration from './ServiceWorkerRegistration';
import InstallPrompt from './InstallPrompt';
import OfflineBanner from './OfflineBanner';
import DaypartProvider from './DaypartProvider';
import ToastProvider from '@/components/ui/ToastProvider';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <DaypartProvider>
        <ServiceWorkerRegistration />
        <OfflineBanner />
        <InstallPrompt />
        {children}
      </DaypartProvider>
    </ToastProvider>
  );
}