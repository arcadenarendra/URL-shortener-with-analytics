import { UAParser } from 'ua-parser-js';

// A regex set rather than a maintained list: cheap to update, and false positives
// only affect analytics bucketing, never correctness of the redirect.
const BOT_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /slurp/i, /curl/i, /wget/i, /python-requests/i,
  /headless/i, /phantomjs/i, /puppeteer/i, /playwright/i, /scrapy/i, /httpclient/i,
  /okhttp/i, /axios/i, /node-fetch/i, /go-http-client/i, /java/i, /libwww/i,
  /facebookexternalhit/i, /whatsapp/i, /telegrambot/i, /discordbot/i, /embedly/i,
  /quora link preview/i, /vkshare/i, /pinterest/i, /bitlybot/i, /tumblr/i,
  /iframely/i, /applebot/i, /bingpreview/i, /chrome-lighthouse/i, /gtmetrix/i,
  /ahrefs/i, /semrush/i, /mj12/i, /dotbot/i, /petalbot/i, /yandex/i, /baidu/i,
];

export function isBot(userAgent) {
  if (!userAgent) return true; // no UA at all is almost certainly a script
  return BOT_PATTERNS.some((re) => re.test(userAgent));
}

function classifyDevice(type) {
  switch (type) {
    case 'mobile':
      return 'mobile';
    case 'tablet':
      return 'tablet';
    case 'desktop':
      return 'desktop';
    default:
      return 'other';
  }
}

/**
 * Reduce a raw User-Agent header to the few fields analytics actually needs.
 * Returns nulls rather than empty strings so Mongo indexes stay dense.
 */
export function parseUserAgent(userAgent) {
  if (!userAgent) {
    return { device: 'other', browser: null, os: null, isBot: true };
  }
  const { device, browser, os } = new UAParser(userAgent).getResult();
  return {
    device: classifyDevice(device.type),
    browser: browser.name || null,
    os: os.name || null,
    isBot: isBot(userAgent),
  };
}
