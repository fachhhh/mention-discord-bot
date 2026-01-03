import express from "express";
import { ENV } from "./config/env.js";

export function startWebServer() {
  const app = express();
  app.get("/", (_, res) => {
    res.status(200).send("Bot is running");
  });

  app.listen(ENV.PORT, () => {
    console.log(`🌐 Web server running on port ${ENV.PORT}`);
  });
}