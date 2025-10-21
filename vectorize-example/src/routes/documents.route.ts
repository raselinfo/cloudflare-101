/**
 * Document routes
 * API endpoints for document submission
 */

import { Hono } from "hono";
import type { Bindings } from "../lib/types";
import {
  submitDocuments,
  validateDocumentInput,
} from "../services/document.service";

const documentsRoute = new Hono<{ Bindings: Bindings }>();

/**
 * POST /documents/submit
 * Submit documents for vectorization
 * Accepts array of documents, chunks them, and queues for processing
 */
documentsRoute.post("/submit", async (c) => {
  try {
    const body = await c.req.json();
    const documents = validateDocumentInput(body);

    const result = await submitDocuments(documents, c.env.VECTORIZE_QUEUE);

    return c.json(result);
  } catch (error) {
    console.error("Error submitting documents:", error);
    return c.json(
      {
        error: "Failed to submit documents",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

export default documentsRoute;
