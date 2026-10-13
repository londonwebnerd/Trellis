#!/usr/bin/env node
/**
 * Set (or change) the admin password.
 *
 *   npm run set-password            # prompts for the password
 *   npm run set-password -- secret  # non-interactive (avoid: ends up in shell history)
 *
 * The password is hashed with scrypt and saved to DATA_DIR/auth.json.
 * Restarting the server is not required. Changing the password signs out
 * every logged-in browser.
 */
import readline from 'node:readline';
import { setPassword } from '../src/lib/auth.js';
import { config } from '../src/config.js';

/** Prompt without echoing the typed characters. */
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(s);
      else if (!/[\r\n]/.test(s)) rl.output.write('*');
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const fromArg = process.argv[2];
const password = fromArg ?? (await promptHidden('New admin password: '));

if (!password || password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
if (!fromArg) {
  const confirm = await promptHidden('Repeat password: ');
  if (confirm !== password) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
}

try {
  setPassword(password);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
console.log(`Admin password saved to ${config.dataDir}/auth.json`);
console.log('Every device that was logged in to the editor has been signed out.');
