import { Hono } from "hono";

const app = new Hono<{ Bindings: CloudflareBindings }>();

export default {
  port: 4000,
  fetch: app.fetch,
};

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
