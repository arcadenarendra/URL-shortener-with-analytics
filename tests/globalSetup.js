import { MongoMemoryServer } from 'mongodb-memory-server';

// Boot a throwaway MongoDB for the suite and hand the URI to the test workers
// via an env var. Faster and more reliable than depending on a local mongod.
export default async function globalSetup() {
  const mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  process.env.MONGO_TEST_URI = mongod.getUri('url_shortener_test');
  // Keep the handle for teardown; workers only ever see the env var.
  globalThis.__MONGO_SERVER_INSTANCE__ = mongod;
}
