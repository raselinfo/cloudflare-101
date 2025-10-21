/**
 * Search service
 * Handles semantic search operations using embeddings
 */

import type {
  EmbeddingResult,
  SearchMatch,
  DocumentSearchResult,
} from "../lib/types";

// Embedding model to use (Cloudflare Workers AI)
export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

export type SearchParams = {
  query: string;
  topK?: number;
  returnFullText?: boolean;
};

export type SearchResult = {
  query: string;
  totalResults: number;
  documentsFound: number;
  results: DocumentSearchResult[];
};

/**
 * Perform semantic search on vectorized documents
 */
export async function searchDocuments(
  params: SearchParams,
  ai: Ai,
  vectorIndex: VectorizeIndex
): Promise<SearchResult> {
  const { query, topK = 10, returnFullText = false } = params;

  if (!query || typeof query !== "string") {
    throw new Error("Query string is required");
  }

  // Generate embedding for the search query
  const queryEmbedding = (await ai.run(EMBEDDING_MODEL, {
    text: [query],
  })) as EmbeddingResult;

  if (!queryEmbedding.data || queryEmbedding.data.length === 0) {
    throw new Error("Failed to generate query embedding");
  }

  // Search the vector index
  const results = await vectorIndex.query(queryEmbedding.data[0], {
    topK: Math.min(topK * 3, 100), // Get more results to group by document
    returnMetadata: "all",
  });

  // Group results by document and calculate document-level scores
  const documentMap = new Map<string, DocumentSearchResult>();

  for (const match of results.matches as SearchMatch[]) {
    if (!match.metadata) continue;

    const docId = match.metadata.docId;

    if (!documentMap.has(docId)) {
      documentMap.set(docId, {
        docId,
        title: match.metadata.title,
        author: match.metadata.author,
        chunks: [],
        maxScore: match.score,
      });
    }

    const docResult = documentMap.get(docId)!;
    docResult.chunks.push({
      chunkIndex: match.metadata.chunkIndex,
      score: match.score,
      text: returnFullText
        ? match.metadata.text || ""
        : (match.metadata.text || "").substring(0, 200) + "...",
    });

    // Update max score if this chunk has a higher score
    if (match.score > docResult.maxScore) {
      docResult.maxScore = match.score;
    }
  }

  // Convert to array and sort by max score
  const rankedDocuments = Array.from(documentMap.values())
    .sort((a, b) => b.maxScore - a.maxScore)
    .slice(0, topK);

  // Sort chunks within each document by score
  rankedDocuments.forEach((doc) => {
    doc.chunks.sort((a, b) => b.score - a.score);
    // Limit chunks per document (top 3 most relevant)
    doc.chunks = doc.chunks.slice(0, 3);
  });

  return {
    query,
    totalResults: results.matches.length,
    documentsFound: rankedDocuments.length,
    results: rankedDocuments,
  };
}

/**
 * Validate search parameters from request body
 */
export function validateSearchParams(body: any): SearchParams {
  if (!body || !body.query) {
    throw new Error("Query parameter is required");
  }

  return {
    query: body.query,
    topK: body.topK,
    returnFullText: body.returnFullText,
  };
}
