import { useRef, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useEditorPanelContext } from './EditorPanelContext';

function toMonacoLanguage(lang: string | undefined): string {
  if (!lang) return 'plaintext';
  const map: Record<string, string> = {
    typescriptreact: 'typescript',
    javascriptreact: 'javascript',
  };
  return map[lang] ?? lang;
}

interface MonacoEditorProps {
  filePath: string;
}

export default function MonacoEditor({ filePath }: MonacoEditorProps) {
  const content = useWorkspaceStore((s) => s.openFiles.get(filePath)?.content ?? '');
  const language = useWorkspaceStore((s) => s.openFiles.get(filePath)?.language);
  const resolvedTheme = useAppearanceStore((s) => s.resolvedTheme);
  const { handleChange, handleSave } = useEditorPanelContext();

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const model = ed.getModel();
    if (!model) return;
    if (model.getValue() !== content) {
      model.setValue(content);
    }
  }, [content]);

  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs';

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave(filePath);
    });
  };

  return (
    <Editor
      height="100%"
      language={toMonacoLanguage(language)}
      value={content}
      theme={monacoTheme}
      onChange={(value) => handleChange(filePath, value ?? '')}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        padding: { top: 16 },
        fontSize: 14,
        fontFamily: 'var(--md-code-font-family)',
        lineNumbersMinChars: 3,
        renderLineHighlight: 'line',
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        bracketPairColorization: { enabled: true },
        automaticLayout: true,
      }}
    />
  );
}
