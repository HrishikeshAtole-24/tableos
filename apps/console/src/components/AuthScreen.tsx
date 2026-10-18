'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Icon, Input, Logo, OtpInput, useToast } from '@tableos/ui';
import { supabase } from '@/lib/supabase';
import s from './auth.module.css';

const RESEND_SECONDS = 60;

/**
 * Email OTP sign-in / sign-up (spec §3.6): 6 digits, 5-minute expiry, 60-second resend wait.
 * Phone OTP follows after DLT registration; the user adds a phone later from Settings.
 */
export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  useEffect(() => {
    void supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(params.get('next') || '/dashboard');
      });
  }, [params, router]);

  const send = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address');
    setBusy(true);
    const { error: err } = await supabase().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) return setError(err.message.includes('rate') ? 'Please wait a minute before asking for another code.' : err.message);
    setStep('code');
    setCode('');
    setWait(RESEND_SECONDS);
    toast.success(`Code sent to ${email.trim()}`);
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token: value, type: 'email' });
    setBusy(false);
    if (err) {
      setError(err.message.toLowerCase().includes('expired') ? 'This code has expired. Ask for a new one.' : 'That code is not right. Check and try again.');
      setCode('');
      return;
    }
    const next = params.get('next');
    router.replace(next && next.startsWith('/') ? next : mode === 'signup' ? '/onboarding' : '/dashboard');
  };

  return (
    <div className={s.wrap}>
      <aside className={s.side}>
        <Logo size={36} inverse />
        <div className={s.sideBody}>
          <h2>Run your dining room from one screen.</h2>
          <ul>
            <li><Icon name="check" size={18} strokeWidth={3} /> Free QR menu with photos</li>
            <li><Icon name="check" size={18} strokeWidth={3} /> Orders straight to the kitchen</li>
            <li><Icon name="check" size={18} strokeWidth={3} /> ₹2 per order, never more than ₹999 a month</li>
          </ul>
        </div>
        <p className={s.sideFoot}>Diner payments go straight to you, never through us.</p>
      </aside>
      <main className={s.main}>
        <div className={s.card}>
          <div className={s.mobileLogo}>
            <Logo size={32} />
          </div>
          {step === 'email' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className={s.form}
            >
              <h1>{mode === 'signup' ? 'Create your free menu' : 'Welcome back'}</h1>
              <p className={s.lead}>{mode === 'signup' ? 'Start with your email. We will send you a 6-digit code. No password needed.' : 'Sign in with a one-time code sent to your email.'}</p>
              <Input label="Email address" type="email" autoComplete="email" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@restaurant.in" icon="mail" error={error} />
              <Button type="submit" size="lg" block loading={busy}>
                Send code
              </Button>
              <p className={s.switch}>
                {mode === 'signup' ? (
                  <>
                    Already using TableOS? <a href="/login">Sign in</a>
                  </>
                ) : (
                  <>
                    New to TableOS? <a href="/signup">Create a free menu</a>
                  </>
                )}
              </p>
            </form>
          ) : (
            <div className={s.form}>
              <button type="button" className={s.back} onClick={() => setStep('email')}>
                <Icon name="arrowLeft" size={18} /> Change email
              </button>
              <h1>Enter the code</h1>
              <p className={s.lead}>
                We sent a 6-digit code to <strong>{email}</strong>. It expires in 5 minutes.
              </p>
              <OtpInput
                value={code}
                error={Boolean(error)}
                disabled={busy}
                onChange={(v) => {
                  setCode(v);
                  setError(null);
                  if (v.length === 6) void verify(v);
                }}
              />
              {error && (
                <p className={s.error} role="alert">
                  <Icon name="alert" size={16} /> {error}
                </p>
              )}
              <Button size="lg" block loading={busy} disabled={code.length !== 6} onClick={() => void verify()}>
                Verify and continue
              </Button>
              <p className={s.switch}>
                Didn’t get it?{' '}
                {wait > 0 ? (
                  <span className={s.muted}>Resend in {wait}s</span>
                ) : (
                  <button type="button" onClick={() => void send()} className={s.linkBtn}>
                    Resend code
                  </button>
                )}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
