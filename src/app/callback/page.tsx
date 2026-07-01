'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [apiError, setApiError] = useState<string | null>(null);
  const code = searchParams.get('code');
  const error = !code ? 'OAuth code missing from redirect.' : apiError;

  useEffect(() => {
    if (!code) {
      const timer = setTimeout(() => router.push('/login'), 3000);
      return () => clearTimeout(timer);
    }

    async function exchangeCode() {
      try {
        const res = await fetch(`/api/auth/callback?code=${code}`);
        const data = await res.json();

        if (res.ok && data.success) {
          router.push('/');
        } else {
          setApiError(data.error || 'Authentication failed.');
          setTimeout(() => router.push('/login'), 4000);
        }
      } catch (err) {
        console.error(err);
        setApiError('A network error occurred. Please try again.');
        setTimeout(() => router.push('/login'), 4000);
      }
    }

    exchangeCode();
  }, [code, router]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#090a0f',
        color: '#fff',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          padding: '40px 24px',
        }}
      >
        {!error ? (
          <>
            <div
              style={{
                border: '4px solid rgba(88, 101, 242, 0.1)',
                borderLeftColor: 'var(--primary)',
                borderRadius: '50%',
                width: '50px',
                height: '50px',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 24px auto',
              }}
            />
            <style jsx global>{`
              @keyframes spin {
                to {
                  transform: rotate(360deg);
                }
              }
            `}</style>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '8px' }}>
              Authentifiziere...
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Bitte warten Sie, während wir Sie mit Discord einloggen.
            </p>
          </>
        ) : (
          <>
            <div
              style={{
                background: 'rgba(218, 55, 60, 0.1)',
                color: 'var(--danger)',
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                margin: '0 auto 24px auto',
                border: '1px solid rgba(218, 55, 60, 0.2)',
              }}
            >
              !
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--danger)' }}>
              Fehler
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
              {error}
            </p>
            <p style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>
              Leite zurück zum Login...
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#090a0f', color: '#fff' }}>
        Loading...
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
