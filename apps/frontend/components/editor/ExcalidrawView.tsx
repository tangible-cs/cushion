import { useState, useRef, useCallback, useEffect } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { useAppearanceStore } from '@/stores/appearanceStore';
import type { ViewProps } from '@/lib/view-registry';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

if (typeof window !== 'undefined') {
  (window as any).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
}

const DEFAULT_SCENE = {
  type: 'excalidraw' as const,
  version: 2,
  source: 'cushion',
  elements: [],
  appState: {},
  files: {},
};

// appState keys to strip before saving (volatile/session-only state)
const VOLATILE_APP_STATE_KEYS = new Set([
  'collaborators',
  'cursorButton',
  'selectedElementIds',
  'selectedGroupIds',
  'editingGroupId',
  'editingLinearElement',
  'editingElement',
  'draggingElement',
  'resizingElement',
  'selectionElement',
  'isResizing',
  'isRotating',
  'openMenu',
  'openPopup',
  'openSidebar',
  'lastPointerDownWith',
  'previousSelectedElementIds',
]);

export function ExcalidrawView({ filePath }: ViewProps) {
  const [initialData, setInitialData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInitialData(null);
    setError(null);

    getSharedCoordinatorClient()
      .then((client) => {
        if (cancelled) return;
        return client.readFile(filePath);
      })
      .then((result) => {
        if (cancelled || !result) return;
        const { content } = result;
        if (!content || !content.trim()) {
          setInitialData(DEFAULT_SCENE);
          return;
        }
        try {
          const parsed = JSON.parse(content);
          setInitialData(parsed);
        } catch {
          setInitialData(DEFAULT_SCENE);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(`Failed to load file: ${err.message}`);
      });

    return () => { cancelled = true; };
  }, [filePath]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        {error}
      </div>
    );
  }

  if (!initialData) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <ExcalidrawCanvas key={filePath} filePath={filePath} initialData={initialData} />;
}

interface ExcalidrawCanvasProps {
  filePath: string;
  initialData: Record<string, any>;
}

function ExcalidrawCanvas({ filePath, initialData }: ExcalidrawCanvasProps) {
  const resolvedTheme = useAppearanceStore((s) => s.resolvedTheme);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const elementsRef = useRef<any[]>(initialData.elements ?? []);
  const appStateRef = useRef<Record<string, any>>(initialData.appState ?? {});
  const filesRef = useRef<Record<string, any>>(initialData.files ?? {});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePathRef = useRef(filePath);
  // skip our own saves
  const lastSavedJsonRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  const buildJson = useCallback(() => {
    const cleanAppState: Record<string, any> = {};
    for (const [key, value] of Object.entries(appStateRef.current)) {
      if (!VOLATILE_APP_STATE_KEYS.has(key)) {
        cleanAppState[key] = value;
      }
    }
    return JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'cushion',
      elements: elementsRef.current,
      appState: cleanAppState,
      files: filesRef.current,
    }, null, 2);
  }, []);

  const flush = useCallback(async () => {
    const json = buildJson();
    try {
      const client = await getSharedCoordinatorClient();
      lastSavedJsonRef.current = json;
      await client.saveFile(filePathRef.current, json);
    } catch (err) {
      console.error('[ExcalidrawView] Save failed:', err);
    }
  }, [buildJson]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, 1000);
  }, [flush]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        flush();
      }
    };
  }, [flush]);

  // Watch for external file changes
  useEffect(() => {
    let unsubDisk: (() => void) | undefined;
    let unsubFiles: (() => void) | undefined;

    const reload = async () => {
      try {
        const client = await getSharedCoordinatorClient();
        const { content } = await client.readFile(filePathRef.current);
        if (!content?.trim()) return;

        // If it matches what we last saved, it's our own write — skip
        if (content === lastSavedJsonRef.current) return;

        const parsed = JSON.parse(content);
        const api = apiRef.current;
        if (api) {
          api.updateScene({ elements: parsed.elements ?? [] });
          elementsRef.current = parsed.elements ?? [];
          filesRef.current = parsed.files ?? {};
        }
      } catch {
        // File may have been deleted or is invalid JSON
      }
    };

    getSharedCoordinatorClient().then((client) => {
      unsubDisk = client.onFileChangedOnDisk((changedPath) => {
        if (changedPath !== filePath) return;
        reload();
      });

      unsubFiles = client.onFilesChanged((changes) => {
        if (!changes.some((c) => c.path === filePath)) return;
        reload();
      });
    });

    return () => { unsubDisk?.(); unsubFiles?.(); };
  }, [filePath]);

  const handleChange = useCallback(
    (elements: readonly any[], appState: Record<string, any>, files: any) => {
      elementsRef.current = elements as any[];
      appStateRef.current = appState;
      filesRef.current = files ?? {};

      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }

      scheduleSave();
    },
    [scheduleSave],
  );

  return (
    <div className="w-full h-full">
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api; }}
        initialData={{
          elements: initialData.elements,
          appState: initialData.appState,
          files: initialData.files,
        }}
        onChange={handleChange}
        theme={resolvedTheme}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            saveAsImage: false,
          },
        }}
      />
    </div>
  );
}
