import "dotenv/config"; 
import { startWebServer } from "./web.js";
import { startBot } from "./bot.js";
import "./db/pool.js";

startWebServer();
startBot();