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

interface UploadedFileItem {
  name: string;
  size: number;
  createdAt: string;
  description?: string;
}

export default function ServerConsoleClient({
  serverId,
  initialServerName,
  serverType,
  user,
}: ServerConsoleClientProps) {
  const router = useRouter();
  
  // Tab control (Files tab removed)
  const [activeTab, setActiveTab] = useState<'console' | 'properties' | 'plugins' | 'backups' | 'settings' | 'update'>('console');
  
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
  
  // Plugins tab states
  const [plugins, setPlugins] = useState<string[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [globalPlugins, setGlobalPlugins] = useState<UploadedFileItem[]>([]);
  const [pluginFilter, setPluginFilter] = useState('');
  const [togglingPluginName, setTogglingPluginName] = useState<string | null>(null);
  const [draggedPlugin, setDraggedPlugin] = useState<string | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [pluginSuccessMsg, setPluginSuccessMsg] = useState<string | null>(null);
  const [pluginErrorMsg, setPluginErrorMsg] = useState<string | null>(null);
  
  // Settings tab states
  const [name, setName] = useState(initialServerName);
  const [port, setPort] = useState('25565');
  const [memoryMin, setMemoryMin] = useState('2048M');
  const [memoryMax, setMemoryMax] = useState('6144M');
  const [jarFile, setJarFile] = useState('');
  const [curseForgeZip, setCurseForgeZip] = useState('');
  const [startScript, setStartScript] = useState('run.sh');
  const [availableShFiles, setAvailableShFiles] = useState<string[]>([]);
  const [selectedShFile, setSelectedShFile] = useState('');
  const [scriptExecuting, setScriptExecuting] = useState(false);
  const [scriptLogs, setScriptLogs] = useState('');
  const [scriptInput, setScriptInput] = useState('');
  const [scriptOutput, setScriptOutput] = useState<{ code: number | null; stdout: string; stderr: string } | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Global upload files
  const [zips, setZips] = useState<UploadedFileItem[]>([]);
  const [jars, setJars] = useState<UploadedFileItem[]>([]);

  // Update/Rollback states
  const [targetJar, setTargetJar] = useState('');
  const [targetZip, setTargetZip] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [rollbackSuccess, setRollbackSuccess] = useState<string | null>(null);
  const [rollbackAvailable, setRollbackAvailable] = useState(false);

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
        setMemoryMin(data.server.memoryMin || '');
        setMemoryMax(data.server.memoryMax || '');
        setJarFile(data.server.jarFile || '');
        setCurseForgeZip(data.server.curseForgeZip || '');
        setStartScript(data.server.startScript || 'run.sh');
        setAvailableShFiles(data.server.availableShFiles || []);
        if (data.server.availableShFiles && data.server.availableShFiles.length > 0 && !selectedShFile) {
          setSelectedShFile(data.server.availableShFiles[0]);
        }
        setIsRunning(data.server.isRunning);
        setRollbackAvailable(data.server.rollbackAvailable || false);
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
        setZips(data.curseforge || data.zips || []);
        setJars(data.minecraft?.jars || data.jars || []);
        setGlobalPlugins(data.minecraft?.plugins || data.plugins || []);
      }
    } catch (err) {
      console.error('Failed to fetch uploads:', err);
    }
  }, []);

  const fetchPlugins = useCallback(async () => {
    setPluginsLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/plugins`);
      const data = await res.json();
      if (res.ok && data.success) {
        setPlugins(data.plugins || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPluginsLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchMetadata();
      fetchUploads();
      fetchPlugins();
    });
  }, [fetchMetadata, fetchUploads, fetchPlugins]);

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
      setBackupError('Failed to create backup due to network error.');
    } finally {
      setBackupCreateLoading(false);
    }
  };

  const handleRestoreBackup = async (backupName: string) => {
    if (isRunning) {
      alert('Der Server muss ausgeschaltet sein, um ein Backup wiederherzustellen.');
      return;
    }
    if (!confirm(`Möchtest du das Backup "${backupName}" wirklich wiederherstellen? Die aktuelle Welt wird überschrieben.`)) {
      return;
    }
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/backups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackupSuccess(data.message);
      } else {
        setBackupError(data.error || 'Failed to restore backup.');
      }
    } catch {
      setBackupError('Network error restoring backup.');
    }
  };

  const handleDeleteBackup = async (backupName: string) => {
    if (!confirm(`Möchtest du das Backup "${backupName}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/servers/${serverId}/backups?name=${encodeURIComponent(backupName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchBackups();
      } else {
        alert(data.error || 'Failed to delete backup');
      }
    } catch {
      alert('Network error deleting backup');
    }
  };

  // Run initial tab fetches
  useEffect(() => {
    Promise.resolve().then(() => {
      if (activeTab === 'settings' || activeTab === 'update' || activeTab === 'plugins') {
        fetchUploads();
        fetchPlugins();
      } else if (activeTab === 'backups') {
        fetchBackups();
      }
    });
  }, [activeTab, fetchUploads, fetchBackups, fetchPlugins]);

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

  // Server Control Action (START / STOP / RESTART)
  const handleControlAction = async (action: 'START' | 'STOP' | 'RESTART') => {
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
        alert(`Aktion fehlgeschlagen: ${data.error || 'Unbekannter Fehler'}`);
        fetchMetadata();
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
    setCommand('');

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
        setPropertiesError(data.error || 'Fehler beim Speichern der Properties.');
      }
    } catch (err) {
      console.error(err);
      setPropertiesError('Netzwerkfehler beim Speichern der Properties.');
    } finally {
      setPropertiesLoading(false);
    }
  };

  // Plugin activate/deactivate
  const handleTogglePlugin = async (pluginName: string, currentlyInstalled: boolean) => {
    setTogglingPluginName(pluginName);
    setPluginSuccessMsg(null);
    setPluginErrorMsg(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginName,
          selected: !currentlyInstalled,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPluginSuccessMsg(
          currentlyInstalled
            ? `Plugin "${pluginName}" deaktiviert.`
            : `Plugin "${pluginName}" erfolgreich aktiviert!`
        );
        fetchPlugins();
      } else {
        setPluginErrorMsg(data.error || 'Fehler beim Ändern des Plugin-Zustands.');
      }
    } catch (err) {
      console.error(err);
      setPluginErrorMsg('Netzwerkfehler beim Ändern des Plugins.');
    } finally {
      setTogglingPluginName(null);
    }
  };

  const handleServerUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRunning) {
      alert('Der Server muss ausgeschaltet sein, um ein Update durchzuführen.');
      return;
    }
    setUpdateLoading(true);
    setUpdateError(null);
    setUpdateSuccess(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetJar: serverType === 'PAPER' ? targetJar : undefined,
          targetZip: serverType === 'CURSEFORGE' ? targetZip : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUpdateSuccess(data.message || 'Update erfolgreich durchgeführt.');
        fetchMetadata();
      } else {
        setUpdateError(data.error || 'Fehler beim Durchführen des Updates.');
      }
    } catch {
      setUpdateError('Netzwerkfehler beim Ausführen des Updates.');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleServerRollback = async () => {
    if (isRunning) {
      alert('Der Server muss ausgeschaltet sein, um ein Rollback durchzuführen.');
      return;
    }
    if (!confirm('Möchtest du wirklich zum Zustand vor dem letzten Update zurückkehren? Der aktuelle Zustand wird gelöscht.')) {
      return;
    }
    setRollbackLoading(true);
    setRollbackError(null);
    setRollbackSuccess(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/rollback`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRollbackSuccess(data.message || 'Rollback erfolgreich durchgeführt.');
        fetchMetadata();
      } else {
        setRollbackError(data.error || 'Fehler beim Rollback.');
      }
    } catch {
      setRollbackError('Netzwerkfehler beim Ausführen des Rollbacks.');
    } finally {
      setRollbackLoading(false);
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
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSettingsSuccess('Einstellungen erfolgreich gespeichert.');
        fetchMetadata();
      } else {
        setSettingsError(data.error || 'Fehler beim Speichern der Einstellungen.');
      }
    } catch (err) {
      console.error(err);
      setSettingsError('Netzwerkfehler beim Speichern der Einstellungen.');
    } finally {
      setSettingsLoading(false);
    }
  };

  // Execute Shell Script
  const handleExecuteScript = async () => {
    if (!selectedShFile) return;
    if (isRunning) {
      alert('Der Server muss gestoppt sein, um ein Skript auszuführen.');
      return;
    }

    setScriptExecuting(true);
    setScriptError(null);
    setScriptOutput(null);
    setScriptLogs('Starte Skript...\n');

    try {
      const res = await fetch(`/api/servers/${serverId}/execute-sh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptName: selectedShFile }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setScriptError(data.error || 'Skript-Start fehlgeschlagen.');
        setScriptExecuting(false);
      }
    } catch (err) {
      console.error(err);
      setScriptError('Netzwerkfehler beim Starten des Skripts.');
      setScriptExecuting(false);
    }
  };

  // Poll Script Logs
  useEffect(() => {
    let scriptInterval: NodeJS.Timeout;
    if (scriptExecuting) {
      scriptInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/servers/${serverId}/execute-sh`);
          const data = await res.json();
          if (res.ok && data.success) {
            setScriptLogs(data.logs);
            if (!data.isRunning) {
              setScriptExecuting(false);
              setScriptOutput({
                code: data.exitCode,
                stdout: data.logs,
                stderr: '',
              });
            }
          }
        } catch (err) {
          console.error('Fehler beim Abrufen der Skript-Logs:', err);
        }
      }, 1000);
    }
    return () => {
      if (scriptInterval) clearInterval(scriptInterval);
    };
  }, [scriptExecuting, serverId]);

  // Send input to running script
  const handleSendScriptInput = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptInput) return;
    const inputToSend = scriptInput;
    setScriptInput('');

    try {
      await fetch(`/api/servers/${serverId}/execute-sh`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputToSend }),
      });
    } catch (err) {
      console.error('Fehler beim Senden der Skript-Eingabe:', err);
    }
  };

  // Abort running script
  const handleStopScript = async () => {
    try {
      await fetch(`/api/servers/${serverId}/execute-sh`, { method: 'DELETE' });
    } catch (err) {
      console.error('Fehler beim Abbrechen des Skripts:', err);
    }
  };

  // Delete Server
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
        alert(data.error || 'Fehler beim Löschen des Servers.');
        setDeleteLoading(false);
      }
    } catch (err) {
      console.error(err);
      alert('Netzwerkfehler beim Löschen des Servers.');
      setDeleteLoading(false);
    }
  };

  const filteredGlobalPlugins = globalPlugins.filter((p) =>
    p.name.toLowerCase().includes(pluginFilter.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(pluginFilter.toLowerCase()))
  );

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
        {/* Navigation Breadcrumb & Back */}
        <div style={{ marginBottom: '16px' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Zurück zur Serverübersicht
          </Link>
        </div>

        {/* Server Header & Controls */}
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#fff' }}>{name}</h1>
              <span className={`status-dot ${isRunning ? 'online' : 'offline'}`} />
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: isRunning ? 'var(--success)' : 'var(--danger)' }}>
                {isRunning ? 'Online' : 'Offline'}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Servertyp: {serverType === 'PAPER' ? 'Paper (Plugins)' : 'CurseForge Modpack'} | Port: {port}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => handleControlAction('START')}
              className="btn btn-success"
              disabled={isRunning}
            >
              Starten
            </button>
            <button
              onClick={() => handleControlAction('STOP')}
              className="btn btn-danger"
              disabled={!isRunning}
            >
              Stoppen
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
          <div className={`tab ${activeTab === 'plugins' ? 'active' : ''}`} onClick={() => { setActiveTab('plugins'); fetchUploads(); fetchPlugins(); }}>
            Plugins ({plugins.length})
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
          <div
            className={`tab ${activeTab === 'update' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('update');
              fetchUploads();
            }}
          >
            Server updaten
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

        {/* Tab Content 3: PLUGINS OVERHAUL (2 COLUMNS WITH DRAG AND DROP) */}
        {activeTab === 'plugins' && (
          <div>
            {pluginSuccessMsg && (
              <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', padding: '12px 16px', marginBottom: '16px' }}>
                {pluginSuccessMsg}
              </div>
            )}
            {pluginErrorMsg && (
              <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px', marginBottom: '16px' }}>
                {pluginErrorMsg}
              </div>
            )}

            <div style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              💡 Ziehe Plugins per Drag & Drop von der linken Seite auf die rechte Seite, um sie zu aktivieren.
            </div>

            <div className="grid-2" style={{ alignItems: 'start', minHeight: '520px' }}>
              {/* LEFT COLUMN: Available Plugins in uploads/minecraft/plugins/ */}
              <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 700 }}>
                      Verfügbare Plugins (Dateisystem)
                    </h3>
                    <span className="badge badge-paper">{globalPlugins.length} verfügbar</span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                    placeholder="Plugins durchsuchen..."
                    value={pluginFilter}
                    onChange={(e) => setPluginFilter(e.target.value)}
                  />
                </div>

                {pluginsLoading ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px' }}>Lade Plugins...</div>
                ) : filteredGlobalPlugins.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius)' }}>
                    {globalPlugins.length === 0
                      ? 'Keine globalen Plugins hochgeladen. Lade Plugins zuerst im Dashboard unter "Dateiverwaltung" hoch.'
                      : 'Keine passenden Plugins gefunden.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '550px', paddingRight: '4px' }}>
                    {filteredGlobalPlugins.map((plugin) => {
                      const isInstalled = plugins.includes(plugin.name);
                      const isToggling = togglingPluginName === plugin.name;
                      const isBeingDragged = draggedPlugin === plugin.name;

                      return (
                        <div
                          key={plugin.name}
                          draggable={!isInstalled}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', plugin.name);
                            setDraggedPlugin(plugin.name);
                          }}
                          onDragEnd={() => setDraggedPlugin(null)}
                          className="card"
                          style={{
                            padding: '12px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 0,
                            backgroundColor: isInstalled ? 'rgba(255, 255, 255, 0.02)' : 'var(--input-bg)',
                            border: isInstalled ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid var(--border-color)',
                            cursor: isInstalled ? 'default' : 'grab',
                            opacity: isBeingDragged ? 0.4 : isInstalled ? 0.75 : 1,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, marginRight: '10px' }}>
                            {!isInstalled && (
                              <span style={{ color: 'var(--text-muted)', cursor: 'grab', fontSize: '1.1rem', userSelect: 'none' }} title="Ziehen zum Aktivieren">
                                ⠿
                              </span>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                              <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={plugin.name}>
                                {plugin.name}
                              </span>
                              {plugin.description && (
                                <span style={{ fontSize: '0.8rem', color: '#bbb' }}>
                                  {plugin.description}
                                </span>
                              )}
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {(plugin.size / (1024 * 1024)).toFixed(2)} MB
                              </span>
                            </div>
                          </div>

                          <div>
                            {isInstalled ? (
                              <span className="badge" style={{ backgroundColor: 'rgba(46, 196, 182, 0.15)', color: 'var(--success)', border: '1px solid var(--success)', fontSize: '0.75rem' }}>
                                ✓ Aktiv
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '4px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                disabled={isToggling}
                                onClick={() => handleTogglePlugin(plugin.name, false)}
                              >
                                {isToggling ? '...' : '+ Aktivieren'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: Installed Plugins Dropzone */}
              <div
                className="card"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setIsDropActive(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsDropActive(false);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDropActive(false);
                  const pName = e.dataTransfer.getData('text/plain');
                  if (pName && !plugins.includes(pName)) {
                    handleTogglePlugin(pName, false);
                  }
                }}
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  border: isDropActive ? '2px dashed var(--primary)' : '1px solid var(--border-color)',
                  backgroundColor: isDropActive ? 'rgba(56, 189, 248, 0.1)' : 'var(--card-bg)',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 700, marginBottom: '2px' }}>
                      Installierte Plugins (Server)
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Ordner: <code style={{ color: 'var(--primary)' }}>servers/{serverId}/plugins/</code>
                    </span>
                  </div>
                  <span className="badge" style={{ backgroundColor: 'rgba(46, 196, 182, 0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>
                    {plugins.length} aktiv
                  </span>
                </div>

                {isDropActive && (
                  <div style={{ padding: '16px', textAlign: 'center', backgroundColor: 'rgba(56, 189, 248, 0.15)', borderRadius: 'var(--border-radius)', marginBottom: '12px', border: '1px solid var(--primary)', color: '#fff', fontWeight: 600 }}>
                    Plugin hier ablegen zum Aktivieren!
                  </div>
                )}

                {pluginsLoading ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px' }}>Lade installierte Plugins...</div>
                ) : plugins.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', border: '2px dashed var(--border-color)', borderRadius: 'var(--border-radius)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <svg style={{ width: '48px', height: '48px', opacity: 0.4, marginBottom: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p style={{ fontWeight: 600, color: '#fff', marginBottom: '6px' }}>Keine Plugins auf diesem Server aktiv</p>
                    <p style={{ fontSize: '0.85rem', maxWidth: '300px' }}>
                      Ziehe ein Plugin von der linken Spalte hierher, um es sofort in den Server-Ordner zu kopieren.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '550px', paddingRight: '4px' }}>
                    {plugins.map((plugin) => {
                      const isToggling = togglingPluginName === plugin;

                      return (
                        <div
                          key={plugin}
                          className="card"
                          style={{
                            padding: '12px 16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 0,
                            backgroundColor: 'var(--input-bg)',
                            borderLeft: '4px solid var(--success)',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                            <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={plugin}>
                              {plugin}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', flexShrink: 0 }}
                            disabled={isToggling}
                            onClick={() => handleTogglePlugin(plugin, true)}
                          >
                            {isToggling ? '...' : 'Deaktivieren'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 4: Backups */}
        {activeTab === 'backups' && (
          <div>
            <div className="card">
              <div className="flex-between" style={{ marginBottom: '24px' }}>
                <div>
                  <h3 style={{ color: '#fff', marginBottom: '4px' }}>Welt-Backups</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Erstelle und verwalte ZIP-Backups der aktuellen Spielwelt.
                  </p>
                </div>
                <button
                  onClick={handleCreateBackup}
                  className="btn btn-primary"
                  disabled={isRunning || backupCreateLoading}
                >
                  {backupCreateLoading ? 'Erstelle Backup...' : 'Neues Backup erstellen'}
                </button>
              </div>

              {isRunning && (
                <div style={{ color: 'var(--warning)', fontSize: '0.85rem', marginBottom: '16px', fontWeight: 600 }}>
                  ⚠️ Der Server läuft derzeit. Für ein sicheres Backup muss der Server gestoppt werden.
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

              {backupsLoading ? (
                <div style={{ color: 'var(--text-muted)' }}>Lade Backups...</div>
              ) : backups.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius)' }}>
                  Keine Backups vorhanden.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {backups.map((b) => (
                    <div
                      key={b.name}
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
                        <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>{b.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Größe: {(b.size / (1024 * 1024)).toFixed(2)} MB | Erstellt: {new Date(b.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          className="btn btn-warning"
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          disabled={isRunning}
                          onClick={() => handleRestoreBackup(b.name)}
                        >
                          Wiederherstellen
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          onClick={() => handleDeleteBackup(b.name)}
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

        {/* Tab Content 5: Settings */}
        {activeTab === 'settings' && (
          <div>
            <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <h3 style={{ color: '#fff', marginBottom: '16px' }}>Server-Einstellungen</h3>

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

              <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
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
                    <label className="form-label">Minimaler RAM (-Xms)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={memoryMin}
                      onChange={(e) => setMemoryMin(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Maximaler RAM (-Xmx)</label>
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
                    {jars.length === 0 ? (
                      <div style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
                        Keine JAR-Dateien in der globalen Dateiverwaltung gefunden.
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
                            {zip.name} {zip.description ? `(${zip.description})` : ''} - ({(zip.size / (1024 * 1024)).toFixed(2)} MB)
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
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button type="submit" className="btn btn-success" disabled={settingsLoading}>
                    {settingsLoading ? 'Speichere...' : 'Einstellungen speichern'}
                  </button>
                </div>
              </form>

              {serverType === 'CURSEFORGE' && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
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
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleExecuteScript}
                        disabled={isRunning || !selectedShFile || scriptExecuting}
                      >
                        {scriptExecuting ? 'Läuft...' : 'Ausführen'}
                      </button>
                    </div>
                  </div>

                  {scriptError && (
                    <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px' }}>
                      {scriptError}
                    </div>
                  )}

                  {scriptExecuting && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={handleStopScript}
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      >
                        Skript abbrechen
                      </button>
                    </div>
                  )}

                  {(scriptExecuting || scriptLogs) && (
                    <div>
                      <div className="console-box" style={{ height: '220px', marginBottom: '8px' }}>
                        {scriptLogs}
                      </div>
                      {scriptExecuting && (
                        <form onSubmit={handleSendScriptInput} className="flex-gap">
                          <input
                            type="text"
                            className="form-input"
                            value={scriptInput}
                            onChange={(e) => setScriptInput(e.target.value)}
                            placeholder="Eingabe für das Skript eingeben (z.B. y, n, Token)..."
                            style={{ flex: 1 }}
                          />
                          <button type="submit" className="btn btn-primary">
                            Senden
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {scriptOutput && (
                    <div style={{ color: scriptOutput.code === 0 ? 'var(--success)' : 'var(--danger)', fontSize: '0.9rem', fontWeight: 600 }}>
                      Skript beendet mit Code: {scriptOutput.code}
                    </div>
                  )}
                </div>
              )}

              {/* Danger Zone */}
              <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
                <h4 style={{ color: 'var(--danger)', marginBottom: '8px', fontWeight: 700 }}>Gefahrenbereich</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                  Das Löschen des Servers entfernt die Konfiguration sowie den gesamten Serverordner unwiderruflich vom System.
                </p>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setDeleteModalOpen(true)}
                  disabled={isRunning}
                >
                  Server vollständig löschen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 6: Server Update */}
        {activeTab === 'update' && (
          <div>
            <div className="grid-2">
              {/* Left Column: Perform Update */}
              <form onSubmit={handleServerUpdate} className="card">
                <h3 style={{ color: '#fff', marginBottom: '16px' }}>Server updaten</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
                  Wechsle die Server-Version. Das System erstellt vollautomatisch ein Welt-Backup und verschiebt die aktuelle Version zur Sicherheit nach <code>_old</code>, bevor die neue Version installiert wird.
                </p>

                {isRunning && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '20px', fontWeight: 600 }}>
                    ⚠️ Stoppe den Server, um das Update durchzuführen.
                  </div>
                )}

                {updateError && (
                  <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px', marginBottom: '16px' }}>
                    {updateError}
                  </div>
                )}
                {updateSuccess && (
                  <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', padding: '12px 16px', marginBottom: '16px' }}>
                    {updateSuccess}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Aktuelle Version</label>
                  <div style={{ padding: '10px 14px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 'var(--border-radius)', fontFamily: 'monospace' }}>
                    {serverType === 'PAPER' ? (jarFile || 'Nicht konfiguriert') : (curseForgeZip || 'Kein ZIP geladen')}
                  </div>
                </div>

                {serverType === 'PAPER' ? (
                  <div className="form-group">
                    <label className="form-label">Neue JAR-Datei auswählen</label>
                    <select
                      className="form-select"
                      value={targetJar}
                      onChange={(e) => setTargetJar(e.target.value)}
                      disabled={isRunning || updateLoading}
                      required
                    >
                      <option value="">-- Bitte JAR-Datei auswählen --</option>
                      {jars.map((jar) => (
                        <option key={jar.name} value={jar.name}>
                          {jar.name} {jar.description ? `(${jar.description})` : ''} - ({(jar.size / (1024 * 1024)).toFixed(2)} MB)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Neues CurseForge Server Pack (.zip) auswählen</label>
                    <select
                      className="form-select"
                      value={targetZip}
                      onChange={(e) => setTargetZip(e.target.value)}
                      disabled={isRunning || updateLoading}
                      required
                    >
                      <option value="">-- Bitte ZIP-Datei auswählen --</option>
                      {zips.map((zip) => (
                        <option key={zip.name} value={zip.name}>
                          {zip.name} {zip.description ? `(${zip.description})` : ''} - ({(zip.size / (1024 * 1024)).toFixed(2)} MB)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} disabled={isRunning || updateLoading}>
                  {updateLoading ? 'Update läuft (Backup & Kopieren)...' : 'Update starten'}
                </button>
              </form>

              {/* Right Column: Rollback Option */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ color: '#fff' }}>Rollback (Zurückrollen)</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Sollte es nach einem Update Probleme geben, kannst du hier die direkt davor gesicherte Version wiederherstellen. Dadurch wird der aktuelle neue Server gelöscht und der alte Stand exakt so wieder gestartet, wie er vor dem Update war.
                </p>

                {rollbackError && (
                  <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px 16px', marginBottom: '16px' }}>
                    {rollbackError}
                  </div>
                )}
                {rollbackSuccess && (
                  <div className="card" style={{ borderLeft: '4px solid var(--success)', color: 'var(--success)', padding: '12px 16px', marginBottom: '16px' }}>
                    {rollbackSuccess}
                  </div>
                )}

                {!rollbackAvailable ? (
                  <div className="card" style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    Keine alte Server-Version für Rollback verfügbar.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ color: 'var(--warning)', fontWeight: 600, fontSize: '0.9rem' }}>
                      ⚠️ Eine gesicherte Version vor dem letzten Update wurde gefunden.
                    </div>
                    <button
                      type="button"
                      onClick={handleServerRollback}
                      className="btn btn-warning"
                      style={{ width: '100%' }}
                      disabled={isRunning || rollbackLoading}
                    >
                      {rollbackLoading ? 'Führe Rollback aus...' : 'Rollback auf alte Version durchführen'}
                    </button>
                  </div>
                )}
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
