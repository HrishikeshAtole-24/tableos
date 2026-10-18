// Runs the Python AI service from its virtualenv (Windows or POSIX). `test` runs pytest instead.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd());
const py = [join(dir, '.venv', 'Scripts', 'python.exe'), join(dir, '.venv', 'bin', 'python')].find(existsSync);
if (!py) {
  console.error('apps/ai/.venv not found. Run: python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt');
  process.exit(1);
}
const args = process.argv[2] === 'test' ? ['-m', 'pytest', '-q'] : ['-m', 'uvicorn', 'app.main:app', '--port', '8000', '--reload'];
spawn(py, args, { cwd: dir, stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0));
