import { Client, GatewayIntentBits } from "discord.js";
import messageCreate from "./events/messageCreate.js";
import { ENV } from "./config/env.js";

export function startBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once("clientReady", () => {
    console.log(`✅ Connected as ${client.user.tag}`);
  });

  client.on("messageCreate", (msg) => messageCreate(msg, client));

  client.login(ENV.TOKEN);
}