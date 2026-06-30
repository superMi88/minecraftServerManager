'use client';

import React from 'react';

export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = '/api/auth/login';
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
          textAlign: 'center',
          padding: '40px 32px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-color)',
          background: 'rgba(17, 19, 28, 0.9)',
          backdropFilter: 'blur(10px)',
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

        <button
          onClick={handleLogin}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '14px 20px',
            fontSize: '1rem',
            fontWeight: '700',
            boxShadow: '0 4px 15px rgba(88, 101, 242, 0.3)',
          }}
        >
          <svg
            style={{ width: '20px', height: '20px', fill: 'currentColor' }}
            viewBox="0 0 127.14 96.36"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c1.07-.77,2.1-1.59,3.07-2.44a74.74,74.74,0,0,0,72,0c1,.85,2,1.67,3.07,2.44a68.43,68.43,0,0,1-10.5,5A77.7,77.7,0,0,0,102.16,96.4a105.73,105.73,0,0,0,32.54-18.83C131,48.86,124.63,26.06,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
          </svg>
          Login mit Discord
        </button>

        <div style={{ marginTop: '24px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Berechtigungen werden über die integrierte Benutzerdatenbank verwaltet.
        </div>
      </div>
    </div>
  );
}
