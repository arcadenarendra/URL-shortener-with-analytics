/**
 * Benchmark the redirect path, which is the number that goes in the README.
 *
 *   node scripts/loadtest.js --code aB3xY9z --duration 10
 *
 * Runs two passes over the same code: one cold (cache purged before the run,
 * so reads hit MongoDB) and one warm (every read served from Redis), then
 * prints a comparison table. The app must already be running.
 */
import autocannon from 'autocannon';
import { createRequire } from 'node:module';
import config from '../src/config/env.js';
import redis from '../src/config/redis.js';
import * as cache from '../src/services/cacheService.js';

const require = createRequire(import.meta.url);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const code = arg('code');
const duration = Number(arg('duration', 10));
const connections = Number(arg('connections', 100));
const baseUrl = arg('url', config.baseUrl);

if (!code) {
  console.error('Usage: node scripts/loadtest.js --code <shortCode> [--duration 10] [--connections 100] [--url http://localhost:3000]');
  process.exit(1);
}

const target = `${baseUrl}/${code}`;

async function purgeCache() {
  try {
    await cache.delUrl(code);
    await redis.connect().catch(() => {});
  } catch (err) {
    console.warn(`Could not reach Redis (${err.message}); the "cold" pass may not be cold.`);
  }
}

function run(label) {
  return new Promise((resolve, reject) => {
    console.log(`\n${label} -> ${target} (${duration}s, ${connections} connections)`);
    const instance = autocannon(
      {
        url: target,
        duration,
        connections,
        pipelining: 1,
        // Follow no redirects: we are measuring our own latency, not the target's.
        followRedirect: false,
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    autocannon.track(instance, { renderProgressBar: true });
  });
}

const row = (label, r) => ({
  scenario: label,
  'req/s': r.requests.average,
  'p50 (ms)': r.latency.p50,
  'p95 (ms)': r.latency.p95,
  'p99 (ms)': r.latency.p99,
  'non-2xx': r.non2xx + r.errors + r.timeouts,
});

const table = (rows) => {
  const cols = Object.keys(rows[0]);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(`\n${line(cols)}`);
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(cols.map((c) => r[c])));
  console.log('');
};

async function main() {
  console.log('URL shortener redirect benchmark');
  console.log('Note: p50/p95 here include autocannon client overhead and the redirect response itself.');
  console.log('Run the app on an otherwise idle machine for numbers worth quoting.');

  await purgeCache();
  const cold = await run('COLD  (cache purged, reads hit MongoDB)');

  // Warm the cache before the second pass so it is a genuine cache-hit run.
  await fetch(target, { redirect: 'manual' }).catch(() => {});
  const warm = await run('WARM  (Redis cache hot)');

  table([row('cold (no cache)', cold), row('warm (Redis)', warm)]);

  const speedup = cold.latency.p95 / warm.latency.p95;
  console.log(`p95 improvement with cache: ${speedup.toFixed(2)}x (${cold.latency.p95.toFixed(2)}ms -> ${warm.latency.p95.toFixed(2)}ms)`);
  console.log('\nPaste this table into the README benchmark section.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
