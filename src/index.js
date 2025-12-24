import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';

const app = express();

// ===== HTTP SERVER (BIAR WEB SERVICE HIDUP) =====
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// ===== DISCORD BOT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', () => {
  console.log(`✅ Connected as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.mentions.has(client.user)) {
    await message.reply('https://ristek.link/ArsipVille');
  }
});

client.login(process.env.TOKEN);
