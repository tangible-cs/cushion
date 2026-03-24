import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, Search, Upload } from 'lucide-react';
import JSZip from 'jszip';
import { useChatStore } from '@/stores/chatStore';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { VisibilityToggle } from './CustomizeDialog';

type Skill = {
  name: string;
  description: string;
};

export function SkillsPanel() {
  const disabledSkills = useChatStore((s) => s.disabledSkills);
  const setSkillDisabled = useChatStore((s) => s.setSkillDisabled);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSkills = async () => {
    const state = useChatStore.getState();
    const client = state.client;
    const directory = state.directory;
    if (!client || !directory) {
      setSkills([]);
      setLoading(false);
      return;
    }
    try {
      const result = await client.app.skills({ directory });
      const data = result?.data;
      if (Array.isArray(data)) {
        setSkills(
          data.map((s: { name: string; description?: string }) => ({
            name: s.name,
            description: s.description ?? '',
          })),
        );
      }
    } catch {
      // Skills not available
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setLoading(true);
    await fetchSkills();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) => {
      const haystack = `${s.name} ${s.description}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [skills, searchQuery]);

  const enabledCount = skills.filter((s) => !disabledSkills.includes(s.name)).length;

  const handleZipFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setUploadError('Please select a .zip file');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.keys(zip.files);

      // Find SKILL.md at root or one level deep
      const skillMd = entries.find((e) => {
        const parts = e.split('/').filter(Boolean);
        const name = parts[parts.length - 1];
        return name === 'SKILL.md' && parts.length <= 2;
      });

      if (!skillMd) {
        setUploadError('ZIP must contain a SKILL.md at root or one level deep');
        setUploading(false);
        return;
      }

      // Read SKILL.md to extract name from frontmatter
      const skillMdContent = await zip.files[skillMd].async('string');
      const nameMatch = skillMdContent.match(/^---[\s\S]*?name:\s*(.+?)$/m);
      const skillName = nameMatch?.[1]?.trim().replace(/^["']|["']$/g, '');

      if (!skillName) {
        setUploadError('SKILL.md must have a name in its frontmatter');
        setUploading(false);
        return;
      }

      // Determine the prefix to strip (if SKILL.md is nested one level)
      const skillMdParts = skillMd.split('/').filter(Boolean);
      const prefix = skillMdParts.length > 1 ? skillMdParts[0] + '/' : '';

      // Extract all files
      const files: Array<{ path: string; content: string }> = [];
      for (const [entryPath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const relativePath = prefix ? entryPath.replace(prefix, '') : entryPath;
        if (!relativePath) continue;
        const content = await zipEntry.async('base64');
        files.push({ path: relativePath, content });
      }

      // Send to coordinator
      const coordinator = await getSharedCoordinatorClient();
      await coordinator.call('skill/install-zip', { skillName, files });

      // Refresh and close add zone
      setShowAddZone(false);
      await handleRefresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to process ZIP');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleZipFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleZipFile(file);
    e.target.value = '';
  };

  return (
    <>
      {/* Search + actions */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-md bg-surface px-2">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search skills"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full border-none bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
          {searchQuery.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="size-5 flex items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <Icon name="close" size="small" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAddZone(!showAddZone);
            setUploadError(null);
          }}
          className={cn(
            'size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] hover:text-foreground',
            showAddZone && 'bg-[var(--overlay-10)] text-foreground',
          )}
          title="Add skill"
          aria-label="Add skill"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] hover:text-foreground disabled:opacity-50"
          title="Refresh skills"
          aria-label="Refresh skills"
        >
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
        {/* Drop zone */}
        {showAddZone && (
          <div className="px-2 pb-2">
            <div
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors cursor-pointer',
                dragOver
                  ? 'border-[var(--accent-primary)] bg-[var(--overlay-10)]'
                  : 'border-border hover:border-muted-foreground',
                uploading && 'pointer-events-none opacity-60',
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-5 text-muted-foreground" />
              <span className="text-[13px] text-muted-foreground">
                {uploading ? 'Installing...' : 'Drop a skill ZIP here or click to browse'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
            {uploadError && (
              <p className="mt-1.5 text-[12px] text-[var(--error)]">{uploadError}</p>
            )}
          </div>
        )}

        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading skills...</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No skill results' : 'No skills available'}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((skill) => {
              const isDisabled = disabledSkills.includes(skill.name);
              const checked = !isDisabled;
              const label = `${checked ? 'Disable' : 'Enable'} ${skill.name}`;

              return (
                <div
                  key={skill.name}
                  className="flex w-full cursor-pointer items-center gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--overlay-10)]"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSkillDisabled(skill.name, !isDisabled)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    setSkillDisabled(skill.name, !isDisabled);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-foreground">{skill.name}</span>
                    {skill.description && (
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {skill.description}
                      </span>
                    )}
                  </div>
                  <div className="flex w-9 shrink-0 justify-end">
                    <VisibilityToggle
                      checked={checked}
                      label={label}
                      onChange={(next) => setSkillDisabled(skill.name, !next)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {!loading && skills.length > 0 && (
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          {enabledCount} of {skills.length} skills enabled
        </div>
      )}
    </>
  );
}
