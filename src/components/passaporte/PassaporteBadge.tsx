'use client';

import { useRef, useEffect, useState } from 'react';
import { Download, Share2, Check } from 'lucide-react';
import type { Spot } from '@/types';
import { getMacroRegion } from '@/lib/regions';
import { getTranslation } from '@/lib/i18n';

interface BadgeBreakdown {
  region: string;
  count: number;
  spots: string[];
}

interface PassaporteBadgeProps {
  checkins: string[];
  spots: Spot[];
  locale: string;
  userName?: string;
}

const BREAKDOWN_ORDER = ['Norte', 'Centro', 'Lisboa', 'Alentejo', 'Algarve', 'Açores', 'Madeira'];

function getBreakdown(checkins: string[], spots: Spot[]): BadgeBreakdown[] {
  const regionMap = new Map<string, string[]>();
  const regionLookup = new Map<string, string>();

  for (const spot of spots) {
    const macro = getMacroRegion(spot.region);
    if (macro) regionLookup.set(spot.id, macro);
  }

  for (const id of checkins) {
    const region = regionLookup.get(id) || 'Outros';
    if (!regionMap.has(region)) regionMap.set(region, []);
    regionMap.get(region)!.push(id);
  }

  return BREAKDOWN_ORDER
    .filter((r) => regionMap.has(r))
    .map((region) => ({
      region,
      count: regionMap.get(region)!.length,
      spots: regionMap.get(region)!,
    }));
}

function getBaseColor(): {
  bg: string; fg: string; accent: string; muted: string; subtle: string; divider: string;
} {
  return {
    bg: '#0F172A',
    fg: '#F1F5F9',
    accent: '#06B6D4',
    muted: '#CBD5E1',
    subtle: '#94A3B8',
    divider: 'rgba(255,255,255,0.12)',
  };
}

export default function PassaporteBadge({ checkins, spots, locale, userName }: PassaporteBadgeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = getTranslation(locale);
  const p = t.passaporte;
  const shareLabel = t.spotDetail.share;
  const copyLinkToast = t.spotDetail.copyLink;
  const [toast, setToast] = useState<string | null>(null);

  const breakdown = getBreakdown(checkins, spots);
  const total = checkins.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 600;
    const h = 380;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const c = getBaseColor();

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = c.divider;
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    ctx.fillStyle = c.accent;
    ctx.font = 'bold 28px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.title, w / 2, 52);

    if (userName) {
      ctx.fillStyle = c.subtle;
      ctx.font = '14px "Inter", system-ui, sans-serif';
      ctx.fillText(userName, w / 2, 76);
    }

    ctx.fillStyle = c.fg;
    ctx.font = 'bold 48px "Inter", system-ui, sans-serif';
    ctx.fillText(`${total}`, w / 2, 130);
    ctx.fillStyle = c.muted;
    ctx.font = '14px "Inter", system-ui, sans-serif';
    ctx.fillText(p.visitedSpots, w / 2, 150);

    ctx.strokeStyle = c.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 170);
    ctx.lineTo(w - 40, 170);
    ctx.stroke();

    const startY = 190;
    const rowH = 32;
    ctx.font = '13px "Inter", system-ui, sans-serif';

    breakdown.forEach((b, i) => {
      const y = startY + i * rowH;
      ctx.fillStyle = c.accent;
      ctx.textAlign = 'left';
      ctx.fillText(b.region, 40, y + 10);
      ctx.fillStyle = c.fg;
      ctx.textAlign = 'right';
      ctx.fillText(`${b.count}`, w - 40, y + 10);
    });

    if (breakdown.length === 0) {
      ctx.fillStyle = c.subtle;
      ctx.textAlign = 'center';
      ctx.font = '14px "Inter", system-ui, sans-serif';
      ctx.fillText(p.noCheckins, w / 2, startY + 10);
    }

    ctx.fillStyle = c.subtle;
    ctx.textAlign = 'center';
    ctx.font = '10px "Inter", system-ui, sans-serif';
    const intlLocale =
      locale === 'pt'
        ? 'pt-PT'
        : locale === 'es'
          ? 'es-ES'
          : locale === 'de'
            ? 'de-DE'
            : locale === 'fr'
              ? 'fr-FR'
              : 'en-US';
    const dateLabel = p.dateUpdated.replace(
      '{date}',
      new Intl.DateTimeFormat(intlLocale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date()),
    );
    ctx.fillText(`${dateLabel} · ventu.surf`, w / 2, h - 20);
  }, [checkins, spots, locale, userName, breakdown, total, p]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `ventu-passaporte.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('No blob');
      const file = new File([blob], 'ventu-passaporte.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: p.title });
    } catch {
      await navigator.clipboard.writeText(window.location.href);
      setToast(copyLinkToast);
      setTimeout(() => setToast(null), 2500);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-card overflow-hidden border border-divider shadow-card">
        <canvas ref={canvasRef} className="block w-full max-w-[520px]" />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleDownload}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-input bg-accent hover:bg-accent-hover active:bg-accent-active border border-transparent transition-opacity duration-150 shadow-card min-h-[44px]"
        >
          <Download className="w-4 h-4" aria-hidden />
          {p.download}
        </button>
        <button
          onClick={handleShare}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-input border border-divider text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors min-h-[44px]"
        >
          <Share2 className="w-4 h-4" aria-hidden />
          {shareLabel}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium shadow-lg bg-score-good/20 text-score-good border border-score-good/30">
          <Check className="w-4 h-4" />
          {toast}
        </div>
      )}
    </div>
  );
}

export { getBreakdown };
export type { BadgeBreakdown };