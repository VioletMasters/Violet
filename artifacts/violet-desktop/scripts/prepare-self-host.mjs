import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(desktop, '../..');
const archive = resolve(desktop, 'src-tauri/resources/violet-self-host.zip');

mkdirSync(dirname(archive), { recursive: true });
// git archive is deterministic for a given commit and only includes tracked files.
execFileSync('git', ['-C', repository, 'archive', '--format=zip', '--output', archive, 'HEAD'], {
  stdio: 'inherit',
});