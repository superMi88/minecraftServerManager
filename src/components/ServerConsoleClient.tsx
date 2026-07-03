'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  userId: string | null;
  username: string;
  avatar: string | null;
  admin: boolean;
}

interface ServerConsoleClientProps {
  serverId: string;
  initialServerName: string;
  serverType: string;
  user: User;
}

const uploadInChunks = async (
  file: File,
  url: string,
  onProgress: (progress: number) => void,
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

export default function ServerConsoleClient({
  serverId,
  initialServerName,
  serverType,
  user,
}: ServerConsoleClientProps) {
  const router = useRouter();
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'console' | 'properties' | 'files' | 'backups' | 'settings'>('console');
  
  // Console tab states
  const [logs, setLogs] = useState('Lade Logs...');
  const [isRunning, setIsRunning] = useState(false);
  const [command, setCommand] = useState('');
  const consoleRef = useRef<HTMLDivElement>(null);
  
  // Properties tab states
  const [properties, setProperties] = useState('');
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [propertiesSuccess, setPropertiesSuccess] = useState<string | null>(null);
  
  // Files tab states
  const [plugins, setPlugins] = useState<string[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  // Settings tab states
  const [name, setName] = useState(initialServerName);
  const [port, setPort] = useState('25565');
  const [memoryMin, setMemoryMin] = useState('2048M');
  const [memoryMax, setMemoryMax] = useState('6144M');
  const [jarFile, setJarFile] = useState('server.jar');
  const [curseForgeZip, setCurseForgeZip] = useState('');
  const [startScript, setStartScript] = useState('run.sh');
  const [availableShFiles, setAvailableShFiles] = useState<string[]>([]);
  const [selectedShFile, setSelectedShFile] = useState('');
  const [scriptExecuting, setScriptExecuting] = useState(false);
  const [scriptLogs, setScriptLogs] = useState('');
  const [scriptInput, setScriptInput] = useState('');
  const [scriptOutput, setScriptOutput] = useState<{ code: number | null; stdout: string; stderr: string } | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [opPlayer, setOpPlayer] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  
  const [zips, setZips] = useState<{ name: string; size: number; createdAt: string }[]>([]);
  const [jars, setJars] = useState<{ name: string; size: number; createdAt: string }[]>([]);

  // Backup states
  const [backups, setBackups] = useState<{ name: string; size: number; createdAt: string }[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupCreateLoading, setBackupCreateLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  
  // Danger zone modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // Fetch Server Metadata on load
  const fetchMetadata = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setName(data.server.name);
        setPort(data.server.port.toString());
        setMemoryMin(data.server.memoryMin);
        setMemoryMax(data.server.memoryMax);
        setJarFile(data.server.jarFile || 'server.jar');
        setCurseForgeZip(data.server.curseForgeZip || '');
        setStartScript(data.server.startScript || 'run.sh');
        setAvailableShFiles(data.server.availableShFiles || []);
        if (data.server.availableShFiles && data.server.availableShFiles.length > 0 && !selectedShFile) {
          setSelectedShFile(data.server.availableShFiles[0]);
        }
        setOpPlayer(data.server.opPlayer || '');
        setIsRunning(data.server.isRunning);
      }
    } catch (err) {
      console.error('Failed to load server metadata', err);
    }
  }, [serverId, selectedShFile]);

  const fetchUploads = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchMetadata();
      fetchUploads();
    });
  }, [fetchMetadata, fetchUploads]);

  const fetchBackups = useCallback(async () => {
    setBackupsLoading(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/backups`);
      const data = await res.json();
      if (res.ok && data.success) {
        setBackups(data.backups);
      } else {
        setBackupError(data.error || 'Failed to fetch backups.');
      }
    } catch {
      setBackupError('Failed to load backups due to network error.');
    } finally {
      setBackupsLoading(false);
    }
  }, [serverId]);

  const handleCreateBackup = async () => {
    if (isRunning) {
      alert('Der Server muss ausgeschaltet sein, um ein Backup zu erstellen.');
      return;
    }
    setBackupCreateLoading(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/backups`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackupSuccess(data.message);
        fetchBackups();
      } else {
        setBackupError(data.error || 'Failed to create backup.');
      }
    } catch {
      setBackupError('Network error creating backup.');
    } finally {
      setBackupCreateLoading(false);
    }
  };

  const handleDeleteBackup = async (backupName: string) => {
    if (!confirm(`Möchtest du das Backup "${backupName}" wirklich unwiderruflich löschen?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/servers/${serverId}/backups?name=${encodeURIComponent(backupName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchBackups();
      } else {
        alert(data.error || 'Failed to delete backup.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error deleting backup.');
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      if (activeTab === 'settings') {
        fetchUploads();
      } else if (activeTab === 'backups') {
        fetchBackups();
      }
    });
  }, [activeTab, fetchUploads, fetchBackups]);

  // Poll Logs / Status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/logs?limit=80`);
        const data = await res.json();
        if (res.ok && data.success) {
          setLogs(data.logs);
          setIsRunning(data.isRunning);
        }
      } catch (err) {
        console.error('Logs polling error:', err);
      }
    };

    if (activeTab === 'console') {
      fetchLogs();
      interval = setInterval(fetchLogs, 2000); // Poll every 2s
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [serverId, activeTab]);

  // Fetch Properties when switching to Properties tab
  useEffect(() => {
    if (activeTab === 'properties') {
      Promise.resolve().then(() => {
        setPropertiesLoading(true);
        setPropertiesError(null);
        setPropertiesSuccess(null);
        
        fetch(`/api/servers/${serverId}/properties`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              setProperties(data.content);
            } else {
              setPropertiesError(data.error || 'properties failed to load');
            }
          })
          .catch((err) => {
            console.error(err);
            setPropertiesError('Network error loading properties.');
          })
          .finally(() => setPropertiesLoading(false));
      });
    }
  }, [serverId, activeTab]);

  // Fetch Plugins when switching to Files tab (Paper only)
  const fetchPlugins = useCallback(async () => {
    if (serverType !== 'PAPER') return;
    setPluginsLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/plugins`);
      const data = await res.json();
      if (res.ok && data.success) {
        setPlugins(data.plugins);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPluginsLoading(false);
    }
  }, [serverId, serverType]);

  useEffect(() => {
    if (activeTab === 'files') {
      Promise.resolve().then(() => {
        fetchPlugins();
      });
    }
  }, [activeTab, fetchPlugins]);

  // Server Control Action (START / STOP / RESTART)
  const handleControlAction = async (action: 'START' | 'STOP' | 'RESTART') => {
    // Optimistic UI update
    if (action === 'START') {
      setIsRunning(true);
      setLogs((prev) => prev + '\n[System] Starte Server...\n');
    } else if (action === 'STOP') {
      setIsRunning(false);
      setLogs((prev) => prev + '\n[System] Stoppe Server...\n');
    }
    
    try {
      const res = await fetch(`/api/servers/${serverId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`Action failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Send stdin Console Command
  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    const cmdToSend = command.trim();
    setCommand(''); // instantly clear input

    try {
      const res = await fetch(`/api/servers/${serverId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmdToSend }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLogs((prev) => prev + `\n[System Error] Failed to send command: ${data.error}\n`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save server.properties
  const handleSaveProperties = async () => {
    setPropertiesLoading(true);
    setPropertiesError(null);
    setPropertiesSuccess(null);

    try {
      const res = await fetch(`/api/servers/${serverId}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: properties }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setPropertiesSuccess('Datei "server.properties" erfolgreich gespeichert!');
      } else {
        setPropertiesError(data.error || 'Failed to save properties.');
      }
    } catch (err) {
      console.error(err);
      setPropertiesError('Network error saving properties.');
    } finally {
      setPropertiesLoading(false);
    }
  };

  // Upload File (Plugin or Modpack ZIP)
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploadLoading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(0);

    try {
      await uploadInChunks(uploadFile, `/api/servers/${serverId}/upload`, setUploadProgress);
      setUploadSuccess(`Datei "${uploadFile.name}" erfolgreich hochgeladen.`);
      setUploadFile(null);
      // Refresh file listings
      fetchPlugins();
      fetchMetadata();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Netzwerkfehler beim Hochladen.';
      setUploadError(message);
    } finally {
      setUploadLoading(false);
      setUploadProgress(null);
    }
  };

  // Delete Plugin
  const handleDeletePlugin = async (pluginName: string) => {
    if (!confirm(`Möchtest du das Plugin "${pluginName}" wirklich löschen?`)) return;

    try {
      const res = await fetch(`/api/servers/${serverId}/plugins?name=${encodeURIComponent(pluginName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        fetchPlugins(); // reload list
      } else {
        alert(data.error || 'Failed to delete plugin');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save Settings Config
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    try {
      const res = await fetch(`/api/servers/${serverId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          port,
          memoryMin,
          memoryMax,
          jarFile: serverType === 'PAPER' ? jarFile : undefined,
          curseForgeZip: serverType === 'CURSEFORGE' ? curseForgeZip : undefined,
          startScript: serverType === 'CURSEFORGE' ? startScript : undefined,
          opPlayer: opPlayer || undefined,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSettingsSuccess('Server-Einstellungen erfolgreich gespeichert!');
        fetchMetadata();
      } else {
        setSettingsError(data.error || 'Failed to update settings.');
      }
    } catch (err) {
      console.error(err);
      setSettingsError('Network error saving settings.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleExecuteScript = async () => {
    if (!selectedShFile) {
      setScriptError('Bitte wähle ein Skript zum Ausführen aus.');
      return;
    }
    
    if (isRunning) {
      alert('Der Server muss ausgeschaltet sein, um ein Skript auszuführen.');
      return;
    }

    setScriptExecuting(true);
    setScriptError(null);
    setScriptLogs('Starte Skript...');
    setScriptOutput(null);

    try {
      const res = await fetch(`/api/servers/${serverId}/execute-sh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptName: selectedShFile }),
      });
      
      const data = await res.json();
      if (!res.ok || !data.success) {
        setScriptError(data.error || 'Fehler beim Starten des Skripts.');
        setScriptExecuting(false);
      }
    } catch (err) {
      console.error(err);
      setScriptError('Netzwerkfehler beim Starten des Skripts.');
      setScriptExecuting(false);
    }
  };

  // Poll Script Logs & Status when a script is executing
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const pollScriptStatus = async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/execute-sh`);
        const data = await res.json();
        if (res.ok && data.success) {
          setScriptLogs(data.logs || '');
          if (!data.isRunning) {
            setScriptExecuting(false);
            setScriptOutput({
              code: data.exitCode,
              stdout: data.logs || '',
              stderr: '',
            });
          }
        }
      } catch (err) {
        console.error('Error polling script status:', err);
      }
    };

    if (scriptExecuting) {
      pollScriptStatus();
      interval = setInterval(pollScriptStatus, 1000); // poll every 1s
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [serverId, scriptExecuting]);

  const handleSendScriptInput = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptInput.trim()) return;

    const textToSend = scriptInput.trim();
    setScriptInput('');

    try {
      const res = await fetch(`/api/servers/${serverId}/execute-sh`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: textToSend }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setScriptError(data.error || 'Fehler beim Senden der Eingabe.');
      }
    } catch (err) {
      console.error(err);
      setScriptError('Netzwerkfehler beim Senden der Eingabe.');
    }
  };

  const handleCancelScript = async () => {
    if (!confirm('Möchtest du die Ausführung des Skripts wirklich abbrechen?')) return;

    try {
      const res = await fetch(`/api/servers/${serverId}/execute-sh`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setScriptExecuting(false);
        setScriptLogs((prev) => prev + '\n[System] Skript-Ausführung vom Benutzer abgebrochen.\n');
      } else {
        alert(data.error || 'Fehler beim Abbrechen des Skripts.');
      }
    } catch (err) {
      console.error(err);
      alert('Netzwerkfehler beim Abbrechen des Skripts.');
    }
  };

  // Delete entire server
  const handleDeleteServer = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        router.push('/');
      } else {
        alert(data.error || 'Failed to delete server');
        setDeleteLoading(false);
        setDeleteModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Network error deleting server.');
      setDeleteLoading(false);
      setDeleteModalOpen(false);
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
          <Link href="/" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
            Zurück
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>{name}</h1>
            <p style={{ color: 'var(--text-muted)' }}>
              Servertyp: {serverType === 'PAPER' ? 'Paper (Plugins)' : 'CurseForge Modpack'} | Port: {port}
            </p>
          </div>
          
          <div className="flex-gap">
            <span className={`badge ${isRunning ? 'badge-success' : 'badge-danger'}`} style={{ padding: '8px 14px' }}>
              {isRunning ? 'Online' : 'Offline'}
            </span>
            <button
              onClick={() => handleControlAction(isRunning ? 'STOP' : 'START')}
              className={`btn ${isRunning ? 'btn-danger' : 'btn-success'}`}
            >
              {isRunning ? 'Stoppen' : 'Starten'}
            </button>
            <button
              onClick={() => handleControlAction('RESTART')}
              className="btn btn-warning"
              disabled={!isRunning}
            >
              Neustart
            </button>
          </div>
        </div>

        {/* Tabs navigation */}
        <div className="tabs">
          <div className={`tab ${activeTab === 'console' ? 'active' : ''}`} onClick={() => setActiveTab('console')}>
            Konsole
          </div>
          <div className={`tab ${activeTab === 'properties' ? 'active' : ''}`} onClick={() => setActiveTab('properties')}>
            server.properties
          </div>
          <div className={`tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
            Dateien / Uploads
          </div>
          <div className={`tab ${activeTab === 'backups' ? 'active' : ''}`} onClick={() => setActiveTab('backups')}>
            Backups
          </div>
          <div
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('settings');
              fetchUploads();
            }}
          >
            Einstellungen
          </div>
        </div>

        {/* Tab Content 1: Console */}
        {activeTab === 'console' && (
          <div>
            <div className="console-box" ref={consoleRef}>
              {logs}
            </div>
            <form onSubmit={handleSendCommand} className="flex-gap">
              <input
                type="text"
                className="form-input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Gebe einen Server-Befehl ein (z.B. op Notch, say Hallo)..."
                disabled={!isRunning}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary" disabled={!isRunning}>
                Senden
              </button>
            </form>
          </div>
        )}

        {/* Tab Content 2: Properties */}
        {activeTab === 'properties' && (
          <div>
            {propertiesError && (
              <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', marginBottom: '16px' }}>
                {propertiesError}
              </div>
            )}
            {propertiesSuccess && (
              <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', marginBottom: '16px' }}>
                {propertiesSuccess}
              </div>
            )}
            
            {propertiesLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>Lade properties...</div>
            ) : (
              <div>
                <textarea
                  className="form-textarea"
                  value={properties}
                  onChange={(e) => setProperties(e.target.value)}
                  style={{ height: '450px', fontFamily: 'monospace', fontSize: '0.9rem', marginBottom: '16px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-success" onClick={handleSaveProperties}>
                    Properties speichern
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Content 3: Files & Uploads */}
        {activeTab === 'files' && (
          <div>
            <div className="grid-2">
              {/* Left Column: Upload Dropzone */}
              <div>
                <h3 style={{ color: '#fff', marginBottom: '16px' }}>Datei hochladen</h3>
                {uploadError && (
                  <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', marginBottom: '16px' }}>
                    {uploadError}
                  </div>
                )}
                {uploadSuccess && (
                  <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', marginBottom: '16px' }}>
                    {uploadSuccess}
                  </div>
                )}

                <form onSubmit={handleFileUpload} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="dropzone" onClick={() => document.getElementById('file-upload-input')?.click()}>
                    <svg style={{ width: '40px', height: '40px', margin: '0 auto', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <div className="dropzone-text">
                      {uploadFile ? uploadFile.name : 'Klicke hier, um eine Datei auszuwählen'}
                    </div>
                  </div>
                  
                  <input
                    type="file"
                    id="file-upload-input"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                    accept={serverType === 'PAPER' ? '.jar' : '.zip'}
                  />

                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {serverType === 'PAPER' ? (
                      <span>Lade Plugins (z.B. EssentialsX.jar) hoch. Wenn du die server.jar aktualisieren möchtest, lade eine Datei namens &quot;server.jar&quot; oder deine benutzerdefinierte JAR-Datei im Hauptverzeichnis hoch.</span>
                    ) : (
                      <span>Lade die CurseForge Server Pack ZIP-Datei hoch. Der Inhalt wird automatisch im Serververzeichnis entpackt.</span>
                    )}
                  </div>

                  {uploadProgress !== null && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span>Lade hoch...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div style={{ width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.1s ease-in-out' }} />
                      </div>
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary" disabled={!uploadFile || uploadLoading}>
                    {uploadLoading ? `Lade hoch... ${uploadProgress !== null ? `${uploadProgress}%` : ''}` : 'Hochladen starten'}
                  </button>
                </form>
              </div>

              {/* Right Column: Files listing (Paper only) */}
              <div>
                <h3 style={{ color: '#fff', marginBottom: '16px' }}>
                  {serverType === 'PAPER' ? 'Installierte Plugins' : 'CurseForge Modpack ZIP'}
                </h3>

                {serverType === 'PAPER' ? (
                  pluginsLoading ? (
                    <div style={{ color: 'var(--text-muted)' }}>Lade Plugins...</div>
                  ) : plugins.length === 0 ? (
                    <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px' }}>
                      Keine Plugins hochgeladen.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {plugins.map((plugin) => (
                        <div key={plugin} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{plugin}</span>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeletePlugin(plugin)}
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          >
                            Löschen
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="card" style={{ color: 'var(--text-muted)' }}>
                    {jarFile ? (
                      <p>ZIP-Paket wurde erfolgreich entpackt. Der Server startet über den in der ZIP-Datei enthaltenen Starter (run.sh / run.ps1).</p>
                    ) : (
                      <p>Bitte lade oben ein CurseForge Server Pack (.zip) hoch, um den Server zu installieren.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 5: Backups */}
        {activeTab === 'backups' && (
          <div>
            <div className="card">
              <div className="flex-between" style={{ marginBottom: '24px' }}>
                <div>
                  <h3 style={{ color: '#fff', marginBottom: '4px' }}>Welt-Backups</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Erstelle Backups deiner Minecraft-Welt. Backups können nur erstellt werden, wenn der Server offline ist.
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleCreateBackup}
                  disabled={isRunning || backupCreateLoading}
                  style={{ cursor: isRunning ? 'not-allowed' : 'pointer' }}
                >
                  {backupCreateLoading ? 'Erstelle Backup...' : 'Backup erstellen'}
                </button>
              </div>

              {isRunning && (
                <div style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '16px', fontWeight: 600 }}>
                  ⚠️ Der Server muss ausgeschaltet sein, um ein Backup zu erstellen.
                </div>
              )}

              {backupError && (
                <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px', marginBottom: '16px' }}>
                  {backupError}
                </div>
              )}
              {backupSuccess && (
                <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', padding: '12px 16px', marginBottom: '16px' }}>
                  {backupSuccess}
                </div>
              )}

              <h4 style={{ color: '#fff', marginBottom: '16px', fontSize: '1.1rem' }}>Verfügbare Backups</h4>
              
              {backupsLoading ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>Lade Backups...</div>
              ) : backups.length === 0 ? (
                <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px', backgroundColor: 'var(--input-bg)' }}>
                  Keine Backups vorhanden. Stoppe den Server und klicke oben auf &quot;Backup erstellen&quot;.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {backups.map((backup) => (
                    <div
                      key={backup.name}
                      className="card"
                      style={{
                        padding: '16px 20px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 0,
                        backgroundColor: 'var(--input-bg)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>{backup.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Größe: {(backup.size / (1024 * 1024)).toFixed(2)} MB | Erstellt am: {new Date(backup.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex-gap">
                        <a
                          href={`/api/servers/${serverId}/backups/download?name=${encodeURIComponent(backup.name)}`}
                          className="btn btn-success"
                          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                        >
                          Herunterladen
                        </a>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteBackup(backup.name)}
                          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Content 4: Settings */}
        {activeTab === 'settings' && (
          <div>
            <div className="grid-2">
              {/* Configuration Form */}
              <form onSubmit={handleSaveSettings} className="card">
                <h3 style={{ color: '#fff', marginBottom: '20px' }}>Server-Einstellungen</h3>
                
                {settingsError && (
                  <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px', marginBottom: '16px' }}>
                    {settingsError}
                  </div>
                )}
                {settingsSuccess && (
                  <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', padding: '12px 16px', marginBottom: '16px' }}>
                    {settingsSuccess}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Server Port</label>
                  <input
                    type="number"
                    className="form-input"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    required
                  />
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Minimaler RAM (Java -Xms)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={memoryMin}
                      onChange={(e) => setMemoryMin(e.target.value)}
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
                      required
                    />
                  </div>
                </div>

                {serverType === 'PAPER' && (
                  <div className="form-group">
                    <label className="form-label">Server JAR Dateiname</label>
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

                {serverType === 'CURSEFORGE' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">CurseForge Server Pack (.zip)</label>
                      <select
                        className="form-select"
                        value={curseForgeZip}
                        onChange={(e) => setCurseForgeZip(e.target.value)}
                        required
                      >
                        <option value="">-- ZIP-Datei auswählen --</option>
                        {zips.map((zip) => (
                          <option key={zip.name} value={zip.name}>
                            {zip.name} ({(zip.size / (1024 * 1024)).toFixed(2)} MB)
                          </option>
                        ))}
                      </select>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '6px' }}>
                        Hinweis: Das Ändern und Speichern eines anderen ZIP-Pakets extrahiert dessen Inhalt erneut in das Serververzeichnis.
                      </p>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Start-Skript (.sh)</label>
                      <select
                        className="form-select"
                        value={startScript}
                        onChange={(e) => setStartScript(e.target.value)}
                        required
                      >
                        {availableShFiles.length === 0 ? (
                          <option value="run.sh">run.sh (Nicht gefunden, Standard-Fallback)</option>
                        ) : (
                          availableShFiles.map((file) => (
                            <option key={file} value={file}>
                              {file}
                            </option>
                          ))
                        )}
                      </select>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '6px' }}>
                        Wähle das Skript aus, mit dem der Server gestartet wird, sobald du auf &quot;Starten&quot; klickst.
                      </p>
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label className="form-label">OP Ingame Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={opPlayer}
                    onChange={(e) => setOpPlayer(e.target.value)}
                    placeholder="Wird beim Serverstart automatisch geopt"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <button type="submit" className="btn btn-success" disabled={settingsLoading}>
                    {settingsLoading ? 'Speichere...' : 'Einstellungen speichern'}
                  </button>
                </div>
              </form>

              {serverType === 'CURSEFORGE' && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ color: '#fff' }}>Shell-Skripte ausführen</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Führe Konfigurations- oder Setup-Skripte (wie z. B. <code>modpacksettings.sh</code>) aus dem Server-Verzeichnis aus. Der Server muss gestoppt sein.
                  </p>
                  
                  {isRunning && (
                    <div style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>
                      ⚠️ Stoppe den Server, um Skripte auszuführen.
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Verfügbare Skripte</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <select
                        className="form-select"
                        value={selectedShFile}
                        onChange={(e) => setSelectedShFile(e.target.value)}
                        disabled={isRunning || scriptExecuting}
                        style={{ flex: 1 }}
                      >
                        {availableShFiles.length === 0 ? (
                          <option value="">Keine .sh Skripte gefunden</option>
                        ) : (
                          availableShFiles.map((file) => (
                            <option key={file} value={file}>
                              {file}
                            </option>
                          ))
                        )}
                      </select>
                      {scriptExecuting ? (
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={handleCancelScript}
                        >
                          Abbrechen
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleExecuteScript}
                          disabled={isRunning || !selectedShFile}
                        >
                          Ausführen
                        </button>
                      )}
                    </div>
                  </div>

                  {scriptError && (
                    <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', margin: 0, padding: '12px' }}>
                      {scriptError}
                    </div>
                  )}

                  {(scriptExecuting || scriptLogs) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                      <div className="flex-between">
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Status: {scriptExecuting ? (
                            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Wird ausgeführt...</span>
                          ) : scriptOutput ? (
                            scriptOutput.code === 0 ? (
                              <span style={{ color: 'var(--success)', fontWeight: 600 }}>Erfolgreich (Code 0)</span>
                            ) : (
                              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Fehlgeschlagen (Code {scriptOutput.code})</span>
                            )
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Bereit</span>
                          )}
                        </span>
                        {!scriptExecuting && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              setScriptLogs('');
                              setScriptOutput(null);
                            }}
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                          >
                            Leeren
                          </button>
                        )}
                      </div>
                      
                      <div
                        style={{
                          backgroundColor: '#0c0f1d',
                          border: '1px solid #1e293b',
                          borderRadius: '6px',
                          padding: '12px',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          height: '220px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          color: '#e2e8f0',
                        }}
                      >
                        {scriptLogs || <span style={{ color: 'var(--text-muted)' }}>(Keine Ausgabe)</span>}
                      </div>

                      {scriptExecuting && (
                        <form onSubmit={handleSendScriptInput} style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={scriptInput}
                            onChange={(e) => setScriptInput(e.target.value)}
                            placeholder="Eingabe für das Skript (z.B. y, Passwort)..."
                            style={{ flex: 1, fontSize: '0.85rem', padding: '6px 12px' }}
                          />
                          <button type="submit" className="btn btn-success" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                            Senden
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Danger Zone */}
              <div className="card" style={{ border: '1px solid var(--danger)' }}>
                <h3 style={{ color: 'var(--danger)', marginBottom: '12px' }}>Gefahrenzone</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
                  Durch das Löschen des Servers werden alle zugehörigen Daten wie Welten, Plugins und Konfigurationsdateien unwiderruflich vom Server gelöscht.
                </p>
                <button
                  className="btn btn-danger"
                  onClick={() => setDeleteModalOpen(true)}
                  disabled={isRunning}
                  style={{ width: '100%' }}
                >
                  {isRunning ? 'Stoppe den Server zum Löschen' : 'Server unwiderruflich löschen'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <h2 style={{ color: 'var(--danger)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '12px' }}>
              Bist du dir absolut sicher?
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>
              Diese Aktion kann nicht rückgängig gemacht werden. Dadurch wird der Server <strong>{name}</strong> mitsamt allen Dateien und Welten vollständig gelöscht.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleteLoading}
              >
                Abbrechen
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteServer}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Lösche...' : 'Ja, Server löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
