/**
 * Search routes
 * API endpoints for semantic search
 */

import { Hono } from "hono";
import type { Bindings } from "../lib/types";
import {
  searchDocuments,
  validateSearchParams,
} from "../services/search.service";

const searchRoute = new Hono<{ Bindings: Bindings }>();

/**
 * POST /search
 * Search for documents by semantic similarity
 * Returns top-K relevant chunks from across all documents
 */
searchRoute.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const params = validateSearchParams(body);

    const result = await searchDocuments(
      params,
      c.env.AI,
      c.env.DOCUMENT_INDEX
    );

    return c.json(result);
  } catch (error) {
    console.error("Error searching documents:", error);
    return c.json(
      {
        error: "Search failed",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

export default searchRoute;
