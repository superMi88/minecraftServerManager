'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface User {
  userId: string | null;
  username: string;
  avatar: string | null;
  admin: boolean;
}

interface Server {
  id: string;
  name: string;
  type: 'PAPER' | 'CURSEFORGE';
  port: number;
  memoryMin: string;
  memoryMax: string;
  jarFile: string | null;
  opPlayer: string | null;
  isRunning: boolean;
  createdAt: string;
}

export default function DashboardClient({ user }: { user: User }) {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'PAPER' | 'CURSEFORGE'>('PAPER');
  const [port, setPort] = useState('25565');
  const [memoryMin, setMemoryMin] = useState('2048M');
  const [memoryMax, setMemoryMax] = useState('6144M');
  const [jarFile, setJarFile] = useState('server.jar');
  const [curseForgeZip, setCurseForgeZip] = useState('');
  const [opPlayer, setOpPlayer] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Uploads management state
  const [zips, setZips] = useState<{ name: string; size: number; createdAt: string }[]>([]);
  const [jars, setJars] = useState<{ name: string; size: number; createdAt: string }[]>([]);
  const [activeDashboardTab, setActiveDashboardTab] = useState<'servers' | 'uploads'>('servers');

  const [zipUploadFile, setZipUploadFile] = useState<File | null>(null);
  const [zipUploadLoading, setZipUploadLoading] = useState(false);
  const [zipUploadError, setZipUploadError] = useState<string | null>(null);
  const [zipUploadSuccess, setZipUploadSuccess] = useState<string | null>(null);

  const [jarUploadFile, setJarUploadFile] = useState<File | null>(null);
  const [jarUploadLoading, setJarUploadLoading] = useState(false);
  const [jarUploadError, setJarUploadError] = useState<string | null>(null);
  const [jarUploadSuccess, setJarUploadSuccess] = useState<string | null>(null);

  // Fetch servers list
  const fetchServers = async () => {
    try {
      const res = await fetch('/api/servers');
      const data = await res.json();
      if (res.ok && data.success) {
        setServers(data.servers);
      } else {
        setError(data.error || 'Failed to fetch servers.');
      }
    } catch (err) {
      console.error(err);
      setError('A network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUploads = async () => {
    try {
      const res = await fetch('/api/uploads');
      const data = await res.json();
      if (res.ok && data.success) {
        setZips(data.zips);
        setJars(data.jars);
      }
    } catch (err) {
      console.error('Failed to fetch uploads:', err);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchServers();
      fetchUploads();
    });
    
    // Poll servers status every 5 seconds to keep dashboard up to date
    const interval = setInterval(fetchServers, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle server start/stop actions from dashboard
  const handleServerAction = async (serverId: string, isRunning: boolean, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigating to detail page when clicking button
    const action = isRunning ? 'STOP' : 'START';
    
    // Instantly update UI status to "Starting..." or "Stopping..." locally for immediate feedback
    setServers((prev) =>
      prev.map((s) =>
        s.id === serverId
          ? { ...s, isRunning: !isRunning } // toggle
          : s
      )
    );

    try {
      const res = await fetch(`/api/servers/${serverId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`Action failed: ${data.error || 'Unknown error'}`);
        fetchServers(); // Revert status
      }
    } catch (err) {
      console.error(err);
      fetchServers(); // Revert status
    }
  };

  // Handle server creation
  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);

    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          port,
          memoryMin,
          memoryMax,
          jarFile: type === 'PAPER' ? jarFile : undefined,
          curseForgeZip: type === 'CURSEFORGE' ? curseForgeZip : undefined,
          opPlayer: opPlayer || undefined,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setModalOpen(false);
        // Clear fields
        setName('');
        setPort('25565');
        setMemoryMin('2048M');
        setMemoryMax('6144M');
        setJarFile('server.jar');
        setCurseForgeZip('');
        setOpPlayer('');
        fetchServers(); // reload list
      } else {
        setCreateError(data.error || 'Failed to create server.');
      }
    } catch (err) {
      console.error(err);
      setCreateError('A network error occurred.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleZipUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zipUploadFile) return;
    setZipUploadLoading(true);
    setZipUploadError(null);
    setZipUploadSuccess(null);
    const formData = new FormData();
    formData.append('file', zipUploadFile);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        setZipUploadSuccess(data.message);
        setZipUploadFile(null);
        fetchUploads();
      } else {
        setZipUploadError(data.error || 'Upload failed.');
      }
    } catch {
      setZipUploadError('Network error uploading file.');
    } finally {
      setZipUploadLoading(false);
    }
  };

  const handleJarUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jarUploadFile) return;
    setJarUploadLoading(true);
    setJarUploadError(null);
    setJarUploadSuccess(null);
    const formData = new FormData();
    formData.append('file', jarUploadFile);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        setJarUploadSuccess(data.message);
        setJarUploadFile(null);
        fetchUploads();
      } else {
        setJarUploadError(data.error || 'Upload failed.');
      }
    } catch {
      setJarUploadError('Network error uploading file.');
    } finally {
      setJarUploadLoading(false);
    }
  };

  const handleDeleteFile = async (name: string, type: 'zip' | 'jar') => {
    if (!confirm(`Möchtest du die Datei "${name}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/uploads?name=${encodeURIComponent(name)}&type=${type}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchUploads();
      } else {
        alert(data.error || 'Failed to delete file.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error deleting file.');
    }
  };

  return (
    <div>
      {/* Header */}
      <header className="header">
        <Link href="/" className="logo-container">
          <div className="logo-icon">MC</div>
          <span>Minecraft Server Manager</span>
        </Link>
        <div className="user-profile">
          <span style={{ fontWeight: 600 }}>{user.username}</span>
          {user.userId && user.avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.webp`}
              className="avatar"
              alt="Avatar"
              onError={(e) => {
                // Fail-safe if avatar URL construction is slightly off
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <a href="/api/auth/logout" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
            Logout
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="flex-between" style={{ marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>Dashboard</h1>
            <p style={{ color: 'var(--text-muted)' }}>Verwalte deine Minecraft-Server und ZIP/JAR-Dateien.</p>
          </div>
          <button className="btn btn-primary" onClick={() => { fetchUploads(); setModalOpen(true); }}>
            <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Server erstellen
          </button>
        </div>

        {/* Dashboard Tabs */}
        <div className="tabs" style={{ marginBottom: '32px' }}>
          <div
            className={`tab ${activeDashboardTab === 'servers' ? 'active' : ''}`}
            onClick={() => setActiveDashboardTab('servers')}
          >
            Server
          </div>
          <div
            className={`tab ${activeDashboardTab === 'uploads' ? 'active' : ''}`}
            onClick={() => { fetchUploads(); setActiveDashboardTab('uploads'); }}
          >
            Dateiverwaltung (Uploads)
          </div>
        </div>

        {error && (
          <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)' }}>
            Error: {error}
          </div>
        )}

        {activeDashboardTab === 'servers' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
              <div
                style={{
                  border: '3px solid rgba(255, 255, 255, 0.1)',
                  borderLeftColor: 'var(--primary)',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px auto',
                }}
              />
              Lade Server...
            </div>
          ) : servers.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <svg style={{ width: '48px', height: '48px', margin: '0 auto 16px auto', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3>Keine Server konfiguriert</h3>
              <p style={{ marginTop: '8px', fontSize: '0.9rem' }}>Erstelle deinen ersten Minecraft-Server mit dem Button oben rechts.</p>
            </div>
          ) : (
            <div className="server-grid">
            {servers.map((server) => (
              <Link href={`/servers/${server.id}`} key={server.id} className="card server-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="server-card-header flex-between">
                  <h3 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>{server.name}</h3>
                  <span className={`badge ${server.isRunning ? 'badge-success' : 'badge-danger'}`}>
                    {server.isRunning ? 'Online' : 'Offline'}
                  </span>
                </div>
                
                <div className="server-card-meta">
                  <span>Typ:</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>
                    {server.type === 'PAPER' ? 'Paper (Vanilla/Plugins)' : 'CurseForge Modpack'}
                  </span>
                  
                  <span>Port:</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{server.port}</span>
                  
                  <span>RAM:</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{server.memoryMin} - {server.memoryMax}</span>
                </div>

                <div className="server-card-actions">
                  <button
                    onClick={(e) => handleServerAction(server.id, server.isRunning, e)}
                    className={`btn ${server.isRunning ? 'btn-danger' : 'btn-success'}`}
                    style={{ flex: 1, padding: '8px 16px', fontSize: '0.85rem' }}
                  >
                    {server.isRunning ? (
                      <>
                        <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                        </svg>
                        Stoppen
                      </>
                    ) : (
                      <>
                        <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                        Starten
                      </>
                    )}
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '8px 12px' }}>
                    <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </button>
                </div>
              </Link>
            ))}
          </div>
        ))}

        {activeDashboardTab === 'uploads' && (
          <div>
            <div className="grid-2">
              {/* CurseForge ZIPs Panel */}
              <div className="card">
                <h3 style={{ color: '#fff', marginBottom: '16px' }}>CurseForge Server Packs (.zip)</h3>
                
                {zipUploadError && (
                  <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px', marginBottom: '16px' }}>
                    {zipUploadError}
                  </div>
                )}
                {zipUploadSuccess && (
                  <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', padding: '12px 16px', marginBottom: '16px' }}>
                    {zipUploadSuccess}
                  </div>
                )}

                <form onSubmit={handleZipUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                  <div className="dropzone" onClick={() => document.getElementById('zip-upload-input')?.click()}>
                    <svg style={{ width: '40px', height: '40px', margin: '0 auto', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <div className="dropzone-text">
                      {zipUploadFile ? zipUploadFile.name : 'Klicke hier, um ein CurseForge ZIP auszuwählen'}
                    </div>
                  </div>
                  
                  <input
                    type="file"
                    id="zip-upload-input"
                    onChange={(e) => setZipUploadFile(e.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                    accept=".zip"
                  />

                  <button type="submit" className="btn btn-primary" disabled={!zipUploadFile || zipUploadLoading}>
                    {zipUploadLoading ? 'Lade ZIP hoch...' : 'ZIP hochladen'}
                  </button>
                </form>

                <h4 style={{ color: '#fff', marginBottom: '12px', fontSize: '1rem' }}>Hochgeladene ZIPs ({zips.length})</h4>
                {zips.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Keine Modpacks hochgeladen.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                    {zips.map((zip) => (
                      <div key={zip.name} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, backgroundColor: 'var(--input-bg)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={zip.name}>
                            {zip.name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {(zip.size / (1024 * 1024)).toFixed(2)} MB | {new Date(zip.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteFile(zip.name, 'zip')}
                          style={{ padding: '4px 8px', fontSize: '0.8rem', flexShrink: 0 }}
                        >
                          Löschen
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Minecraft JARs Panel */}
              <div className="card">
                <h3 style={{ color: '#fff', marginBottom: '16px' }}>Minecraft Server JARs (.jar)</h3>
                
                {jarUploadError && (
                  <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px', marginBottom: '16px' }}>
                    {jarUploadError}
                  </div>
                )}
                {jarUploadSuccess && (
                  <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', padding: '12px 16px', marginBottom: '16px' }}>
                    {jarUploadSuccess}
                  </div>
                )}

                <form onSubmit={handleJarUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                  <div className="dropzone" onClick={() => document.getElementById('jar-upload-input')?.click()}>
                    <svg style={{ width: '40px', height: '40px', margin: '0 auto', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <div className="dropzone-text">
                      {jarUploadFile ? jarUploadFile.name : 'Klicke hier, um eine Server-JAR auszuwählen'}
                    </div>
                  </div>
                  
                  <input
                    type="file"
                    id="jar-upload-input"
                    onChange={(e) => setJarUploadFile(e.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                    accept=".jar"
                  />

                  <button type="submit" className="btn btn-primary" disabled={!jarUploadFile || jarUploadLoading}>
                    {jarUploadLoading ? 'Lade JAR hoch...' : 'JAR hochladen'}
                  </button>
                </form>

                <h4 style={{ color: '#fff', marginBottom: '12px', fontSize: '1rem' }}>Hochgeladene JARs ({jars.length})</h4>
                {jars.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Keine Server-JARs hochgeladen.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                    {jars.map((jar) => (
                      <div key={jar.name} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, backgroundColor: 'var(--input-bg)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={jar.name}>
                            {jar.name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {(jar.size / (1024 * 1024)).toFixed(2)} MB | {new Date(jar.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteFile(jar.name, 'jar')}
                          style={{ padding: '4px 8px', fontSize: '0.8rem', flexShrink: 0 }}
                        >
                          Löschen
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Create Server Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 800 }}>Neuen Server anlegen</h2>
              <button className="modal-close" onClick={() => setModalOpen(false)}>×</button>
            </div>

            {createError && (
              <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px', marginBottom: '16px' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateServer}>
              <div className="form-group">
                <label className="form-label">Server Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Survival-Server"
                  required
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Server Typ</label>
                  <select
                    className="form-select"
                    value={type}
                    onChange={(e) => setType(e.target.value as 'PAPER' | 'CURSEFORGE')}
                  >
                    <option value="PAPER">Paper Minecraft (Standard/Plugins)</option>
                    <option value="CURSEFORGE">CurseForge Modpack Server</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Server Port</label>
                  <input
                    type="number"
                    className="form-input"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="25565"
                    required
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Minimaler RAM (Java -Xms)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={memoryMin}
                    onChange={(e) => setMemoryMin(e.target.value)}
                    placeholder="z.B. 2048M oder 2G"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Maximaler RAM (Java -Xmx)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={memoryMax}
                    onChange={(e) => setMemoryMax(e.target.value)}
                    placeholder="z.B. 6144M oder 6G"
                    required
                  />
                </div>
              </div>

              {type === 'PAPER' && (
                <div className="form-group">
                  <label className="form-label">JAR-Datei auswählen</label>
                  <select
                    className="form-select"
                    value={jarFile}
                    onChange={(e) => setJarFile(e.target.value)}
                    required
                  >
                    <option value="server.jar">server.jar (Standard)</option>
                    {jars.map((jar) => (
                      <option key={jar.name} value={jar.name}>
                        {jar.name} ({(jar.size / (1024 * 1024)).toFixed(2)} MB)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {type === 'CURSEFORGE' && (
                <div className="form-group">
                  <label className="form-label">CurseForge Server Pack (.zip) auswählen</label>
                  <select
                    className="form-select"
                    value={curseForgeZip}
                    onChange={(e) => setCurseForgeZip(e.target.value)}
                    required
                  >
                    <option value="">-- Bitte ZIP-Datei auswählen --</option>
                    {zips.map((zip) => (
                      <option key={zip.name} value={zip.name}>
                        {zip.name} ({(zip.size / (1024 * 1024)).toFixed(2)} MB)
                      </option>
                    ))}
                  </select>
                  {zips.length === 0 && (
                    <p style={{ color: 'var(--warning)', fontSize: '0.8rem', marginTop: '6px' }}>
                      Bitte lade zuerst ein CurseForge Server Pack (.zip) im Upload-Bereich hoch.
                    </p>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Owner Ingame Name (automatischer OP)</label>
                <input
                  type="text"
                  className="form-input"
                  value={opPlayer}
                  onChange={(e) => setOpPlayer(e.target.value)}
                  placeholder="z.B. Notch (optional)"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Abbrechen
                </button>
                <button type="submit" className="btn btn-primary" disabled={createLoading}>
                  {createLoading ? 'Erstelle...' : 'Server erstellen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
