import { getQuote } from "../commands/quotes.js";


export default async function messageCreate(message, client) {
  if (message.author.bot) return;

  if (message.mentions.has(client.user)) {
    await message.reply("https://ristek.link/ArsipVille");
  }

  if (message.content.startsWith("!")){
    const args = message.content.slice(1).trim().split(/\s+/)
    const command = args[0].toLowerCase()

    try{
      if (command === "quote"){
          await getQuote(message)
      }
    }
    catch (err){
      console.error(err);
      await message.reply("Error getting quote")
    }
  }
}
