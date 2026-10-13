/**
 * Small file helpers shared by the data stores.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Write a file atomically: write a temporary file next to it, then rename it
 * over the target. A crash mid-write never leaves a truncated file, and the
 * file mode is applied every time (not only when the file is created).
 *
 * @param {string} file
 * @param {string | Buffer} data
 * @param {number} [mode] e.g. 0o600 for secrets
 */
export function writeFileAtomicSync(file, data, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, data, { mode });
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/* ------------------------------ Shutdown ------------------------------- */

const shutdownTasks = [];
let shutdownHooked = false;

/**
 * Run `fn` when the server stops (SIGTERM from systemd/Docker, Ctrl+C, or a
 * normal exit): for stores that save in batches. All tasks run, then the
 * process exits.
 */
export function onShutdown(fn) {
  shutdownTasks.push(fn);
  if (shutdownHooked) return;
  shutdownHooked = true;
  const runAll = () => {
    for (const task of shutdownTasks.splice(0)) {
      try {
        task();
      } catch (err) {
        console.error(`[shutdown] ${err.message}`);
      }
    }
  };
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      runAll();
      process.exit(0);
    });
  }
  process.once('beforeExit', runAll);
}
