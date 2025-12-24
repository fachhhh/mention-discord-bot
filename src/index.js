require('dotenv').config({ quiet: true });
const { Client, GatewayIntentBits } = require('discord.js');

const LINK_REPLY = 'https://ristek.link/ArsipVille';

// cooldown dalam ms (misal 10 detik)
const COOLDOWN_MS = 10_000;

// simpan waktu terakhir user mention bot
const cooldownMap = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('clientReady', () => {
  console.log(`✅ Connected as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  // 1. Abaikan bot
  if (message.author.bot) return;

  // 2. Cek apakah bot di-mention (berapa kali pun tetap true)
  if (!message.mentions.has(client.user)) return;

  const userId = message.author.id;
  const now = Date.now();

  // 3. Cooldown check
  const lastUsed = cooldownMap.get(userId) || 0;
  if (now - lastUsed < COOLDOWN_MS) {
    return; // diem, tidak reply
  }

  // 4. Update cooldown
  cooldownMap.set(userId, now);

  // 5. Reply 1 link saja
  message.reply(LINK_REPLY);
});

client.login(process.env.TOKEN);
