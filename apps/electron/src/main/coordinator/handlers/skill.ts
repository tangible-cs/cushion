import fs from 'node:fs/promises';
import path from 'node:path';
import { getOpenCodeConfigDir } from '../opencode-config';

export async function handleSkillInstallZip(
  params: { skillName: string; files: Array<{ path: string; content: string }> },
): Promise<{ success: boolean }> {
  if (!params.skillName || /[/\\]|\.\./.test(params.skillName)) {
    throw new Error('Invalid skill name');
  }

  const skillsDir = path.join(getOpenCodeConfigDir(), 'skills', params.skillName);
  await fs.mkdir(skillsDir, { recursive: true });

  for (const file of params.files) {
    const filePath = path.resolve(skillsDir, file.path);
    if (!filePath.startsWith(skillsDir + path.sep) && filePath !== skillsDir) {
      throw new Error(`Path traversal detected: ${file.path}`);
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(file.content, 'base64'));
  }

  return { success: true };
}
