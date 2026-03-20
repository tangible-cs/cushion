
import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';

interface WorkspacePickerProps {
  onWorkspaceOpened?: () => void;
}

export function WorkspacePicker({ onWorkspaceOpened }: WorkspacePickerProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { openWorkspace, selectWorkspaceFolder, recentProjects, setClient } = useWorkspaceStore();

  useEffect(() => {
    let cancelled = false;
    getSharedCoordinatorClient()
      .then((client) => {
        if (cancelled) return;
        setClient(client);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [setClient]);

  const handleBrowse = async () => {
    setError(null);
    try {
      const path = await selectWorkspaceFolder();
      if (!path) return; // user cancelled

      setIsOpening(true);
      await openWorkspace(path);
      onWorkspaceOpened?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open workspace');
    } finally {
      setIsOpening(false);
    }
  };

  const handleOpenRecent = async (path: string) => {
    setIsOpening(true);
    setError(null);
    try {
      await openWorkspace(path);
      onWorkspaceOpened?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open workspace');
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="workspace-picker">
      <style>{`
        .workspace-picker {
          min-height: 100vh;
          width: 100%;
          background: linear-gradient(180deg, var(--background) 0%, var(--sidebar-bg) 100%);
          color: var(--foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
        }

        .picker-shell {
          width: 100%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .picker-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          box-shadow: var(--shadow-sm);
        }

        .picker-title {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 4px;
          color: var(--foreground);
        }

        .picker-subtitle {
          font-size: 13px;
          color: var(--foreground-muted);
          margin: 0;
        }

        .browse-btn {
          width: 100%;
          padding: 14px 24px;
          border-radius: 10px;
          border: none;
          background: var(--accent-primary);
          color: var(--surface);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
          font-family: inherit;
        }

        .browse-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .browse-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
          background: var(--accent-primary-hover);
        }

        .error-msg {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid var(--accent-red);
          background: var(--accent-red-12);
          color: var(--accent-red);
          font-size: 12px;
          margin-top: 8px;
        }

        .section-title {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--foreground-subtle);
          margin-bottom: 8px;
        }

        .recent-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .recent-item {
          display: flex;
          flex-direction: column;
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          border: none;
          background: none;
          text-align: left;
          font-family: inherit;
          transition: background 0.1s;
        }

        .recent-item:hover {
          background: var(--overlay-10);
        }

        .recent-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--foreground);
        }

        .recent-path {
          font-size: 11px;
          color: var(--foreground-subtle);
          word-break: break-all;
          margin-top: 2px;
        }
      `}</style>

      <div className="picker-shell">
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <h1 className="picker-title">Open Workspace</h1>
          <p className="picker-subtitle">Choose a folder to use as your workspace</p>
        </div>

        <div className="picker-card">
          <button
            className="browse-btn"
            onClick={handleBrowse}
            disabled={isOpening}
          >
            {isOpening ? 'Opening...' : 'Browse for Folder'}
          </button>

          {error && <div className="error-msg">{error}</div>}
        </div>

        {recentProjects.length > 0 && (
          <div className="picker-card">
            <div className="section-title">Recent</div>
            <div className="recent-list">
              {recentProjects.slice(0, 5).map((project) => (
                <button
                  key={project.projectPath}
                  className="recent-item"
                  onClick={() => handleOpenRecent(project.projectPath)}
                  disabled={isOpening}
                >
                  <span className="recent-name">{project.projectName}</span>
                  <span className="recent-path">{project.projectPath}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
