import mongoose from "mongoose";

export async function connectToDatabase(uri) {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  await mongoose.connect(uri);
}

export async function disconnectFromDatabase() {
  await mongoose.disconnect();
}
