/**
 * Search-engine and AI-crawler controls.
 *
 * Two independent page settings (Settings → Privacy in the editor):
 *   - noindex: ask all search engines not to index or archive the page
 *   - blockAI: opt out of AI crawlers/assistants
 *
 * They're enforced in three layers, because each crawler honours different
 * signals:
 *   1. /robots.txt (generated on the fly)
 *   2. <meta name="robots"> in the HTML and an X-Robots-Tag header on every
 *      response (so uploaded images are covered too)
 *   3. with blockAI, requests whose User-Agent matches a known AI crawler,
 *      or that carry an agent signature (Web Bot Auth), get a 403, for bots
 *      that ignore robots.txt but identify themselves.
 *
 * Nothing can stop a scraper that lies about its User-Agent, but this covers
 * all the major, well-behaved ones.
 */

/**
 * Known AI crawler / assistant user agents and robots.txt tokens.
 * Some (Google-Extended, Applebot-Extended) are robots.txt-only tokens that
 * control AI training use without blocking the normal search crawler.
 * Based on the community list at github.com/ai-robots-txt/ai.robots.txt
 * (October 2026), minus tokens too generic to match safely in a
 * User-Agent ("Code", "Cursor", "Spider", "Operator"…) and search crawlers
 * (Applebot, PetalBot, Bravebot), which are in SEARCH_BOTS. Add new ones here
 * as they appear.
 */
export const AI_BOTS = [
  // OpenAI
  'GPTBot', 'ChatGPT-User', 'ChatGPT Agent', 'OAI-SearchBot',
  // Anthropic
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'Claude-Web', 'Claude-Code', 'anthropic-ai',
  // Google (Google-Extended / GoogleOther are robots.txt tokens for AI use)
  'Google-Extended', 'GoogleOther', 'Google-CloudVertexBot', 'CloudVertexBot', 'Google-Agent', 'GoogleAgent-Mariner',
  'GoogleAgent-URLContext', 'Gemini-Deep-Research', 'Google-Gemini-CLI', 'Google-NotebookLM', 'NotebookLM', 'Google-Firebase',
  // Apple, Amazon, Meta, Microsoft
  'Applebot-Extended', 'Amazonbot', 'AmazonBuyForMe', 'Amzn-SearchBot', 'Amzn-User', 'amazon-kendra', 'amazon-QBusiness',
  'NovaAct', 'bedrockbot', 'meta-externalagent', 'meta-externalfetcher', 'meta-webindexer', 'FacebookBot', 'AzureAI-SearchBot',
  // Assistants, answer engines and agents
  'PerplexityBot', 'Perplexity-User', 'MistralAI-User', 'DuckAssistBot', 'YouBot', 'PhindBot', 'kagi-fetcher', 'Kimi-User',
  'Manus-User', 'Devin', 'DeepSeekBot', 'ChatGLM-Spider', 'TongyiBot', 'YiyanBot', 'PanguBot', 'Bytespider', 'TikTokSpider',
  'iaskspider', 'iAskBot', 'LinerBot', 'TavilyBot', 'ExaBot', 'ExaSearchBot', 'LinkupBot', 'QuillBot', 'Shap-User', 'ShapBot',
  'TwinAgent', 'Mozilla-Tabstack', 'Lightpanda', 'Cloudflare-AutoRAG', 'YandexAdditional', 'Poggio-Citations',
  // Dataset builders and AI scrapers
  'CCBot', 'cohere-ai', 'cohere-training-data-crawler', 'AI2Bot', 'Ai2Bot-Dolma', 'Diffbot', 'ImagesiftBot', 'img2dataset',
  'LAIONDownloader', 'laion-huggingface-processor', 'Omgilibot', 'omgili', 'Webzio-Extended', 'Timpibot', 'FirecrawlAgent',
  'Crawl4AI', 'ApifyBot', 'ApifyWebsiteContentCrawler', 'Scrapy', 'Cotoyogi', 'Kangaroo Bot', 'Brightbot', 'QualifiedBot',
  'ICC-Crawler', 'SBIntuitionsBot', 'Panscient', 'VelenPublicWebCrawler', 'wpbot', 'Andibot', 'bigsur.ai', 'Anomura',
  'aiHitBot', 'AIWebIndex', 'Channel3Bot', 'CragCrawler', 'Crawlspace', 'Echobot Bot', 'EchoboxBot', 'FriendlyCrawler',
  'imageSpider', 'KlaviyoAIBot', 'KunatoCrawler', 'Linguee Bot', 'NagetBot', 'newsai', 'Reflectionbot', 'Thinkbot',
  'WARDBot', 'WRTNBot', 'ZanistaBot', 'SemrushBot-OCOB', 'SemrushBot-SWA', 'Sidetrade indexer bot', 'atlassian-bot',
];

