export default async function globalTeardown() {
  const mongod = globalThis.__MONGO_SERVER_INSTANCE__;
  if (mongod) await mongod.stop();
}
