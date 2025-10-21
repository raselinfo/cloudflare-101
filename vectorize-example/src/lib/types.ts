/**
 * Type definitions for document vectorization system
 */

// Cloudflare Worker Bindings
export type Bindings = {
  AI: Ai;
  DOCUMENT_INDEX: VectorizeIndex;
  VECTORIZE_QUEUE: Queue<QueueMessage>;
};

// Document submitted by user
export type Document = {
  id: string;
  title: string;
  author?: string;
  text: string;
  metadata?: Record<string, string | number | boolean>;
};

// Text chunk created from document
export type TextChunk = {
  text: string;
  startOffset: number;
  endOffset: number;
};

// Message sent to queue for processing
export type QueueMessage = {
  docId: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  metadata: {
    title: string;
    author?: string;
    [key: string]: any;
  };
};

// Embedding result from Workers AI
export type EmbeddingResult = {
  shape: number[];
  data: number[][];
};

// Vector to insert into Vectorize
export type VectorRecord = {
  id: string;
  values: number[];
  metadata?: Record<string, any>;
};

// Search result from Vectorize
export type SearchMatch = {
  id: string;
  score: number;
  metadata?: {
    docId: string;
    title: string;
    author?: string;
    chunkIndex: number;
    text: string;
    [key: string]: any;
  };
};

// Grouped search results by document
export type DocumentSearchResult = {
  docId: string;
  title: string;
  author?: string;
  chunks: Array<{
    chunkIndex: number;
    score: number;
    text: string;
  }>;
  maxScore: number;
};