/**
 * Agents that browse with an ordinary browser User-Agent but sign their
 * requests (Web Bot Auth, RFC 9421 message signatures), such as ChatGPT
 * agent ("Signature-Agent: https://chatgpt.com"). A person's browser never
 * sends these headers.
 */
const SIGNED_AGENT_HEADERS = ['signature-agent'];

/**
 * Bot hints outside the User-Agent: a signed agent ('ai'), or a headless
 * browser announced in the client hints ('crawler').
 * @param {Record<string, string | string[] | undefined>} [headers] request headers (lower-case names)
 * @returns {null | 'ai' | 'crawler'}
 */
export function headerHints(headers = {}) {
  if (SIGNED_AGENT_HEADERS.some((h) => headers[h])) return 'ai';
  const hints = String(headers['sec-ch-ua'] || '');
  if (/headless/i.test(hints)) return 'crawler';
  return null;
}

/** Search engines (any of these indexes pages for search results). */
export const SEARCH_BOTS = [
  'Googlebot', 'Google-InspectionTool', 'Storebot-Google', 'AdsBot-Google', 'Mediapartners-Google', 'APIs-Google',
  'bingbot', 'BingPreview', 'msnbot', 'adidxbot', 'Slurp', 'DuckDuckBot', 'DuckDuckGo-Favicons-Bot', 'Baiduspider',
  'YandexBot', 'YandexImages', 'Yandex', 'Sogou', 'Exabot', 'SeznamBot', 'Qwantbot', 'Qwantify', 'Applebot',
  'PetalBot', 'MojeekBot', 'Yeti', 'coccocbot', 'Bravebot', 'Ecosia',
];

/** SEO tools and web archives (they copy and publish page data). */
export const SEO_AND_ARCHIVE_BOTS = [
  'AhrefsBot', 'AhrefsSiteAudit', 'SemrushBot', 'MJ12bot', 'DotBot', 'rogerbot', 'BLEXBot', 'DataForSeoBot',
  'serpstatbot', 'Screaming Frog', 'SiteAuditBot', 'Barkrowler', 'ia_archiver', 'archive.org_bot', 'Wayback',
  'heritrix', 'Seekport', 'ZoominfoBot',
];

