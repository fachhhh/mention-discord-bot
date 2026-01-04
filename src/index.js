import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import { 
  handleSplitBillStart, 
  handleDescription, 
  handleConfirmation,
  handleUtangCommand,
  handleBayarCommand,
  handleRiwayatCommand
} from './handlers/splitBillHandler.js';
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
  console.log(`📊 Split Bill Bot ready!`);
  
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

    // Handle commands
    if (content === '!utang') {
      await handleUtangCommand(message);
      return;
    }

    if (content.startsWith('!bayar')) {
      await handleBayarCommand(message);
      return;
    }

    if (content === '!riwayat') {
      await handleRiwayatCommand(message);
      return;
    }

    // Check if user is in a session (waiting for description)
    const session = sessionManager.getSession(message.author.id);
    
    if (session && session.state === 'WAITING_DESCRIPTION') {
      // Handle description input
      await handleDescription(message);
      return;
    }

    // Check if bot is mentioned
    if (message.mentions.has(client.user)) {
      // Check if message has image attachment
      const hasImage = message.attachments.some(att => att.contentType?.startsWith('image/'));
      
      if (hasImage) {
        // Start split bill flow
        await handleSplitBillStart(message);
      } else {
        // Just a mention without image - show help
        await message.reply(
          '👋 **Split Bill Bot**\n\n' +
          '**Cara pakai:**\n' +
          '1. Mention bot + upload foto struk\n' +
          '2. Bot akan baca item dari struk\n' +
          '3. Assign siapa pesan apa:\n\n' +
          '```\n@user1, Chicken Ramen 1, Ocha 2\n@user2, Beef Curry 1\nbayar ke @yang_bayar\n```\n\n' +
          '**Bagi rata:**\n```\n@user1 @user2 @user3 bagi rata bayar ke @yang_bayar\n```\n\n' +
          '4. React ✅ untuk konfirmasi\n\n' +
          '**Commands:**\n' +
          '• `!utang` - Cek hutang kamu\n' +
          '• `!bayar @user` - Tandai lunas\n' +
          '• `!riwayat` - Lihat history\n' +
          '• `cancel` - Batalkan sesi'
        );
      }
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

