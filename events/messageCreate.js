export default async function messageCreate(message, client) {
  if (message.author.bot) return;

  if (message.mentions.has(client.user)) {
    await message.reply("https://ristek.link/ArsipVille");
  }
}
