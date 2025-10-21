# Document Vectorization API

A production-ready Cloudflare Workers application for large-scale document vectorization using **Cloudflare Vectorize**, **Workers AI**, and **Queues**.

This solution handles thousands of documents (even 5000+ stories with 500 pages each) by using semantic chunking and asynchronous batch processing via Cloudflare Queues.

## Features

- **Scalable Processing**: Uses Cloudflare Queues to handle large document volumes without hitting Worker CPU time limits
- **Semantic Chunking**: Smart text splitting that respects sentence/paragraph boundaries for better embedding quality
- **Batch Embeddings**: Processes multiple chunks at once for efficiency
- **Semantic Search**: Returns relevant text chunks from across all documents
- **Fire-and-Forget**: Submit documents and they're processed asynchronously in the background
- **Automatic Retry**: Failed chunks are automatically retried (max 3 times) with dead letter queue support

## Architecture

```
User → POST /documents/submit → Chunk Documents → Queue Messages
                                                         ↓
                                            Queue Consumer (batch=10)
                                                         ↓
                                            Workers AI (embeddings)
                                                         ↓
                                            Vectorize Index (storage)

User → POST /search → Workers AI (query embedding) → Vectorize Index → Ranked Results
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Vectorize Index

```bash
# Create the vector index with 768 dimensions (for bge-base-en-v1.5 model)
wrangler vectorize create document-vector-index --dimensions=768 --metric=cosine
```

### 3. Create Cloudflare Queues

```bash
# Create the main processing queue
wrangler queues create vectorize-queue

# Create the dead letter queue (for failed messages)
wrangler queues create vectorize-queue-dlq
```

### 4. Generate TypeScript Types

```bash
npm run generate:types
```

This generates the `CloudflareBindings` types based on your [wrangler.jsonc](wrangler.jsonc) configuration.

### 5. Run Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:4000`

### 6. Deploy to Cloudflare

```bash
npm run deploy
```

## API Usage

### Health Check

```bash
curl http://localhost:4000/
```

Response:
```json
{
  "status": "OK",
  "message": "Document Vectorization API",
  "endpoints": {
    "submit": "POST /documents/submit",
    "search": "POST /search"
  },
  "configuration": {
    "embeddingModel": "@cf/baai/bge-base-en-v1.5",
    "queueName": "vectorize-queue",
    "vectorizeIndex": "document-vector-index"
  }
}
```

### Submit Documents for Vectorization

Submit one or more documents. They will be chunked and queued for processing.

```bash
curl -X POST http://localhost:4000/documents/submit \
  -H "Content-Type: application/json" \
  -d '[
    {
      "id": "doc-001",
      "title": "The Great Gatsby",
      "author": "F. Scott Fitzgerald",
      "text": "In my younger and more vulnerable years my father gave me some advice...",
      "metadata": {
        "year": 1925,
        "genre": "fiction"
      }
    },
    {
      "id": "doc-002",
      "title": "1984",
      "author": "George Orwell",
      "text": "It was a bright cold day in April, and the clocks were striking thirteen..."
    }
  ]'
```

Response:
```json
{
  "status": "queued",
  "documentsSubmitted": 2,
  "chunksQueued": 45,
  "estimatedChunks": 45,
  "breakdown": [
    { "docId": "doc-001", "chunkCount": 23 },
    { "docId": "doc-002", "chunkCount": 22 }
  ],
  "message": "Documents queued for vectorization. Processing will happen asynchronously."
}
```

### Search Documents

Search for documents using semantic similarity. Returns top-K documents with their most relevant chunks.

```bash
curl -X POST http://localhost:4000/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the main character like?",
    "topK": 5,
    "returnFullText": false
  }'
```

