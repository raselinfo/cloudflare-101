# Architecture Documentation

## Project Structure

```
vectorize-example/
├── src/
│   ├── index.ts                    # Main entry point, route mounting
│   ├── lib/                        # Shared utilities and types
│   │   ├── types.ts               # TypeScript type definitions
│   │   └── chunking.ts            # Text chunking algorithms
│   ├── routes/                     # API route handlers
│   │   ├── documents.route.ts     # Document submission endpoints
│   │   └── search.route.ts        # Search endpoints
│   └── services/                   # Business logic layer
│       ├── document.service.ts    # Document processing logic
│       ├── search.service.ts      # Search and embedding logic
│       └── queue.service.ts       # Queue consumer logic
├── wrangler.jsonc                  # Cloudflare Workers configuration
└── package.json                    # Dependencies and scripts
```

## Layer Separation

### 1. **Entry Point** ([src/index.ts](src/index.ts))
- **Responsibility**: Application bootstrap and configuration
- **What it does**:
  - Creates Hono app instance
  - Mounts route modules
  - Exports worker handlers (fetch, queue)
  - Provides health check endpoint
- **What it doesn't do**:
  - No business logic
  - No direct database/API access
  - No data transformation

### 2. **Routes Layer** ([src/routes/](src/routes/))
- **Responsibility**: HTTP request/response handling
- **What it does**:
  - Parse request body
  - Call service functions
  - Return formatted responses
  - Handle HTTP errors (400, 500, etc.)
- **What it doesn't do**:
  - No business logic
  - No direct access to AI/Vectorize/Queue (delegates to services)

#### [documents.route.ts](src/routes/documents.route.ts)
- `POST /documents/submit` - Document submission endpoint

#### [search.route.ts](src/routes/search.route.ts)
- `POST /search` - Semantic search endpoint

### 3. **Services Layer** ([src/services/](src/services/))
- **Responsibility**: Business logic and external service interaction
- **What it does**:
  - Implement core business logic
  - Interact with Cloudflare services (AI, Vectorize, Queues)
  - Data transformation and validation
  - Error handling
- **What it doesn't do**:
  - No HTTP-specific concerns (status codes, headers)
  - No direct access to request/response objects

#### [document.service.ts](src/services/document.service.ts)
- `submitDocuments()` - Process and queue documents
- `validateDocumentInput()` - Validate document structure

#### [search.service.ts](src/services/search.service.ts)
- `searchDocuments()` - Perform semantic search
- `validateSearchParams()` - Validate search parameters
- Exports `EMBEDDING_MODEL` constant

#### [queue.service.ts](src/services/queue.service.ts)
- `processQueueBatch()` - Handle queue message batches
- Generate embeddings and insert into Vectorize

### 4. **Library Layer** ([src/lib/](src/lib/))
- **Responsibility**: Reusable utilities and type definitions
- **What it does**:
  - Pure functions (no side effects)
  - Type definitions
  - Algorithm implementations
- **What it doesn't do**:
  - No external service calls
  - No state mutation

#### [types.ts](src/lib/types.ts)
- TypeScript interfaces and types
- Worker bindings definitions

#### [chunking.ts](src/lib/chunking.ts)
- `chunkText()` - Semantic text chunking
- `estimateChunkCount()` - Chunk estimation
- `analyzeDocumentsForChunking()` - Document analysis

## Data Flow

### Document Submission Flow
```
Client Request
    ↓
documents.route.ts (POST /documents/submit)
    ↓
document.service.ts (validateDocumentInput)
    ↓
chunking.ts (chunkText)
    ↓
document.service.ts (submitDocuments)
    ↓
Cloudflare Queue
    ↓
index.ts (handleQueueBatch)
    ↓
queue.service.ts (processQueueBatch)
    ↓
Workers AI (generate embeddings)
    ↓
Vectorize Index (store vectors)
```

### Search Flow
```
Client Request
    ↓
search.route.ts (POST /search)
    ↓
search.service.ts (validateSearchParams)
    ↓
search.service.ts (searchDocuments)
    ↓
Workers AI (generate query embedding)
    ↓
Vectorize Index (semantic search)
    ↓
search.service.ts (group and rank results)
    ↓
search.route.ts (return JSON response)
```

## Import Strategy (Edge-Compatible)

### Key Principles
1. **Use `.ts` extensions explicitly** in imports (Cloudflare Workers requirement)
2. **Relative imports only** - no path aliases
3. **Tree-shakeable exports** - named exports preferred

### Import Examples

```typescript
// ✅ Good: Explicit .ts extension, relative path
import { chunkText } from "./lib/chunking";
import type { Bindings } from "./lib/types";

// ✅ Good: Default export for route modules
import documentsRoute from "./routes/documents.route";

// ❌ Bad: No extension (won't work on edge)
import { chunkText } from "./lib/chunking";

// ❌ Bad: Absolute imports (not configured)
import { chunkText } from "@/lib/chunking";
```

### Handling Edge Import Issues

Cloudflare Workers use **esbuild** for bundling, which has specific requirements:

1. **File extensions**: While TypeScript allows omitting `.ts`, Workers runtime expects explicit paths
2. **No Node.js modules**: Only Web APIs available
3. **No dynamic imports**: All imports must be static

## Benefits of This Architecture

### 1. **Separation of Concerns**
- Routes handle HTTP → Services handle business logic → Lib provides utilities
- Each layer has a single responsibility

### 2. **Testability**
- Services can be unit tested independently
- Routes can be integration tested
- Pure functions in lib/ are easy to test

### 3. **Reusability**
- Services can be called from multiple routes
- Utilities in lib/ can be used anywhere
- Easy to add new endpoints using existing services

### 4. **Maintainability**
- Clear file organization
- Easy to locate code by responsibility
- Changes isolated to specific layers

### 5. **Type Safety**
- Centralized type definitions
- Shared interfaces across layers
- Compile-time error detection

## Adding New Features

### Example: Add document deletion

1. **Add types** in `src/lib/types.ts`:
```typescript
export type DeleteDocumentRequest = {
  docId: string;
};
```

2. **Add service** in `src/services/document.service.ts`:
```typescript
export async function deleteDocument(
  docId: string,
  vectorIndex: VectorizeIndex
): Promise<void> {
  // Implementation
}
```

3. **Add route** in `src/routes/documents.route.ts`:
```typescript
documentsRoute.delete("/:id", async (c) => {
  const docId = c.req.param("id");
  await deleteDocument(docId, c.env.DOCUMENT_INDEX);
  return c.json({ success: true });
});
```

4. **No changes needed** to `src/index.ts` - it's already mounted!

## Best Practices

1. **Keep routes thin** - Just parse input, call service, return response
2. **Keep services focused** - One service per domain concept
3. **Keep lib pure** - No side effects in utility functions
4. **Type everything** - Use TypeScript to catch errors early
5. **Error handling** - Services throw, routes catch and format
6. **Async/await** - Use consistently for better readability
7. **Comments** - Explain "why", not "what"

## Performance Considerations

1. **Tree shaking**: Named exports help esbuild remove unused code
2. **Bundle size**: Import only what you need
3. **Cold starts**: Minimize top-level initialization
4. **CPU limits**: Keep service functions focused (< 30s runtime)
