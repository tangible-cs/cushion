'use client';

import { EditorSettings } from './EditorSettings';
import { FilesSettings } from './FilesSettings';
import { OpenCodeSettings } from './OpenCodeSettings';

export function ConfigSettings() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
      <EditorSettings embedded />
      <FilesSettings embedded />
      <OpenCodeSettings embedded />
    </div>
  );
}
