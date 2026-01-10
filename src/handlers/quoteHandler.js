import { getQuote } from '../commands/quotes.js';

/**
 * Handle quote-related commands
 */
export async function handleQuoteCommand(message) {
  try {
    await getQuote(message);
  } catch (err) {
    console.error('Error getting quote:', err);
    await message.reply('❌ Error getting quote');
  }
}