Response:
```json
{
  "query": "What is the main character like?",
  "totalResults": 15,
  "documentsFound": 2,
  "results": [
    {
      "docId": "doc-001",
      "title": "The Great Gatsby",
      "author": "F. Scott Fitzgerald",
      "maxScore": 0.892,
      "chunks": [
        {
          "chunkIndex": 0,
          "score": 0.892,
          "text": "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since..."
        },
        {
          "chunkIndex": 3,
          "score": 0.854,
          "text": "Nick Carraway, the narrator, describes himself as someone who reserves judgment..."
        }
      ]
    }
  ]
}
```

#### Search Parameters

- `query` (required): The search query string
- `topK` (optional, default: 10): Maximum number of documents to return
- `returnFullText` (optional, default: false): If true, returns full chunk text; if false, returns 200-char preview

## How It Handles Large Documents

### The Problem

Cloudflare Workers have strict limits:
- **CPU time**: 30 seconds max (paid plan)
- **Duration**: 30 seconds max for HTTP requests
- Processing 5000 documents with 500 pages each would take hours!

### The Solution

1. **Semantic Chunking**: Each document is split into ~1000 character chunks at paragraph/sentence boundaries
2. **Queue-Based Processing**: Each chunk is sent to a Cloudflare Queue
3. **Batch Processing**: Queue consumer processes 10 chunks at a time
4. **Parallel Workers**: Multiple consumer instances can process chunks simultaneously
5. **Automatic Scaling**: Cloudflare automatically scales consumers based on queue depth

**Example**: A 500-page document (≈500,000 characters) becomes ≈500 chunks. With 10 chunks per batch and parallel consumers, processing completes in minutes, not hours.

## Configuration

### Queue Settings ([wrangler.jsonc](wrangler.jsonc#L33-L40))

```jsonc
{
  "queue": "vectorize-queue",
  "max_batch_size": 10,        // Process 10 chunks at once
  "max_batch_timeout": 5,      // Wait max 5 seconds to collect batch
  "max_retries": 3,            // Retry failed chunks 3 times
  "dead_letter_queue": "vectorize-queue-dlq"  // Failed messages go here
}
```

### Chunking Settings ([src/lib/chunking.ts](src/lib/chunking.ts#L7-L9))

```typescript
const DEFAULT_CHUNK_SIZE = 1000;  // Target characters per chunk
const MIN_CHUNK_SIZE = 500;       // Minimum chunk size
const CHUNK_OVERLAP = 100;        // Overlap between chunks for context
```

## Monitoring

### View Queue Status

```bash
# Check queue depth and consumer activity
wrangler queues list
```

### View Logs

```bash
# Tail logs in development
npm run dev

# View production logs
wrangler tail
```

### Check Vectorize Index

```bash
# Get index statistics
wrangler vectorize get document-vector-index
```

## Troubleshooting

### Messages Going to Dead Letter Queue

If messages fail after 3 retries, they go to the DLQ. Check the DLQ:

```bash
wrangler queues consumer worker vectorize-queue-dlq
```

Common causes:
- Text too long for embedding model (reduce chunk size)
- Network issues with Workers AI
- Invalid metadata

### Slow Processing

If processing is slow:
1. Increase `max_batch_size` in [wrangler.jsonc](wrangler.jsonc#L36) (max: 100)
2. Reduce chunk overlap to create fewer chunks
3. Check queue depth: `wrangler queues list`

### Search Returns No Results

Ensure:
1. Documents were actually processed (check logs)
2. Vectorize index exists: `wrangler vectorize list`
3. Queue consumer is running properly

## Project Structure

```
vectorize-example/
├── src/
│   ├── index.ts              # Main API routes + queue consumer
│   └── lib/
│       ├── types.ts          # TypeScript type definitions
│       └── chunking.ts       # Semantic text chunking logic
├── wrangler.jsonc            # Cloudflare Workers configuration
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## Learn More

- [Cloudflare Vectorize Documentation](https://developers.cloudflare.com/vectorize/)
- [Cloudflare Queues Documentation](https://developers.cloudflare.com/queues/)
- [Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Hono Framework](https://hono.dev/)
