import { Suspense } from 'react';
import { AuthScreen } from '@/components/AuthScreen';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthScreen mode="login" />
    </Suspense>
  );
}