/** Link-preview fetchers used by chat apps and social networks. */
export const PREVIEW_BOTS = [
  'facebookexternalhit', 'Facebot', 'Twitterbot', 'Slackbot', 'Slack-ImgProxy', 'LinkedInBot', 'WhatsApp',
  'TelegramBot', 'Discordbot', 'SkypeUriPreview', 'redditbot', 'Pinterestbot', 'Embedly', 'Iframely', 'vkShare',
  'Mastodon', 'Bluesky Cardyb', 'SignalBot', 'Snapchat', 'iframely',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const listRe = (list) => new RegExp(list.map(escapeRe).join('|'), 'i');

const AI_UA_RE = listRe(AI_BOTS);
const SEARCH_UA_RE = listRe([...SEARCH_BOTS, ...SEO_AND_ARCHIVE_BOTS]);
const PREVIEW_UA_RE = listRe(PREVIEW_BOTS);

/**
 * Catch-all for crawlers and scripts not listed above: anything describing
 * itself as a bot/crawler/spider, carrying a "+http…" info URL (a crawler
 * convention), headless browsers and common HTTP libraries.
 * ("Cubot" is an Android phone brand, not a bot.)
 */
const GENERIC_BOT_RE =
  /(?<!cu)bot\b|crawl|spider|slurp|scrap|archiv|\+https?:|headless|phantomjs|python|curl\/|wget|go-http-client|okhttp|java\/|libwww|axios\/|node-fetch|undici|httpx|aiohttp|guzzle|ruby|perl/i;

/** True if the User-Agent belongs to a known AI crawler. */
export const isAiBot = (userAgent = '') => AI_UA_RE.test(userAgent);

/**
 * Decide whether to refuse a request based on its User-Agent.
 *
 *  - "Block AI": known AI crawlers are refused.
 *  - "Hide from search engines": every crawler is refused — search engines,
 *    SEO tools, archives, AI bots, scripts and unknown bots — plus link-preview
 *    fetchers unless "allow link previews" is on. Requests without a
 *    User-Agent (almost always scripts) are refused too.
 *
 * @param {string | undefined} userAgent
 * @param {{ noindex: boolean, blockAI: boolean, allowPreviews: boolean }} settings
 * @param {Record<string, string | string[] | undefined>} [headers] request headers, for signed agents
 *   and headless browsers (see headerHints)
 * @returns {null | 'ai' | 'crawler' | 'preview'} why it's blocked, or null
 */
export function blockReason(userAgent, { noindex, blockAI, allowPreviews }, headers = {}) {
  const ua = userAgent || '';
  const hint = headerHints(headers);
  if ((blockAI || noindex) && (AI_UA_RE.test(ua) || hint === 'ai')) return 'ai';
  if (!noindex) return null;
  if (PREVIEW_UA_RE.test(ua)) return allowPreviews ? null : 'preview';
  if (!ua.trim() || SEARCH_UA_RE.test(ua) || GENERIC_BOT_RE.test(ua) || hint) return 'crawler';
  return null;
}

/**
 * Build robots.txt for the current settings.
 * @param {{ noindex: boolean, blockAI: boolean }} settings
 */
export function robotsTxt({ noindex, blockAI }) {
  const lines = ['# Generated by Trellis — change in the editor: Settings → Privacy', ''];
  if (blockAI || noindex) {
    for (const bot of AI_BOTS) lines.push(`User-agent: ${bot}`);
    lines.push('Disallow: /', '');
  }
  if (noindex) {
    // SEO tools and web archives: don't fetch, don't keep copies.
    for (const bot of SEO_AND_ARCHIVE_BOTS) lines.push(`User-agent: ${bot}`);
    lines.push('Disallow: /', '');
    // Search engines are deliberately NOT disallowed: a URL blocked here can
    // still be listed (bare, from links on other sites), because the engine
    // never fetches it and never sees "noindex". Allowed to ask, they get a
    // 403 with "X-Robots-Tag: noindex", and Google and Bing drop 4xx URLs
    // from their index (and remove ones already in it).
    lines.push('# Search engines may request pages here: every page answers them with');
    lines.push('# 403 Forbidden and "noindex", which keeps the site out of search results.');
  }
  lines.push('User-agent: *');
  // The editor's secret path is deliberately NOT listed here: robots.txt is
  // public, and listing it would reveal it. It's protected by headers instead.
  lines.push(noindex ? 'Disallow:' : 'Disallow: /api/');
  return `${lines.join('\n')}\n`;
}

/** Strongest "do not index" directive set, for the editor and hidden pages. */
export const NOINDEX_ALL =
  'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, max-snippet:0, max-image-preview:none, max-video-preview:0, noai, noimageai';

/**
 * Value for <meta name="robots"> / X-Robots-Tag, or null for "index normally".
 * "noai"/"noimageai" are de-facto opt-out directives some AI crawlers honour.
 */
export function robotsDirectives({ noindex, blockAI }, { isAdmin = false } = {}) {
  if (noindex || isAdmin) return NOINDEX_ALL;
  if (blockAI) return 'noai, noimageai';
  return null;
}

/**
 * True for anything that isn't a person's browser: every crawler, link
 * preview fetcher, AI bot or script we know of (used to keep statistics
 * human-only).
 */
export const isBot = (userAgent, headers = {}) => blockReason(userAgent, { noindex: true, blockAI: true, allowPreviews: false }, headers) !== null;
