/**
 * Queue consumer service
 * Handles processing of queued document chunks
 */

import type {
  QueueMessage,
  EmbeddingResult,
  VectorRecord,
  Bindings,
} from "../lib/types";
import { EMBEDDING_MODEL } from "./search.service";

/**
 * Process a batch of queue messages
 * Generates embeddings and inserts into Vectorize index
 */
export async function processQueueBatch(
  batch: MessageBatch<QueueMessage>,
  env: Bindings
): Promise<void> {
  console.log(`Processing batch of ${batch.messages.length} messages`);

  // Collect all text chunks for batch embedding generation
  const textChunks: string[] = [];
  const messageData: QueueMessage[] = [];

  for (const message of batch.messages) {
    textChunks.push(message.body.text);
    messageData.push(message.body);
  }

  try {
    // Generate embeddings for all chunks in batch (more efficient)
    const embeddingResult = (await env.AI.run(EMBEDDING_MODEL, {
      text: textChunks,
    })) as EmbeddingResult;

    if (
      !embeddingResult.data ||
      embeddingResult.data.length !== textChunks.length
    ) {
      throw new Error(
        `Embedding generation failed: expected ${textChunks.length} embeddings, got ${embeddingResult.data?.length || 0}`
      );
    }

    // Prepare vectors for insertion
    const vectors: VectorRecord[] = embeddingResult.data.map(
      (embedding, index) => {
        const msg = messageData[index];
        return {
          id: `${msg.docId}-chunk-${msg.chunkIndex}`,
          values: embedding,
          metadata: {
            docId: msg.docId,
            chunkIndex: msg.chunkIndex,
            totalChunks: msg.totalChunks,
            text: msg.text.substring(0, 500), // Store first 500 chars for preview
            ...msg.metadata,
          },
        };
      }
    );

    // Insert vectors into Vectorize index
    const inserted = await env.DOCUMENT_INDEX.insert(vectors);
    console.log(`Successfully inserted ${inserted.count} vectors`);

    // Acknowledge all messages
    for (const message of batch.messages) {
      message.ack();
    }
  } catch (error) {
    console.error("Error processing queue batch:", error);

    // Retry messages (they'll go to DLQ after max retries)
    for (const message of batch.messages) {
      message.retry();
    }

    throw error;
  }
}
