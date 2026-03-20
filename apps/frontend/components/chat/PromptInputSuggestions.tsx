import { useCallback, useMemo, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { useChatStore } from '@/stores/chatStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  BUILTIN_COMMANDS,
  type TriggerState,
  type SuggestionItem,
} from './SuggestionList';
import { searchFiles } from '@/lib/wiki-link-resolver';

export function usePromptSuggestions() {
  const agents = useChatStore((state) => state.agents);
  const commands = useChatStore((state) => state.commands);
  const openFiles = useWorkspaceStore((state) => state.openFiles);
  const workspaceMetadata = useWorkspaceStore((state) => state.metadata);
  const fileTree = useWorkspaceStore((state) => state.fileTree);

  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const recentFiles = useMemo(() => {
    return Array.from(openFiles.keys()).map((key) => String(key).replace(/\\/g, '/'));
  }, [openFiles]);

  const agentSuggestions = useMemo(() => {
    return agents
      .filter((agent) => !agent.hidden && agent.mode !== 'primary')
      .map((agent) => ({
        id: `agent-${agent.name}`,
        label: `@${agent.name}`,
        value: `@${agent.name}`,
        description: agent.description,
        type: 'mention' as const,
        agent: agent.name,
        group: 'agent' as const,
      }));
  }, [agents]);

  const commandSuggestions = useMemo(() => {
    const builtinIds = new Set(BUILTIN_COMMANDS.map((item) => item.id));
    const dynamic = commands
      .filter((command) => !builtinIds.has(command.name))
      .map((command) => {
        const template = command.template?.trim() ?? '';
        const value = template ? `/${command.name} ${template}` : `/${command.name}`;
        return {
          id: `cmd-${command.name}`,
          label: `/${command.name}`,
          value,
          description: command.description,
          type: 'command' as const,
        };
      });
    return [...BUILTIN_COMMANDS, ...dynamic];
  }, [commands]);

  const suggestions = useMemo(() => {
    if (!trigger) return [];
    const query = trigger.query.toLowerCase();

    if (trigger.type === 'command') {
      return commandSuggestions.filter((item) => item.label.toLowerCase().includes(query));
    }

    // No query — show agents + recent files
    if (!query) {
      const recentSuggestions: SuggestionItem[] = recentFiles.map((path) => ({
        id: path,
        label: `@${path}`,
        value: `@${path}`,
        description: path,
        type: 'mention' as const,
        path,
        group: 'recent' as const,
      }));
      return [...agentSuggestions, ...recentSuggestions];
    }

    // With query — fuzzy-match agents, search files synchronously
    const agentResults = fuzzysort.go(query, agentSuggestions, {
      key: 'label',
      limit: 20,
    });

    const searchResults = workspaceMetadata && fileTree.length > 0
      ? searchFiles(query, fileTree, 20).map((p) => p.replace(/\\/g, '/'))
      : [];

    const seen = new Set<string>();
    const fileSuggestions: SuggestionItem[] = [];
    for (const path of searchResults) {
      if (seen.has(path)) continue;
      seen.add(path);
      fileSuggestions.push({
        id: `search-${path}`,
        label: `@${path}`,
        value: `@${path}`,
        description: path,
        type: 'mention' as const,
        path,
        group: 'search' as const,
      });
    }

    return [...agentResults.map((r) => r.obj), ...fileSuggestions];
  }, [trigger, agentSuggestions, recentFiles, commandSuggestions, workspaceMetadata, fileTree]);

  const setTriggerState = useCallback((next: TriggerState | null) => {
    setTrigger((prev) => {
      if (!next && !prev) return prev;
      if (next && prev && next.type === prev.type && next.query === prev.query && next.start === prev.start) {
        return prev;
      }
      setActiveIndex(0);
      return next;
    });
  }, []);

  const updateTrigger = useCallback((rawText: string, cursorPosition: number) => {
    if (rawText.startsWith('!')) {
      setTriggerState(null);
      return;
    }
    const before = rawText.substring(0, cursorPosition);
    const atMatch = before.match(/@(\S*)$/);
    if (atMatch) {
      setTriggerState({ type: 'mention', query: atMatch[1], start: cursorPosition - atMatch[0].length });
      return;
    }
    const slashMatch = rawText.match(/^\/(\S*)$/);
    if (slashMatch) {
      setTriggerState({ type: 'command', query: slashMatch[1], start: 0 });
      return;
    }
    setTriggerState(null);
  }, [setTriggerState]);

  return {
    trigger,
    activeIndex,
    setActiveIndex,
    suggestions,
    setTriggerState,
    updateTrigger,
  };
}
