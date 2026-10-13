# Search engines and AI

There are two switches under **Settings > Privacy**. They take effect when you
publish, and you don't need to change anything in nginx.

## Hide from search engines and all crawlers

This keeps the page out of Google and every other search engine, and turns
away SEO tools, web archives, AI crawlers, link-preview fetchers, scripts like
`curl` or Python, headless browsers, and anything else that identifies itself
as a bot. People using a normal browser don't notice a thing.

Here's how it works:

- Every response, images included, carries a `noindex` header, and the page
  also has a `noindex` meta tag.
- Anything recognised as a crawler gets `403 Forbidden` instead of the page,
  so even crawlers that ignore robots.txt get nothing.
- `robots.txt` tells AI bots, SEO tools and archives to stay away.

You might notice that robots.txt doesn't tell search engines to stay away, and
that's deliberate. If it did, Google would never fetch the page, would never
see the `noindex`, and could still list your bare address when other sites
link to it ([Google says as much](https://developers.google.com/search/docs/crawling-indexing/block-indexing)).
Instead, search engines are allowed to ask and get the 403, and Google and
Bing don't index pages that answer 403 (and drop them if they had them).

If the page is already in search results, it disappears as the engines visit
again, usually within a few days or weeks. Google Search Console's Removals
tool is quicker.

Hiding the page also blocks the previews that WhatsApp, iMessage and Slack
show when someone shares your link, because those come from bots too. Tick
**Still allow link previews in chat apps** to let them through. It also
breaks Mastodon's link verification (the green tick), unless you allow
previews.

## Block AI crawlers and agents

This one leaves search engines alone and blocks AI: the bots that collect
training data, AI search, and assistants and agents that browse on
someone's behalf. That covers OpenAI, Anthropic, Google's AI crawlers and
agents (Gemini, NotebookLM), Apple's AI training, Amazon, Meta, Microsoft,
Perplexity, Mistral, DeepSeek, Common Crawl, ByteDance and about a hundred
others. The list is `AI_BOTS` in `server/src/lib/robots.js`, and it's based
on the community [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt)
list.

Some AI agents, such as ChatGPT agent, browse with an ordinary browser and
don't name themselves, but the reputable ones sign their requests
([Web Bot Auth](https://datatracker.ietf.org/doc/html/draft-meunier-web-bot-auth-architecture)).
Signed requests are turned away as well.

Hiding the page from all crawlers includes all of this.

## The editor

Whatever these switches are set to, the editor is never shown to a bot, is
never indexed or cached, and can't be framed by another site. Its address is
not in robots.txt either, because robots.txt is public.

## Limits

The big search engines and AI companies respect all of this. No website can
stop a scraper that pretends to be a normal browser, though, so if a page is
genuinely private, put a password in front of it in nginx.

Short links (`yoursite.com/cv`) still forward everyone, bots included, even
when the page is hidden. A redirect only gives away where it points, and it
means link previews of a short link show the destination.

## Checking it

```bash
curl -I -A "Mozilla/5.0 (compatible; Googlebot/2.1)" https://your-domain/   # 403 when hidden
curl -A "Mozilla/5.0" https://your-domain/robots.txt
```

With the page hidden, plain `curl` is refused too, so give it a browser-like
User-Agent with `-A` when you want to look at the page.
