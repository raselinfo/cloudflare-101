/**
 * Main application entry point
 * Configures routes and exports worker handlers
 */

import { Hono } from "hono";
import type { Bindings, QueueMessage } from "./lib/types";
import { EMBEDDING_MODEL } from "./services/search.service";
import { processQueueBatch } from "./services/queue.service";
import documentsRoute from "./routes/documents.route";
import searchRoute from "./routes/search.route";

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Health check endpoint
 */
app.get("/", (c) => {
  return c.json({
    status: "OK",
    message: "Document Vectorization API",
    endpoints: {
      submit: "POST /documents/submit",
      search: "POST /search",
    },
    configuration: {
      embeddingModel: EMBEDDING_MODEL,
      queueName: "vectorize-queue",
      vectorizeIndex: "document-vector-index",
    },
  });
});

// Mount routes
app.route("/documents", documentsRoute);
app.route("/search", searchRoute);

/**
 * Queue consumer handler
 * Processes chunks from the queue, generates embeddings, and inserts into Vectorize
 */
async function handleQueueBatch(
  batch: MessageBatch<QueueMessage>,
  env: Bindings
): Promise<void> {
  await processQueueBatch(batch, env);
}

// Export the worker
export default {
  fetch: app.fetch,
  queue: handleQueueBatch,
};
