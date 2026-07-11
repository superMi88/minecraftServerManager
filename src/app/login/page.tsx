'use client';

import React, { useState } from 'react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Bitte geben Sie Name und Passwort ein.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.href = '/';
      } else {
        setError(data.error || 'Ungültiger Name oder Passwort.');
      }
    } catch (err) {
      console.error(err);
      setError('Verbindungsfehler. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'radial-gradient(circle at center, #1b2035 0%, #090a0f 100%)',
        padding: '20px',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '450px',
          width: '100%',
          padding: '40px 32px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-color)',
          background: 'rgba(17, 19, 28, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: '12px',
        }}
      >
        <div
          style={{
            background: 'var(--primary)',
            color: 'white',
            width: '60px',
            height: '60px',
            borderRadius: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            fontWeight: 'bold',
            marginBottom: '24px',
            boxShadow: '0 0 20px rgba(88, 101, 242, 0.4)',
          }}
        >
          M
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '8px', color: '#fff' }}>
          Server Control Panel
        </h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '0.95rem' }}>
          Standalone management console for Paper and CurseForge Minecraft servers.
        </p>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(218, 55, 60, 0.15)',
              color: 'var(--danger)',
              border: '1px solid rgba(218, 55, 60, 0.3)',
              borderRadius: 'var(--border-radius)',
              fontSize: '0.9rem',
              marginBottom: '24px',
              textAlign: 'left',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Benutzername
            </label>
            <input
              type="text"
              id="username"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="z.B. admin"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: '28px' }}>
            <label className="form-label" htmlFor="password">
              Passwort
            </label>
            <input
              type="password"
              id="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className={`btn btn-primary ${loading ? 'btn-disabled' : ''}`}
            style={{
              width: '100%',
              padding: '14px 20px',
              fontSize: '1rem',
              fontWeight: '700',
              boxShadow: '0 4px 15px rgba(88, 101, 242, 0.3)',
            }}
            disabled={loading}
          >
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Berechtigungen werden über die Server-Konfigurationsdatei verwaltet.
        </div>
      </div>
    </div>
  );
}
