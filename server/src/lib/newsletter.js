/**
 * Newsletter sign-ups: the newsletter card sends the visitor's email address
 * to the service you connected in Settings → Integrations. Trellis keeps no
 * list of its own, so unsubscribes, double opt-in and GDPR records are all
 * handled by the service.
 *
 *   buttondown  API key                       POST api.buttondown.com/v1/subscribers
 *   mailchimp   API key (ends in -usXX) +     POST <dc>.api.mailchimp.com/3.0/lists/<id>/members
 *               audience (list) id             (status "pending": Mailchimp emails a confirmation)
 *   kit         API key (v4) + form id        POST api.kit.com/v4/subscribers, then /v4/forms/<id>/subscribers
 *   mailerlite  API token + optional group id POST connect.mailerlite.com/api/subscribers
 *
 * All requests go through safeFetch (https only, public addresses only).
 */
import { getNewsletterConfig, saveNewsletterConfig } from './integrations.js';
import { safeFetch } from './safeFetch.js';

export const PROVIDERS = ['buttondown', 'mailchimp', 'kit', 'mailerlite'];
const NAMES = { buttondown: 'Buttondown', mailchimp: 'Mailchimp', kit: 'Kit', mailerlite: 'MailerLite' };

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function mailchimpBase(apiKey) {
  const dc = apiKey.match(/-([a-z]{2,4}\d{1,3})$/)?.[1];
  if (!dc) throw fail('A Mailchimp API key ends in a data-centre code like “-us21”.');
  return `https://${dc}.api.mailchimp.com/3.0`;
}

/** Headers and request details for each provider. */
function request(cfg, method, path, body, extraHeaders = {}) {
  const json = body === undefined ? undefined : JSON.stringify(body);
  const headers = { Accept: 'application/json', 'User-Agent': 'Trellis (self-hosted link-in-bio)', ...(json && { 'Content-Type': 'application/json' }), ...extraHeaders };
  let url;
  switch (cfg.provider) {
    case 'buttondown':
      url = `https://api.buttondown.com/v1${path}`;
      headers.Authorization = `Token ${cfg.apiKey}`;
      break;
    case 'mailchimp':
      url = `${mailchimpBase(cfg.apiKey)}${path}`;
      headers.Authorization = `Basic ${Buffer.from(`trellis:${cfg.apiKey}`).toString('base64')}`;
      break;
    case 'kit':
      url = `https://api.kit.com/v4${path}`;
      headers['X-Kit-Api-Key'] = cfg.apiKey;
      break;
    case 'mailerlite':
      url = `https://connect.mailerlite.com/api${path}`;
      headers.Authorization = `Bearer ${cfg.apiKey}`;
      break;
    default:
      throw fail('Unknown newsletter service');
  }
  return safeFetch(url, { method, body: json, headers, timeoutMs: 10_000, maxBytes: 200_000 });
}

const errorText = (res) => {
  try {
    const b = JSON.parse(res.body);
    return b.detail || b.message || b.title || b.error || (Array.isArray(b.errors) ? b.errors.join(', ') : '') || `error ${res.status}`;
  } catch {
    return `error ${res.status}`;
  }
};

/**
 * Check the details against the service, then store them.
 * @param {{ provider: string, apiKey: string, listId?: string }} input
 */
export async function connectNewsletter(input = {}) {
  const provider = PROVIDERS.includes(input.provider) ? input.provider : null;
  if (!provider) throw fail('Choose a newsletter service.');
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (apiKey.length < 8 || apiKey.length > 300 || /\s/.test(apiKey)) throw fail('That doesn’t look like an API key.');
  const listId = typeof input.listId === 'string' ? input.listId.trim().slice(0, 64) : '';
  if (listId && !/^[\w-]+$/.test(listId)) throw fail('The list / form id can only contain letters, numbers, - and _.');
  if ((provider === 'mailchimp' || provider === 'kit') && !listId) throw fail(provider === 'mailchimp' ? 'Mailchimp needs the audience id.' : 'Kit needs the form id.');
  const cfg = { provider, apiKey, listId };

  const checkPath = {
    buttondown: '/subscribers?page=1',
    mailchimp: `/lists/${encodeURIComponent(listId)}`,
    kit: '/account',
    mailerlite: listId ? `/groups/${encodeURIComponent(listId)}` : '/subscribers?limit=1',
  }[provider];
  let res;
  try {
    res = await request(cfg, 'GET', checkPath);
  } catch (err) {
    throw fail(`Couldn’t reach ${NAMES[provider]}: ${err.message}`, 502);
  }
  if (res.status === 401 || res.status === 403) throw fail(`${NAMES[provider]} didn’t accept that API key.`);
  if (res.status === 404) throw fail(`${NAMES[provider]} doesn’t know that ${provider === 'mailchimp' ? 'audience' : 'group'} id.`);
  if (!res.ok) throw fail(`${NAMES[provider]}: ${errorText(res)}`, 502);
  return saveNewsletterConfig(cfg);
}

/**
 * Add a subscriber. Resolves when the service accepted the address (or
 * already had it); rejects with a visitor-safe message otherwise.
 * @param {string} email already validated
 * @param {{ referrer?: string }} [meta]
 */
export async function subscribe(email, { referrer = '' } = {}) {
  const cfg = getNewsletterConfig();
  if (!cfg) throw fail('Sign-ups aren’t set up yet.', 503);
  let res;
  try {
    switch (cfg.provider) {
      case 'buttondown':
        // "add": someone already on the list just counts as a success
        // (without it Buttondown answers 400 for existing subscribers).
        res = await request(cfg, 'POST', '/subscribers', { email_address: email }, { 'X-Buttondown-Collision-Behavior': 'add' });
        break;
      case 'mailchimp':
        res = await request(cfg, 'POST', `/lists/${encodeURIComponent(cfg.listId)}/members`, { email_address: email, status: 'pending' });
        if (res.status === 400 && /member exists/i.test(res.body)) return;
        break;
      case 'kit':
        res = await request(cfg, 'POST', '/subscribers', { email_address: email });
        if (res.ok) res = await request(cfg, 'POST', `/forms/${encodeURIComponent(cfg.listId)}/subscribers`, { email_address: email, referrer: referrer || null });
        break;
      case 'mailerlite':
        res = await request(cfg, 'POST', '/subscribers', { email, ...(cfg.listId && { groups: [cfg.listId] }) });
        break;
      default:
        throw fail('Sign-ups aren’t set up yet.', 503);
    }
  } catch (err) {
    if (err.status) throw err;
    console.warn(`[newsletter] ${cfg.provider} unreachable: ${err.message}`);
    throw fail('The newsletter service didn’t answer. Please try again later.', 502);
  }
  if (res.ok) return;
  console.warn(`[newsletter] ${cfg.provider} refused a sign-up: ${res.status} ${errorText(res)}`);
  if (res.status === 400 || res.status === 422) throw fail('That email address was not accepted.');
  throw fail('Sign-up failed. Please try again later.', 502);
}
