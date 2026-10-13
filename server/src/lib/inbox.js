/**
 * Contact-form messages, stored in DATA_DIR/inbox.json (mode 600) and read
 * in the editor (More → Inbox). The newest 1000 are kept.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { dataPath } from '../config.js';
import { writeFileAtomicSync } from './files.js';

const FILE = dataPath('inbox.json');
const MAX = 1000;

/** @type {{ id: string, at: string, tile: string, name: string, email: string, phone: string, message: string, read: boolean }[]} */
let messages = [];
try {
  const stored = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (Array.isArray(stored.messages)) messages = stored.messages;
} catch {
  /* first run */
}

const save = () => writeFileAtomicSync(FILE, JSON.stringify({ messages }), 0o600);

export function addMessage(msg) {
  const entry = { id: crypto.randomBytes(8).toString('hex'), at: new Date().toISOString(), read: false, ...msg };
  messages = [entry, ...messages].slice(0, MAX);
  save();
  return entry;
}

export const listMessages = () => ({ messages, unread: messages.filter((m) => !m.read).length });

export function markRead(id, read = true) {
  const m = messages.find((x) => x.id === id);
  if (!m) return false;
  m.read = read;
  save();
  return true;
}

export function deleteMessage(id) {
  const before = messages.length;
  messages = messages.filter((m) => m.id !== id);
  if (messages.length === before) return false;
  save();
  return true;
}

export function clearMessages() {
  messages = [];
  save();
}
