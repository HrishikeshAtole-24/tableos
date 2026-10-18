import { Suspense } from 'react';
import { AuthScreen } from '@/components/AuthScreen';

export const metadata = { title: 'Create your free menu' };

export default function SignupPage() {
  return (
    <Suspense>
      <AuthScreen mode="signup" />
    </Suspense>
  );
}
