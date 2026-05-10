'use client';

import { useEffect } from 'react';

export default function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.classList.add('dark');
  }, [locale]);

  return null;
}