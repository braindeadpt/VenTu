'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';
import { DIRECTORY_KIND_LABELS } from '@/lib/directoryClient';
import {
  fetchMyDirectoryListings,
  fetchMyDirectoryProfiles,
  updateDirectoryListing,
  updateDirectoryProfile,
  type DirectoryProfileRow,
} from '@/lib/directoryListings';
import type { DirectoryEntry, DirectoryKind, DirectorySport } from '@/types/directory';
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
  seedById: Record<string, DirectoryEntry>;
};

type OwnedProfile = DirectoryProfileRow & {
  overlay: import('@/lib/directoryListings').DirectoryProfileOverlay;
};

export default function DirectoryManageClient({ locale, seedById }: Props) {
  const isPt = locale === 'pt';
  const { session, authLoading, requestLogin, isSupabaseReady } = useAuth();
  const [listings, setListings] = useState<DirectoryEntry[]>([]);
  const [profiles, setProfiles] = useState<OwnedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const regionSpots = useMemo(
    () => [...spots].sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    [],
  );

  const reload = useCallback(async () => {
    const sb = getSupabaseClient();
    const userId = session?.user?.id;
    if (!sb || !userId) {
      setListings([]);
      setProfiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [mine, mineProfiles] = await Promise.all([
        fetchMyDirectoryListings(sb, userId),
        fetchMyDirectoryProfiles(sb, userId),
      ]);
      setListings(mine);
      setProfiles(mineProfiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!isSupabaseReady) {
    return (
      <main className="max-w-lg mx-auto px-4 py-10">
        <p className="text-body text-fg-muted">
          {isPt ? 'Contas indisponíveis.' : 'Accounts unavailable.'}
        </p>
      </main>
    );
  }

  if (authLoading || loading) {
    return (
      <main className="max-w-lg mx-auto px-4 py-10">
        <p className="text-body text-fg-muted">{isPt ? 'A carregar…' : 'Loading…'}</p>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="max-w-lg mx-auto px-4 py-10 space-y-4">
        <h1 className="font-display text-h2 text-fg">
          {isPt ? 'Gerir perfil' : 'Manage profile'}
        </h1>
        <p className="text-body text-fg-muted">
          {isPt
            ? 'Entra para editar as escolas ou lojas que geres.'
            : 'Sign in to edit schools or shops you manage.'}
        </p>
        <Button variant="secondary" onClick={() => requestLogin()}>
          {isPt ? 'Entrar' : 'Sign in'}
        </Button>
      </main>
    );
  }

  const empty = listings.length === 0 && profiles.length === 0;

  return (
    <main className="max-w-lg mx-auto px-4 py-8 sm:py-10 space-y-6">
      <nav className="text-meta-sm text-fg-muted">
        <Link href={`/${locale}/diretorio/`} className="hover:text-fg">
          {isPt ? 'Directório' : 'Directory'}
        </Link>
        <span className="mx-1.5" aria-hidden>
          /
        </span>
        <span className="text-fg">{isPt ? 'Gerir' : 'Manage'}</span>
      </nav>

      <header className="space-y-1">
        <h1 className="font-display text-display text-fg">
          {isPt ? 'As tuas escolas' : 'Your schools'}
        </h1>
        <p className="text-body text-fg-muted">
          {isPt
            ? 'Actualiza contactos, desportos e spot depois de verificados. Tier premium é definido pela VenTu.'
            : 'Update contacts, sports and spot after verification. Premium tier is set by VenTu.'}
        </p>
      </header>

      {error && <p className="text-meta-sm text-score-poor">{error}</p>}
      {okMsg && <p className="text-meta-sm text-score-good">{okMsg}</p>}

      {empty ? (
        <Card variant="card-1" className="space-y-3">
          <p className="text-body text-fg-muted">
            {isPt
              ? 'Ainda não geres nenhum perfil. Regista a escola no directório ou reclama um stub existente — depois de aprovarmos, editas aqui.'
              : 'You don’t manage any profile yet. Register on the directory or claim a stub — after we approve, edit here.'}
          </p>
          <Button href={`/${locale}/diretorio/`} variant="secondary" locale={locale as 'pt' | 'en'}>
            {isPt ? 'Ir ao directório' : 'Go to directory'}
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {listings.map((entry) => (
            <ListingEditor
              key={entry.id}
              locale={locale}
              entry={entry}
              spots={regionSpots}
              busy={busyId === entry.id}
              onSave={async (fields) => {
                const sb = getSupabaseClient();
                if (!sb) return;
                setBusyId(entry.id);
                setError(null);
                setOkMsg(null);
                const spot = fields.spotId
                  ? spots.find((s) => s.id === fields.spotId)
                  : undefined;
                const res = await updateDirectoryListing(sb, entry.id, {
                  name: fields.name,
                  kind: fields.kind,
                  sports: fields.sports,
                  website: fields.website,
                  phone: fields.phone,
                  address: fields.address,
                  spotIds: fields.spotId ? [fields.spotId] : entry.spotIds,
                  lat: spot?.lat,
                  lon: spot?.lon,
                  region: spot?.region ?? null,
                  regionEn: spot?.regionEn ?? null,
                });
                setBusyId(null);
                if (!res.ok) {
                  setError(
                    /policy|permission|RLS/i.test(res.error)
                      ? isPt
                        ? 'Sem permissão — corre o SQL actualizado (owner edit) no Supabase.'
                        : 'No permission — run updated supabase-directory.sql (owner edit).'
                      : res.error,
                  );
                  return;
                }
                setOkMsg(isPt ? 'Guardado.' : 'Saved.');
                await reload();
              }}
            />
          ))}

          {profiles.map((row) => {
            const seed = seedById[row.entry_id];
            return (
              <ProfileEditor
                key={row.entry_id}
                locale={locale}
                row={row}
                seed={seed}
                spots={regionSpots}
                busy={busyId === row.entry_id}
                onSave={async (fields) => {
                  const sb = getSupabaseClient();
                  if (!sb) return;
                  setBusyId(row.entry_id);
                  setError(null);
                  setOkMsg(null);
                  const res = await updateDirectoryProfile(sb, row.entry_id, {
                    displayName: fields.name,
                    bio: fields.bio,
                    website: fields.website,
                    phone: fields.phone,
                    sports: fields.sports,
                    spotIds: fields.spotId ? [fields.spotId] : undefined,
                  });
                  setBusyId(null);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setOkMsg(isPt ? 'Guardado.' : 'Saved.');
                  await reload();
                }}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}

type SpotOpt = { id: string; name: string; nameEn: string; region: string; regionEn: string };

type FormFields = {
  name: string;
  kind: DirectoryKind;
  sports: DirectorySport[];
  website: string;
  phone: string;
  address: string;
  bio: string;
  spotId: string;
};

function ListingEditor({
  locale,
  entry,
  spots: spotList,
  busy,
  onSave,
}: {
  locale: string;
  entry: DirectoryEntry;
  spots: SpotOpt[];
  busy: boolean;
  onSave: (f: FormFields) => Promise<void>;
}) {
  const isPt = locale === 'pt';
  const [name, setName] = useState(entry.name);
  const [kind, setKind] = useState(entry.kind);
  const [sports, setSports] = useState(entry.sports);
  const [website, setWebsite] = useState(entry.website || '');
  const [phone, setPhone] = useState(entry.phone || '');
  const [address, setAddress] = useState(entry.address || '');
  const [spotId, setSpotId] = useState(entry.spotIds[0] || spotList[0]?.id || '');

  useEffect(() => {
    setName(entry.name);
    setKind(entry.kind);
    setSports(entry.sports);
    setWebsite(entry.website || '');
    setPhone(entry.phone || '');
    setAddress(entry.address || '');
    setSpotId(entry.spotIds[0] || spotList[0]?.id || '');
  }, [entry, spotList]);

  const toggleSport = (s: DirectorySport) => {
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <Card variant="card-2" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-h3 text-fg">{entry.name}</h2>
        <span className={`text-meta-sm ${entry.verified ? 'text-score-good' : 'text-fg-subtle'}`}>
          {entry.verified
            ? isPt
              ? 'Verificado'
              : 'Verified'
            : isPt
              ? 'Não verificado'
              : 'Unverified'}
          {' · '}
          {entry.tier ?? 'free'}
        </span>
      </div>
      <OwnerFormFields
        locale={locale}
        showKind
        showAddress
        showBio={false}
        kinds={KINDS}
        sportsOptions={SPORTS}
        spots={spotList}
        name={name}
        kind={kind}
        sports={sports}
        website={website}
        phone={phone}
        address={address}
        bio=""
        spotId={spotId}
        setName={setName}
        setKind={setKind}
        setSports={toggleSport}
        setWebsite={setWebsite}
        setPhone={setPhone}
        setAddress={setAddress}
        setBio={() => undefined}
        setSpotId={setSpotId}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={busy}
        disabled={busy || sports.length === 0 || name.trim().length < 2}
        onClick={() =>
          void onSave({
            name: name.trim(),
            kind,
            sports,
            website,
            phone,
            address,
            bio: '',
            spotId,
          })
        }
      >
        {isPt ? 'Guardar' : 'Save'}
      </Button>
    </Card>
  );
}

function ProfileEditor({
  locale,
  row,
  seed,
  spots: spotList,
  busy,
  onSave,
}: {
  locale: string;
  row: OwnedProfile;
  seed?: DirectoryEntry;
  spots: SpotOpt[];
  busy: boolean;
  onSave: (f: FormFields) => Promise<void>;
}) {
  const isPt = locale === 'pt';
  const label = row.display_name || seed?.name || row.entry_id;
  const [name, setName] = useState(row.display_name || seed?.name || '');
  const [sports, setSports] = useState<DirectorySport[]>(
    (row.sports as DirectorySport[]) || seed?.sports || ['surf'],
  );
  const [website, setWebsite] = useState(row.website || seed?.website || '');
  const [phone, setPhone] = useState(row.phone || seed?.phone || '');
  const [bio, setBio] = useState(row.bio || '');
  const [spotId, setSpotId] = useState(
    row.spot_ids?.[0] || seed?.spotIds[0] || spotList[0]?.id || '',
  );

  useEffect(() => {
    setName(row.display_name || seed?.name || '');
    setSports((row.sports as DirectorySport[]) || seed?.sports || ['surf']);
    setWebsite(row.website || seed?.website || '');
    setPhone(row.phone || seed?.phone || '');
    setBio(row.bio || '');
    setSpotId(row.spot_ids?.[0] || seed?.spotIds[0] || spotList[0]?.id || '');
  }, [row, seed, spotList]);

  const toggleSport = (s: DirectorySport) => {
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <Card variant="card-2" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-h3 text-fg">{label}</h2>
        <span className={`text-meta-sm ${row.verified ? 'text-score-good' : 'text-fg-subtle'}`}>
          {isPt ? 'Claim' : 'Claim'}
          {' · '}
          {row.verified ? (isPt ? 'Verificado' : 'Verified') : isPt ? 'Pendente' : 'Pending'}
          {' · '}
          {row.tier}
        </span>
      </div>
      {seed?.slug && (
        <Link
          href={`/${locale}/diretorio/${seed.slug}/`}
          className="text-meta-sm text-fg-muted hover:text-fg underline-offset-2 hover:underline"
        >
          {isPt ? 'Ver página pública' : 'View public page'}
        </Link>
      )}
      <OwnerFormFields
        locale={locale}
        showKind={false}
        showAddress={false}
        showBio
        kinds={KINDS}
        sportsOptions={SPORTS}
        spots={spotList}
        name={name}
        kind={seed?.kind || 'surf_school'}
        sports={sports}
        website={website}
        phone={phone}
        address=""
        bio={bio}
        spotId={spotId}
        setName={setName}
        setKind={() => undefined}
        setSports={toggleSport}
        setWebsite={setWebsite}
        setPhone={setPhone}
        setAddress={() => undefined}
        setBio={setBio}
        setSpotId={setSpotId}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={busy}
        disabled={busy || sports.length === 0 || name.trim().length < 2}
        onClick={() =>
          void onSave({
            name: name.trim(),
            kind: seed?.kind || 'surf_school',
            sports,
            website,
            phone,
            address: '',
            bio,
            spotId,
          })
        }
      >
        {isPt ? 'Guardar' : 'Save'}
      </Button>
    </Card>
  );
}

function OwnerFormFields({
  locale,
  showKind,
  showAddress,
  showBio,
  kinds,
  sportsOptions,
  spots: spotList,
  name,
  kind,
  sports,
  website,
  phone,
  address,
  bio,
  spotId,
  setName,
  setKind,
  setSports,
  setWebsite,
  setPhone,
  setAddress,
  setBio,
  setSpotId,
}: {
  locale: string;
  showKind: boolean;
  showAddress: boolean;
  showBio: boolean;
  kinds: DirectoryKind[];
  sportsOptions: DirectorySport[];
  spots: SpotOpt[];
  name: string;
  kind: DirectoryKind;
  sports: DirectorySport[];
  website: string;
  phone: string;
  address: string;
  bio: string;
  spotId: string;
  setName: (v: string) => void;
  setKind: (v: DirectoryKind) => void;
  setSports: (s: DirectorySport) => void;
  setWebsite: (v: string) => void;
  setPhone: (v: string) => void;
  setAddress: (v: string) => void;
  setBio: (v: string) => void;
  setSpotId: (v: string) => void;
}) {
  const isPt = locale === 'pt';
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-meta-sm text-fg-muted">{isPt ? 'Nome' : 'Name'}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
        />
      </label>

      {showKind && (
        <label className="block">
          <span className="text-meta-sm text-fg-muted">{isPt ? 'Tipo' : 'Type'}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DirectoryKind)}
            className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {isPt ? DIRECTORY_KIND_LABELS[k].pt : DIRECTORY_KIND_LABELS[k].en}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset>
        <legend className="text-meta-sm text-fg-muted">{isPt ? 'Desportos' : 'Sports'}</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {sportsOptions.map((s) => {
            const active = sports.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSports(s)}
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
          {spotList.map((s) => (
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

      <label className="block">
        <span className="text-meta-sm text-fg-muted">{isPt ? 'Telefone' : 'Phone'}</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
        />
      </label>

      {showAddress && (
        <label className="block">
          <span className="text-meta-sm text-fg-muted">{isPt ? 'Morada' : 'Address'}</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1 w-full min-h-[44px] rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
          />
        </label>
      )}

      {showBio && (
        <label className="block">
          <span className="text-meta-sm text-fg-muted">{isPt ? 'Bio (curta)' : 'Short bio'}</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={1000}
            className="mt-1 w-full rounded-input border border-divider bg-bg-elevated px-3 py-2 text-body text-fg"
          />
        </label>
      )}
    </div>
  );
}
