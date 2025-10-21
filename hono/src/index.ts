import { Hono } from "hono";
import { VoiceAIDurableObject } from "./durable-object/VoiceAi";
const app = new Hono<{ Bindings: CloudflareBindings }>();

export default {
  port: 4000,
  fetch: app.fetch,
};

export { VoiceAIDurableObject };

app.get("/websocket", async (c) => {
  // Create a unique durable object id for the session
  const id = c.env.VoiceAIDurableObject.idFromName(crypto.randomUUID());

  const stub = c.env.VoiceAIDurableObject.get(id);

  // forward the request to the durable object
  return stub.fetch(c.req.raw);
});

app.get("/", (c) => {
  return c.json({
    status: "OK",
    message: "Voice AI worker is running",
    endpoint: {
      websocket: "/websocket",
    },

    envs: {
      ...c.env,
    },
  });
});
