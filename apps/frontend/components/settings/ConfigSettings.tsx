'use client';

import { FilesSettings } from './FilesSettings';

export function ConfigSettings() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
      <FilesSettings embedded />
    </div>
  );
}
