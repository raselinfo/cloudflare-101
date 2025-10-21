/**
 * Document processing service
 * Handles document submission, chunking, and queueing
 */

import { chunkText, analyzeDocumentsForChunking } from "../lib/chunking";
import type { Document, QueueMessage, Bindings } from "../lib/types";

export type SubmitDocumentsResult = {
  status: string;
  documentsSubmitted: number;
  chunksQueued: number;
  estimatedChunks: number;
  breakdown: Array<{ docId: string; chunkCount: number }>;
  message: string;
};

/**
 * Submit documents for vectorization
 * Chunks documents and sends them to the processing queue
 */
export async function submitDocuments(
  documents: Document[],
  queue: Queue<QueueMessage>
): Promise<SubmitDocumentsResult> {
  // Validate documents
  for (const doc of documents) {
    if (!doc.id || !doc.text || !doc.title) {
      throw new Error("Each document must have id, title, and text fields");
    }
  }

  // Analyze documents to estimate workload
  const analysis = analyzeDocumentsForChunking(documents);

  let totalChunksQueued = 0;

  // Process each document
  for (const doc of documents) {
    const chunks = chunkText(doc.text);

    // Queue each chunk for processing
    for (let i = 0; i < chunks.length; i++) {
      const message: QueueMessage = {
        docId: doc.id,
        chunkIndex: i,
        totalChunks: chunks.length,
        text: chunks[i].text,
        metadata: {
          title: doc.title,
          author: doc.author,
          ...doc.metadata,
        },
      };

      await queue.send(message);
      totalChunksQueued++;
    }
  }

  return {
    status: "queued",
    documentsSubmitted: documents.length,
    chunksQueued: totalChunksQueued,
    estimatedChunks: analysis.totalChunks,
    breakdown: analysis.documentsBreakdown,
    message:
      "Documents queued for vectorization. Processing will happen asynchronously.",
  };
}

/**
 * Validate document input from request body
 */
export function validateDocumentInput(body: any): Document[] {
  if (!body) {
    throw new Error("No documents provided");
  }

  const documents: Document[] = Array.isArray(body) ? body : [body];

  if (documents.length === 0) {
    throw new Error("No documents provided");
  }

  return documents;
}
