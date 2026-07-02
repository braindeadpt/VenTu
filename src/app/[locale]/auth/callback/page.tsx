import AuthCallbackClient from '@/components/auth/AuthCallbackClient';

export default async function AuthCallbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AuthCallbackClient locale={locale} />;
}
