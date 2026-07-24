import Link from 'next/link';
import { GraduationCap, MapPin, Store } from 'lucide-react';
import Card from '@/components/ui/Card';
import type { DirectoryEntry } from '@/types/directory';
import { kindLabel, sportLabel } from '@/lib/directory';
import DirectoryClaimButton from '@/components/directory/DirectoryClaimButton';

type Props = {
  entry: DirectoryEntry;
  locale: string;
  distanceKm?: number;
  showClaim?: boolean;
  compact?: boolean;
};

export default function DirectoryEntryCard({
  entry,
  locale,
  distanceKm,
  showClaim = false,
  compact = false,
}: Props) {
  const isPt = locale === 'pt';
  const name = isPt ? entry.name : entry.nameEn || entry.name;
  const hasStaticProfile = entry.source !== 'submitted';
  const href = hasStaticProfile ? `/${locale}/diretorio/${entry.slug}/` : undefined;
  const Icon = entry.kind === 'shop' || entry.kind === 'rental' ? Store : GraduationCap;

  return (
    <Card variant="card-1" className="space-y-3" as="article" id={entry.slug}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input border border-divider bg-surface-1/[0.04]">
          <Icon className="h-5 w-5 text-fg-muted" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {href ? (
              <Link href={href} className="font-display text-h3 text-fg hover:underline truncate">
                {name}
              </Link>
            ) : (
              <h3 className="font-display text-h3 text-fg truncate">{name}</h3>
            )}
            {entry.verified ? (
              <span className="text-meta-sm text-score-good">
                {isPt ? 'Verificado' : 'Verified'}
              </span>
            ) : (
              <span className="text-meta-sm text-fg-subtle">
                {isPt ? 'Não verificado' : 'Unverified'}
              </span>
            )}
          </div>
          <p className="text-meta-sm text-fg-muted">
            {kindLabel(entry.kind, locale)}
            {entry.region ? ` · ${isPt ? entry.region : entry.regionEn || entry.region}` : ''}
            {distanceKm != null ? ` · ${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}` : ''}
          </p>
          {entry.sports.length > 0 && (
            <p className="text-meta-sm text-fg-subtle">
              {entry.sports.map((s) => sportLabel(s, locale)).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {!compact && entry.address && (
        <p className="flex items-start gap-1.5 text-meta-sm text-fg-muted">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {entry.address}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {entry.website && (
          <a
            href={entry.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-meta-sm font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline"
          >
            {isPt ? 'Website' : 'Website'} ↗
          </a>
        )}
        {entry.spotIds[0] && (
          <Link
            href={`/${locale}/spots/${entry.spotIds[0]}/`}
            className="text-meta-sm font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline"
          >
            {isPt ? 'Spot próximo' : 'Nearby spot'}
          </Link>
        )}
        {href && (
          <Link
            href={href}
            className="text-meta-sm font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline"
          >
            {isPt ? 'Ver perfil' : 'View profile'}
          </Link>
        )}
      </div>

      {showClaim && <DirectoryClaimButton entryId={entry.id} entryName={name} locale={locale} />}
    </Card>
  );
}
