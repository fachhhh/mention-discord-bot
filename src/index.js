import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import { handleConfirmation } from './handlers/splitBillHandler.js';
import { routeCommand } from './handlers/commandRouter.js';
import { handleBotMention } from './handlers/mentionHandler.js';
import { handleInteraction } from './events/interactionCreate.js';
import sessionManager from './utils/sessionManager.js';
import visionService from './services/visionService.js';
import { closePool } from './config/database.js';

const app = express();

// ===== HTTP SERVER (BIAR WEB SERVICE HIDUP) =====
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).send('Bot is running');
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
    GatewayIntentBits.GuildMessageReactions, // For confirmation reactions
  ],
});

client.once('clientReady', () => {
  console.log(`✅ Connected as ${client.user.tag}`);
  console.log(`📊 SuperApp Bot ready! (Split Bill + Quotes)`);
  
  // Cleanup expired sessions every 5 minutes
  setInterval(() => {
    sessionManager.cleanupExpiredSessions();
  }, 5 * 60 * 1000);
});

// ===== MESSAGE HANDLER =====
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  try {
    const content = message.content.trim().toLowerCase();

    // ===== COMMAND ROUTING =====
    if (content.startsWith('!')) {
      const args = content.slice(1).trim().split(/\s+/);
      const command = args[0].toLowerCase();
      
      const handled = await routeCommand(message, command, content);
      if (handled) return;
    }

    // ===== BOT MENTION =====
    if (message.mentions.has(client.user)) {
      await handleBotMention(message);
      return;
    }
  } catch (error) {
    console.error('❌ Message handler error:', error);
    await message.reply('❌ Terjadi error. Coba lagi.');
  }
});

// ===== REACTION HANDLER =====
client.on('messageReactionAdd', async (reaction, user) => {
  // Ignore bot reactions
  if (user.bot) return;

  try {
    // Fetch partial reactions
    if (reaction.partial) {
      await reaction.fetch();
    }

    // Handle confirmation
    await handleConfirmation(reaction, user);
  } catch (error) {
    console.error('❌ Reaction handler error:', error);
  }
});

// ===== INTERACTION HANDLER (BUTTONS) =====
client.on('interactionCreate', async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error('❌ Interaction handler error:', error);
  }
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', async () => {
  console.log('\n🔌 Shutting down gracefully...');
  
  // Cleanup Vision service
  await visionService.cleanup();
  
  // Close database pool
  await closePool();
  
  // Destroy Discord client
  client.destroy();
  
  console.log('✅ Shutdown complete');
  process.exit(0);
});

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);

