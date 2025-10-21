import type { TextChunk } from './types';

/**
 * Semantic text chunking that respects sentence and paragraph boundaries
 * for better embedding quality and search relevance.
 */

const DEFAULT_CHUNK_SIZE = 1000; // Target characters per chunk
const MIN_CHUNK_SIZE = 500; // Minimum chunk size to avoid tiny fragments
const CHUNK_OVERLAP = 100; // Characters to overlap between chunks for context

/**
 * Split text into semantic chunks based on sentences and paragraphs
 * @param text The full text to chunk
 * @param targetSize Target size in characters (default: 1000)
 * @returns Array of text chunks with position information
 */
export function chunkText(
  text: string,
  targetSize: number = DEFAULT_CHUNK_SIZE
): TextChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Normalize whitespace and line breaks
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into paragraphs first (better semantic boundaries)
  const paragraphs = normalizedText.split(/\n\s*\n+/);

  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let currentStartOffset = 0;

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    // If adding this paragraph exceeds target size, create a chunk
    if (currentChunk.length > 0 &&
        currentChunk.length + trimmedParagraph.length > targetSize) {

      // If current chunk is too small, try to add more sentences
      if (currentChunk.length < MIN_CHUNK_SIZE) {
        currentChunk += '\n\n' + trimmedParagraph;
      } else {
        // Finalize current chunk
        chunks.push({
          text: currentChunk.trim(),
          startOffset: currentStartOffset,
          endOffset: currentStartOffset + currentChunk.length,
        });

        // Start new chunk with overlap
        const overlapText = getOverlapText(currentChunk, CHUNK_OVERLAP);
        currentStartOffset = currentStartOffset + currentChunk.length - overlapText.length;
        currentChunk = overlapText + trimmedParagraph;
      }
    } else {
      // Add paragraph to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
    }
  }

  // Add final chunk if it exists
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      startOffset: currentStartOffset,
      endOffset: currentStartOffset + currentChunk.length,
    });
  }

  // If no chunks created (e.g., very short text), create one chunk
  if (chunks.length === 0 && normalizedText.trim().length > 0) {
    chunks.push({
      text: normalizedText.trim(),
      startOffset: 0,
      endOffset: normalizedText.length,
    });
  }

  return chunks;
}

/**
 * Get the last N characters ending at a sentence boundary for overlap
 * @param text The text to extract overlap from
 * @param maxLength Maximum overlap length
 * @returns Overlap text ending at a sentence boundary
 */
function getOverlapText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Try to find a sentence boundary within the overlap region
  const overlapRegion = text.slice(-maxLength);
  const sentenceEndings = /[.!?]\s+/g;

  let lastSentenceEnd = -1;
  let match;

  while ((match = sentenceEndings.exec(overlapRegion)) !== null) {
    lastSentenceEnd = match.index + match[0].length;
  }

  // If we found a sentence boundary, use it
  if (lastSentenceEnd > 0) {
    return overlapRegion.slice(lastSentenceEnd);
  }

  // Otherwise, try to break at a word boundary
  const words = overlapRegion.split(/\s+/);
  if (words.length > 1) {
    return words.slice(-Math.ceil(words.length / 2)).join(' ');
  }

  // Fallback: use the last N characters
  return overlapRegion;
}

/**
 * Estimate the number of chunks that will be created from text
 * @param text The text to analyze
 * @param targetSize Target chunk size
 * @returns Estimated number of chunks
 */
export function estimateChunkCount(
  text: string,
  targetSize: number = DEFAULT_CHUNK_SIZE
): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  const textLength = text.trim().length;
  return Math.ceil(textLength / targetSize);
}

/**
 * Split multiple documents into chunks and return metadata
 * @param documents Array of documents to chunk
 * @returns Total chunk count and per-document breakdown
 */
export function analyzeDocumentsForChunking(
  documents: Array<{ id: string; text: string }>
): {
  totalChunks: number;
  documentsBreakdown: Array<{ docId: string; chunkCount: number }>;
} {
  const breakdown = documents.map((doc) => ({
    docId: doc.id,
    chunkCount: estimateChunkCount(doc.text),
  }));

  const totalChunks = breakdown.reduce((sum, doc) => sum + doc.chunkCount, 0);

  return {
    totalChunks,
    documentsBreakdown: breakdown,
  };
}
