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
  curseForgeZip?: string | null;
  isRunning: boolean;
  createdAt: string;
}

interface UploadedFileItem {
  name: string;
  size: number;
  createdAt: string;
  description?: string;
}

const uploadInChunks = async (
  file: File,
  url: string,
  onProgress: (progress: number) => void,
  uploadType?: string,
  description?: string,
  chunkSize: number = 2 * 1024 * 1024 // 2MB chunks
) => {
  const totalChunks = Math.ceil(file.size / chunkSize);
  for (let index = 0; index < totalChunks; index++) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    
    const formData = new FormData();
    formData.append('file', chunk, file.name);
    formData.append('chunkIndex', index.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('originalName', file.name);
    if (uploadType) {
      formData.append('uploadType', uploadType);
    }
    if (description && index + 1 === totalChunks) {
      formData.append('description', description);
    }

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Chunk ${index + 1}/${totalChunks} upload failed.`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || `Chunk ${index + 1}/${totalChunks} upload failed.`);
    }

    onProgress(Math.round(((index + 1) / totalChunks) * 100));
  }
};

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
  const [jarFile, setJarFile] = useState('');
  const [curseForgeZip, setCurseForgeZip] = useState('');

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Uploads management state
  const [zips, setZips] = useState<UploadedFileItem[]>([]);
  const [jars, setJars] = useState<UploadedFileItem[]>([]);
  const [plugins, setPlugins] = useState<UploadedFileItem[]>([]);
  const [activeDashboardTab, setActiveDashboardTab] = useState<'servers' | 'uploads'>('servers');
  const [fileSubTab, setFileSubTab] = useState<'curseforge' | 'minecraft'>('curseforge');

  // CurseForge upload state
  const [zipUploadFile, setZipUploadFile] = useState<File | null>(null);
  const [zipUploadLoading, setZipUploadLoading] = useState(false);
  const [zipUploadError, setZipUploadError] = useState<string | null>(null);
  const [zipUploadSuccess, setZipUploadSuccess] = useState<string | null>(null);
  const [zipUploadProgress, setZipUploadProgress] = useState<number | null>(null);

  // Minecraft JAR upload state
  const [jarUploadFile, setJarUploadFile] = useState<File | null>(null);
  const [jarUploadLoading, setJarUploadLoading] = useState(false);
  const [jarUploadError, setJarUploadError] = useState<string | null>(null);
  const [jarUploadSuccess, setJarUploadSuccess] = useState<string | null>(null);
  const [jarUploadProgress, setJarUploadProgress] = useState<number | null>(null);

  // Minecraft Plugin upload state (drag-and-drop auto-upload)
  const [pluginUploadLoading, setPluginUploadLoading] = useState(false);
  const [pluginUploadError, setPluginUploadError] = useState<string | null>(null);
  const [pluginUploadSuccess, setPluginUploadSuccess] = useState<string | null>(null);
  const [pluginUploadProgress, setPluginUploadProgress] = useState<number | null>(null);
  const [isPluginDragging, setIsPluginDragging] = useState(false);

  // Inline editing of descriptions (added/edited afterwards)
  const [editingFileKey, setEditingFileKey] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState('');

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
        setZips(data.curseforge || data.zips || []);
        const loadedJars: UploadedFileItem[] = data.minecraft?.jars || data.jars || [];
        setJars(loadedJars);
        setPlugins(data.minecraft?.plugins || data.plugins || []);
        
        // Auto-select first jar if none selected
        if (loadedJars.length > 0 && !jarFile) {
          setJarFile(loadedJars[0].name);
        }
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
    
    // Poll servers status every 5 seconds
    const interval = setInterval(fetchServers, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle server start/stop actions from dashboard
  const handleServerAction = async (serverId: string, isRunning: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    const action = isRunning ? 'STOP' : 'START';
    
    setServers((prev) =>
      prev.map((s) =>
        s.id === serverId
          ? { ...s, isRunning: !isRunning }
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
        alert(`Aktion fehlgeschlagen: ${data.error || 'Unbekannter Fehler'}`);
        fetchServers();
      }
    } catch (err) {
      console.error(err);
      fetchServers();
    }
  };

  // Handle server creation
  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (type === 'PAPER' && !jarFile) {
      setCreateError('Bitte wähle eine hochgeladene Server-JAR aus.');
      return;
    }
    if (type === 'CURSEFORGE' && !curseForgeZip) {
      setCreateError('Bitte wähle ein hochgeladenes CurseForge Modpack (.zip) aus.');
      return;
    }

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
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setModalOpen(false);
        setName('');
        setPort('25565');
        setMemoryMin('2048M');
        setMemoryMax('6144M');
        setCurseForgeZip('');
        fetchServers();
      } else {
        setCreateError(data.error || 'Fehler beim Erstellen des Servers.');
      }
    } catch (err) {
      console.error(err);
      setCreateError('Netzwerkfehler aufgetreten.');
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
    setZipUploadProgress(0);
    try {
      await uploadInChunks(zipUploadFile, '/api/uploads', setZipUploadProgress, 'curseforge');
      setZipUploadSuccess(`Modpack "${zipUploadFile.name}" erfolgreich in curseforge/ hochgeladen.`);
      setZipUploadFile(null);
      fetchUploads();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Netzwerkfehler beim Hochladen.';
      setZipUploadError(message);
    } finally {
      setZipUploadLoading(false);
      setZipUploadProgress(null);
    }
  };

  const handleJarUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jarUploadFile) return;
    setJarUploadLoading(true);
    setJarUploadError(null);
    setJarUploadSuccess(null);
    setJarUploadProgress(0);
    try {
      await uploadInChunks(jarUploadFile, '/api/uploads', setJarUploadProgress, 'jar');
      setJarUploadSuccess(`JAR-Datei "${jarUploadFile.name}" erfolgreich in minecraft/jars/ hochgeladen.`);
      setJarUploadFile(null);
      fetchUploads();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Netzwerkfehler beim Hochladen.';
      setJarUploadError(message);
    } finally {
      setJarUploadLoading(false);
      setJarUploadProgress(null);
    }
  };

  const handlePluginAutoUpload = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    for (const file of fileList) {
      if (!file.name.toLowerCase().endsWith('.jar')) {
        setPluginUploadError(`"${file.name}" ist keine gültige .jar-Datei.`);
        return;
      }
    }

    setPluginUploadLoading(true);
    setPluginUploadError(null);
    setPluginUploadSuccess(null);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setPluginUploadProgress(0);
        await uploadInChunks(file, '/api/uploads', setPluginUploadProgress, 'plugin');
      }
      setPluginUploadSuccess(
        fileList.length === 1
          ? `Plugin "${fileList[0].name}" erfolgreich hochgeladen!`
          : `${fileList.length} Plugins erfolgreich hochgeladen!`
      );
      fetchUploads();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Netzwerkfehler beim Hochladen.';
      setPluginUploadError(message);
    } finally {
      setPluginUploadLoading(false);
      setPluginUploadProgress(null);
    }
  };

  const handleDeleteFile = async (name: string, type: 'curseforge' | 'jar' | 'plugin') => {
    if (!confirm(`Möchtest du die Datei "${name}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/uploads?name=${encodeURIComponent(name)}&type=${type}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchUploads();
      } else {
        alert(data.error || 'Löschen fehlgeschlagen.');
      }
    } catch (err) {
      console.error(err);
      alert('Netzwerkfehler beim Löschen.');
    }
  };

  const handleSaveDescription = async (name: string, type: 'curseforge' | 'jar' | 'plugin') => {
    try {
      const res = await fetch('/api/uploads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, description: editingDescription }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingFileKey(null);
        fetchUploads();
      } else {
        alert(data.error || 'Speichern der Beschreibung fehlgeschlagen.');
      }
    } catch (err) {
      console.error(err);
      alert('Netzwerkfehler beim Speichern.');
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
          <div
            style={{
              background: 'var(--primary)',
              color: 'white',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
            }}
          >
            {user.username.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontWeight: 600 }}>{user.username}</span>
          <form action="/api/auth/logout" method="POST" style={{ display: 'inline' }}>
            <button type="submit" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
              Abmelden
            </button>
          </form>
        </div>
      </header>

      {/* Main Container */}
      <main className="container">
        {/* Top actions & Tabs */}
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Dashboard</h1>
            <p style={{ color: 'var(--text-muted)' }}>
              Verwalte deine Minecraft Paper- und CurseForge-Server sowie Uploads.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => { fetchUploads(); setModalOpen(true); }}>
            <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Neuer Server
          </button>
        </div>

        {/* Global Navigation Tabs */}
        <div className="tabs" style={{ marginBottom: '24px' }}>
          <div
            className={`tab ${activeDashboardTab === 'servers' ? 'active' : ''}`}
            onClick={() => setActiveDashboardTab('servers')}
          >
            Meine Server ({servers.length})
          </div>
          <div
            className={`tab ${activeDashboardTab === 'uploads' ? 'active' : ''}`}
            onClick={() => {
              fetchUploads();
              setActiveDashboardTab('uploads');
            }}
          >
            Dateiverwaltung (Uploads)
          </div>
        </div>

        {/* Servers Tab */}
        {activeDashboardTab === 'servers' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
              Lade Server...
            </div>
          ) : error ? (
            <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)' }}>
              {error}
            </div>
          ) : servers.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#fff' }}>Keine Server vorhanden</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                Erstelle deinen ersten Paper- oder CurseForge-Server, um loszulegen.
              </p>
              <button className="btn btn-primary" onClick={() => { fetchUploads(); setModalOpen(true); }}>
                Server erstellen
              </button>
            </div>
          ) : (
            <div className="server-grid">
              {servers.map((server) => (
                <div key={server.id} className="card-server">
                  <Link href={`/servers/${server.id}`} className="server-card-body">
                    <div className="server-header">
                      <div className="server-name-group">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <h3 title={server.name}>{server.name}</h3>
                          <span className={`badge ${server.type === 'PAPER' ? 'badge-paper' : 'badge-curseforge'}`}>
                            {server.type === 'PAPER' ? 'Paper' : 'CurseForge'}
                          </span>
                        </div>
                        <div className="server-badges">
                          <span className={`status-dot ${server.isRunning ? 'online' : 'offline'}`} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: server.isRunning ? 'var(--success)' : 'var(--danger)' }}>
                            {server.isRunning ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="server-details">
                      <div className="server-detail-item">
                        <span className="server-detail-label">Port:</span>
                        <span className="server-detail-val">{server.port}</span>
                      </div>
                      <div className="server-detail-item">
                        <span className="server-detail-label">RAM:</span>
                        <span className="server-detail-val">{server.memoryMin} - {server.memoryMax}</span>
                      </div>
                      <div className="server-detail-item">
                        <span className="server-detail-label">{server.type === 'PAPER' ? 'JAR:' : 'Modpack:'}</span>
                        <span
                          className="server-detail-val"
                          style={{
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            maxWidth: '160px',
                            textAlign: 'right',
                          }}
                          title={server.type === 'PAPER' ? (server.jarFile || 'Nicht konfiguriert') : (server.curseForgeZip || 'Kein ZIP')}
                        >
                          {server.type === 'PAPER' ? (server.jarFile || 'Nicht konfiguriert') : (server.curseForgeZip || 'Kein ZIP')}
                        </span>
                      </div>
                    </div>
                  </Link>

                  <div className="server-actions">
                    <button
                      type="button"
                      className={`btn ${server.isRunning ? 'btn-danger' : 'btn-success'}`}
                      style={{ flex: 1, padding: '8px 12px' }}
                      onClick={(e) => handleServerAction(server.id, server.isRunning, e)}
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
                    <Link
                      href={`/servers/${server.id}`}
                      className="btn btn-secondary"
                      style={{ padding: '8px 12px' }}
                      title="Server verwalten & Konsole"
                    >
                      <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Dateiverwaltung (Uploads) Tab */}
        {activeDashboardTab === 'uploads' && (
          <div>
            {/* Sub navigation between CurseForge and Minecraft */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <button
                type="button"
                className={`btn ${fileSubTab === 'curseforge' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '20px', padding: '8px 20px', fontSize: '0.95rem' }}
                onClick={() => setFileSubTab('curseforge')}
              >
                CurseForge Server Packs ({zips.length})
              </button>
              <button
                type="button"
                className={`btn ${fileSubTab === 'minecraft' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '20px', padding: '8px 20px', fontSize: '0.95rem' }}
                onClick={() => setFileSubTab('minecraft')}
              >
                Minecraft Dateiverwaltung ({jars.length} JARs / {plugins.length} Plugins)
              </button>
            </div>

            {/* CURSEFORGE TAB */}
            {fileSubTab === 'curseforge' && (
              <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }}>
                    CurseForge Server Packs (.zip)
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Gespeichert in: <code style={{ color: 'var(--primary)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>uploads/curseforge/</code>
                  </p>
                </div>

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

                {/* Regular File Upload Form (No drag-and-drop zone) */}
                <form onSubmit={handleZipUpload} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '32px', background: 'var(--input-bg)', padding: '20px', borderRadius: 'var(--border-radius)' }}>
                  <div>
                    <label className="form-label" style={{ marginBottom: '8px' }}>ZIP-Datei auswählen</label>
                    <input
                      type="file"
                      id="cf-zip-input"
                      className="form-input"
                      accept=".zip"
                      onChange={(e) => setZipUploadFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  {zipUploadProgress !== null && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span>Lade hoch...</span>
                        <span>{zipUploadProgress}%</span>
                      </div>
                      <div style={{ width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ width: `${zipUploadProgress}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.1s ease-in-out' }} />
                      </div>
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary" disabled={!zipUploadFile || zipUploadLoading} style={{ alignSelf: 'flex-start' }}>
                    {zipUploadLoading ? `Lade ZIP hoch... ${zipUploadProgress !== null ? `${zipUploadProgress}%` : ''}` : 'Server Pack hochladen'}
                  </button>
                </form>

                <h4 style={{ color: '#fff', marginBottom: '16px', fontSize: '1.1rem', fontWeight: 600 }}>
                  Hochgeladene Server Packs ({zips.length})
                </h4>

                {zips.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius)' }}>
                    Noch keine CurseForge Server Packs hochgeladen.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {zips.map((item) => (
                      <div
                        key={item.name}
                        className="card"
                        style={{
                          padding: '16px 20px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 0,
                          backgroundColor: 'var(--input-bg)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, marginRight: '16px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>{item.name}</span>
                          
                          {/* Description & Inline edit */}
                          {editingFileKey === `curseforge:${item.name}` ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                              <input
                                type="text"
                                className="form-input"
                                style={{ padding: '4px 10px', fontSize: '0.85rem', flex: 1 }}
                                value={editingDescription}
                                onChange={(e) => setEditingDescription(e.target.value)}
                                placeholder="Beschreibung eingeben..."
                              />
                              <button
                                type="button"
                                className="btn btn-success"
                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                onClick={() => handleSaveDescription(item.name, 'curseforge')}
                              >
                                Speichern
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                onClick={() => setEditingFileKey(null)}
                              >
                                Abbrechen
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.85rem', color: item.description ? '#ddd' : 'var(--text-muted)', fontStyle: item.description ? 'normal' : 'italic' }}>
                                {item.description || 'Keine Beschreibung vorhanden'}
                              </span>
                              <button
                                type="button"
                                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 4px' }}
                                onClick={() => {
                                  setEditingFileKey(`curseforge:${item.name}`);
                                  setEditingDescription(item.description || '');
                                }}
                              >
                                ✏️ Bearbeiten
                              </button>
                            </div>
                          )}

                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {(item.size / (1024 * 1024)).toFixed(2)} MB • Hochgeladen: {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteFile(item.name, 'curseforge')}
                          style={{ padding: '6px 12px', fontSize: '0.85rem', flexShrink: 0 }}
                        >
                          Löschen
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MINECRAFT TAB (JARS & PLUGINS) */}
            {fileSubTab === 'minecraft' && (
              <div className="grid-2">
                {/* 1. Server JARs (No drag and drop) */}
                <div className="card">
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <h3 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>
                      Minecraft Server JARs (.jar)
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Gespeichert in: <code style={{ color: 'var(--primary)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>uploads/minecraft/jars/</code>
                    </p>
                  </div>

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

                  <form onSubmit={handleJarUpload} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', background: 'var(--input-bg)', padding: '16px', borderRadius: 'var(--border-radius)' }}>
                    <div>
                      <label className="form-label" style={{ marginBottom: '6px' }}>JAR-Datei auswählen</label>
                      <input
                        type="file"
                        className="form-input"
                        accept=".jar"
                        onChange={(e) => setJarUploadFile(e.target.files?.[0] || null)}
                      />
                    </div>

                    {jarUploadProgress !== null && (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <span>Lade hoch...</span>
                          <span>{jarUploadProgress}%</span>
                        </div>
                        <div style={{ width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                          <div style={{ width: `${jarUploadProgress}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.1s ease-in-out' }} />
                        </div>
                      </div>
                    )}

                    <button type="submit" className="btn btn-primary" disabled={!jarUploadFile || jarUploadLoading} style={{ alignSelf: 'flex-start' }}>
                      {jarUploadLoading ? `Lade hoch... ${jarUploadProgress !== null ? `${jarUploadProgress}%` : ''}` : 'JAR hochladen'}
                    </button>
                  </form>

                  <h4 style={{ color: '#fff', marginBottom: '12px', fontSize: '1rem', fontWeight: 600 }}>
                    Hochgeladene Server-JARs ({jars.length})
                  </h4>

                  {jars.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius)', fontSize: '0.9rem' }}>
                      Keine Server-JARs hochgeladen.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '450px', overflowY: 'auto' }}>
                      {jars.map((item) => (
                        <div
                          key={item.name}
                          className="card"
                          style={{
                            padding: '14px 16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 0,
                            backgroundColor: 'var(--input-bg)',
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, marginRight: '12px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{item.name}</span>
                            
                            {editingFileKey === `jar:${item.name}` ? (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  style={{ padding: '2px 8px', fontSize: '0.8rem', flex: 1 }}
                                  value={editingDescription}
                                  onChange={(e) => setEditingDescription(e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="btn btn-success"
                                  style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                  onClick={() => handleSaveDescription(item.name, 'jar')}
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                  onClick={() => setEditingFileKey(null)}
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.8rem', color: item.description ? '#ccc' : 'var(--text-muted)' }}>
                                  {item.description || 'Keine Beschreibung'}
                                </span>
                                <button
                                  type="button"
                                  style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    setEditingFileKey(`jar:${item.name}`);
                                    setEditingDescription(item.description || '');
                                  }}
                                >
                                  ✏️
                                </button>
                              </div>
                            )}

                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {(item.size / (1024 * 1024)).toFixed(2)} MB • {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeleteFile(item.name, 'jar')}
                            style={{ padding: '4px 8px', fontSize: '0.8rem', flexShrink: 0 }}
                          >
                            Löschen
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Minecraft Plugins (HAS THE DRAG AND DROP ZONE) */}
                <div className="card">
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>
                        Minecraft Plugins (.jar)
                      </h3>
                      <span className="badge badge-paper" style={{ fontSize: '0.75rem' }}>Drag & Drop aktiv</span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Gespeichert in: <code style={{ color: 'var(--primary)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>uploads/minecraft/plugins/</code>
                    </p>
                  </div>

                  {pluginUploadError && (
                    <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px', marginBottom: '16px' }}>
                      {pluginUploadError}
                    </div>
                  )}
                  {pluginUploadSuccess && (
                    <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', padding: '12px 16px', marginBottom: '16px' }}>
                      {pluginUploadSuccess}
                    </div>
                  )}

                  {/* Drag & Drop zone for plugins: instant auto-upload without submit button */}
                  <div style={{ marginBottom: '24px' }}>
                    <div 
                      className={`dropzone ${isPluginDragging ? 'dragging' : ''} ${pluginUploadLoading ? 'dropzone-uploading' : ''}`}
                      onClick={() => {
                        if (!pluginUploadLoading) {
                          document.getElementById('plugin-upload-input')?.click();
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!pluginUploadLoading) setIsPluginDragging(true);
                      }}
                      onDragLeave={() => setIsPluginDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsPluginDragging(false);
                        if (!pluginUploadLoading && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          handlePluginAutoUpload(e.dataTransfer.files);
                        }
                      }}
                    >
                      <input
                        type="file"
                        id="plugin-upload-input"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handlePluginAutoUpload(e.target.files);
                            e.target.value = '';
                          }
                        }}
                        style={{ display: 'none' }}
                        accept=".jar"
                        multiple
                      />

                      {pluginUploadLoading ? (
                        <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 600, fontSize: '0.95rem' }}>
                            <svg style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>Lade Plugin hoch... {pluginUploadProgress !== null ? `${pluginUploadProgress}%` : ''}</span>
                          </div>
                          <div style={{ width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                            <div style={{ width: `${pluginUploadProgress || 0}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.15s ease-in-out' }} />
                          </div>
                        </div>
                      ) : (
                        <>
                          <svg style={{ width: '40px', height: '40px', margin: '0 auto 8px auto', color: 'var(--primary)', opacity: 0.85 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <div style={{ fontWeight: 600, color: '#fff', fontSize: '1rem', marginBottom: '4px' }}>
                            Plugin (.jar) hierher ziehen oder klicken
                          </div>
                          <div className="dropzone-text" style={{ margin: 0, fontSize: '0.85rem' }}>
                            Wird sofort automatisch hochgeladen (Mehrfachauswahl möglich)
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <h4 style={{ color: '#fff', marginBottom: '12px', fontSize: '1rem', fontWeight: 600 }}>
                    Verfügbare Plugins ({plugins.length})
                  </h4>

                  {plugins.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius)', fontSize: '0.9rem' }}>
                      Noch keine Plugins hochgeladen.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '450px', overflowY: 'auto' }}>
                      {plugins.map((item) => (
                        <div
                          key={item.name}
                          className="card"
                          style={{
                            padding: '14px 16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 0,
                            backgroundColor: 'var(--input-bg)',
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, marginRight: '12px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{item.name}</span>
                            
                            {editingFileKey === `plugin:${item.name}` ? (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  style={{ padding: '2px 8px', fontSize: '0.8rem', flex: 1 }}
                                  value={editingDescription}
                                  onChange={(e) => setEditingDescription(e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="btn btn-success"
                                  style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                  onClick={() => handleSaveDescription(item.name, 'plugin')}
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                  onClick={() => setEditingFileKey(null)}
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.8rem', color: item.description ? '#ccc' : 'var(--text-muted)' }}>
                                  {item.description || 'Keine Beschreibung'}
                                </span>
                                <button
                                  type="button"
                                  style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    setEditingFileKey(`plugin:${item.name}`);
                                    setEditingDescription(item.description || '');
                                  }}
                                >
                                  ✏️
                                </button>
                              </div>
                            )}

                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {(item.size / (1024 * 1024)).toFixed(2)} MB • {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeleteFile(item.name, 'plugin')}
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
            )}
          </div>
        )}
      </main>

      {/* Create Server Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
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
                  <label className="form-label">Hochgeladene JAR-Datei auswählen</label>
                  {jars.length === 0 ? (
                    <div style={{ padding: '12px 14px', borderRadius: 'var(--border-radius)', backgroundColor: 'rgba(235, 94, 40, 0.1)', border: '1px solid var(--warning)', color: 'var(--warning)', fontSize: '0.85rem' }}>
                      ⚠️ Es sind keine Server-JARs hochgeladen. Bitte lade zuerst im Tab &quot;Dateiverwaltung&quot; eine Paper-JAR hoch.
                    </div>
                  ) : (
                    <select
                      className="form-select"
                      value={jarFile}
                      onChange={(e) => setJarFile(e.target.value)}
                      required
                    >
                      <option value="">-- Bitte JAR-Datei auswählen --</option>
                      {jars.map((jar) => (
                        <option key={jar.name} value={jar.name}>
                          {jar.name} {jar.description ? `(${jar.description})` : ''} - ({(jar.size / (1024 * 1024)).toFixed(2)} MB)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {type === 'CURSEFORGE' && (
                <div className="form-group">
                  <label className="form-label">CurseForge Server Pack (.zip) auswählen</label>
                  {zips.length === 0 ? (
                    <div style={{ padding: '12px 14px', borderRadius: 'var(--border-radius)', backgroundColor: 'rgba(235, 94, 40, 0.1)', border: '1px solid var(--warning)', color: 'var(--warning)', fontSize: '0.85rem' }}>
                      ⚠️ Es sind keine CurseForge Packs hochgeladen. Bitte lade zuerst im Tab &quot;Dateiverwaltung&quot; ein Modpack hoch.
                    </div>
                  ) : (
                    <select
                      className="form-select"
                      value={curseForgeZip}
                      onChange={(e) => setCurseForgeZip(e.target.value)}
                      required
                    >
                      <option value="">-- Bitte ZIP-Datei auswählen --</option>
                      {zips.map((zip) => (
                        <option key={zip.name} value={zip.name}>
                          {zip.name} {zip.description ? `(${zip.description})` : ''} - ({(zip.size / (1024 * 1024)).toFixed(2)} MB)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createLoading || (type === 'PAPER' && jars.length === 0) || (type === 'CURSEFORGE' && zips.length === 0)}
                >
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
