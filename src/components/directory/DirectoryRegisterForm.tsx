'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';
import { submitDirectoryListing } from '@/lib/directoryListings';
import { DIRECTORY_KIND_LABELS } from '@/lib/directoryClient';
import type { DirectoryKind, DirectorySport } from '@/types/directory';
import { spots } from '@/lib/spots';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

const KINDS: DirectoryKind[] = [
  'surf_school',
  'kite_center',
  'shop',
  'windsurf',
  'club',
  'rental',
  'other',
];

const SPORTS: DirectorySport[] = [
  'surf',
  'kitesurf',
  'windsurf',
  'foil',
  'sup',
  'bodyboard',
  'wakeboard',
];

type Props = {
  locale: string;
  onCreated?: () => void;
};

export default function DirectoryRegisterForm({ locale, onCreated }: Props) {
  const isPt = locale === 'pt';
  const { session, requestLogin, isSupabaseReady, authLoading } = useAuth();

  const regionSpots = useMemo(() => {
    return [...spots].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  }, []);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<DirectoryKind>('surf_school');
  const [sports, setSports] = useState<DirectorySport[]>(['surf']);
  const [spotId, setSpotId] = useState(regionSpots[0]?.id ?? '');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleSport = (s: DirectorySport) => {
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!isSupabaseReady) {
      setError(isPt ? 'Auth indisponível.' : 'Auth unavailable.');
      return;
    }
    if (!session?.user) {
      requestLogin();
      return;
    }
    if (name.trim().length < 2) {
      setError(isPt ? 'Indica o nome da escola/loja.' : 'Enter the school/shop name.');
      return;
    }
    if (sports.length === 0) {
      setError(isPt ? 'Escolhe pelo menos um desporto.' : 'Pick at least one sport.');
      return;
    }
    const spot = spots.find((s) => s.id === spotId);
    if (!spot) {
      setError(isPt ? 'Escolhe um spot VenTu perto.' : 'Pick a nearby VenTu spot.');
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) return;

    setBusy(true);
    const res = await submitDirectoryListing(sb, {
      name: name.trim(),
      kind,
      sports,
      lat: spot.lat,
      lon: spot.lon,
      region: spot.region,
      regionEn: spot.regionEn,
      spotIds: [spot.id],
      website: website.trim() || undefined,
      phone: phone.trim() || undefined,
      email: session.user.email || undefined,
      address: address.trim() || undefined,
      userId: session.user.id,
    });
    setBusy(false);

    if (!res.ok) {
      const missing = /directory_listings|schema cache/i.test(res.error);
      setError(
        missing
          ? isPt
            ? 'Registo ainda não activo — corre supabase-directory.sql no Supabase.'
            : 'Registration not enabled — run supabase-directory.sql.'
          : res.error,
      );
      return;
    }

    setMessage(
      isPt
        ? 'Perfil criado e público como «Não verificado». Quando aprovarmos, passa a Verificado — podes editar em Gerir perfil.'
        : 'Profile created and public as “Unverified”. After we approve it becomes Verified — edit under Manage profile.',
    );
    setName('');
    setWebsite('');
    setPhone('');
    setAddress('');
    onCreated?.();
  };

  return (
    <div id="registar-escola">
    <Card variant="card-2" className="space-y-4" as="section">
      <div>
        <h2 className="font-display text-h2 text-fg">
          {isPt ? 'A tua escola não está listada?' : 'School not listed?'}
        </h2>
        <p className="text-body text-fg-muted mt-1">
          {isPt
            ? 'Regista o perfil — fica logo público como não verificado. Depois de aprovarmos, aparece como verificado. Grátis.'
            : 'Register the profile — it goes public immediately as unverified. After we approve, it shows as verified. Free.'}
        </p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <label className="block">
          <span className="text-meta-sm text-fg-muted">{isPt ? 'Nome' : 'Name'}</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
            placeholder={isPt ? 'Ex.: Escola de Surf XYZ' : 'e.g. XYZ Surf School'}
          />
        </label>

        <label className="block">
          <span className="text-meta-sm text-fg-muted">{isPt ? 'Tipo' : 'Type'}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DirectoryKind)}
            className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {isPt ? DIRECTORY_KIND_LABELS[k].pt : DIRECTORY_KIND_LABELS[k].en}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-meta-sm text-fg-muted">{isPt ? 'Desportos' : 'Sports'}</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {SPORTS.map((s) => {
              const active = sports.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSport(s)}
                  className={`pill min-h-[36px] px-3 py-1.5 text-meta ${
                    active ? 'pill-active' : 'pill-ghost'
                  }`}
                  aria-pressed={active}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-meta-sm text-fg-muted">
            {isPt ? 'Spot VenTu mais perto' : 'Nearest VenTu spot'}
          </span>
          <select
            value={spotId}
            onChange={(e) => setSpotId(e.target.value)}
            className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
          >
            {regionSpots.map((s) => (
              <option key={s.id} value={s.id}>
                {isPt ? s.name : s.nameEn} · {isPt ? s.region : s.regionEn}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-meta-sm text-fg-muted">Website</span>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
            placeholder="https://"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-meta-sm text-fg-muted">{isPt ? 'Telefone' : 'Phone'}</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
            />
          </label>
          <label className="block">
            <span className="text-meta-sm text-fg-muted">{isPt ? 'Morada' : 'Address'}</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
            />
          </label>
        </div>

        <Button
          type="submit"
          variant="secondary"
          disabled={busy || authLoading}
          loading={busy}
        >
          {!session?.user
            ? isPt
              ? 'Entrar para registar'
              : 'Sign in to register'
            : isPt
              ? 'Publicar perfil'
              : 'Publish profile'}
        </Button>

        {message && <p className="text-meta-sm text-score-good">{message}</p>}
        {error && <p className="text-meta-sm text-score-poor">{error}</p>}
      </form>
    </Card>
    </div>
  );
}
