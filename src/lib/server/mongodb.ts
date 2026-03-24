import { Db, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "oxford_nextjs";

declare global {
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_URI is not set.");
  }

  if (!global.__mongoClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
    });
    global.__mongoClientPromise = client.connect();
  }

  return global.__mongoClientPromise;
}

export async function getMongoDb(): Promise<Db | null> {
  if (!uri) {
    return null;
  }
  const client = await getClientPromise();
  return client.db(dbName);
}

