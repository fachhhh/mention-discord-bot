import { 
  handleSplitBillStart as handleSplitBillManual,
  handleUtangCommand,
  handleBayarCommand
} from './splitBillHandler.js';
import { handlePollBillStart } from './pollBillHandler.js';
import { handleQuoteCommand } from './quoteHandler.js';

/**
 * Route commands to appropriate handlers
 */
export async function routeCommand(message, command, content) {
  // ===== QUOTE COMMANDS =====
  if (command === 'quote') {
    await handleQuoteCommand(message);
    return true;
  }

  // ===== SPLIT BILL COMMANDS =====
  if (command === 'split') {
    const hasImage = message.attachments.some(att => att.contentType?.startsWith('image/'));
    
    if (hasImage) {
      await handlePollBillStart(message);
    } else {
      await message.reply(
        '🗳️ **Split Bill - Polling Mode**\n\n' +
        '**Format:**\n' +
        'Upload foto struk + ketik:\n' +
        '```\n!split\nkaraoke healing after UAS\n@user1 @user2 @user3\nbayar ke @yang_bayar\n```\n\n' +
        '**How it works:**\n' +
        '1. Upload foto struk + tag participants + payer\n' +
        '2. Bot scan menu → create buttons\n' +
        '3. Semua orang klik button untuk claim items mereka\n' +
        '4. Auto-finalize saat semua claim (grace period 10 min)\n\n' +
        '✨ _Ga perlu ngetik item names lagi! Tinggal klik!_\n\n' +
        '**Reminder:**\n' +
        '• Bot akan tag user yang belum claim setiap 3-6 jam\n' +
        '• Creator bisa force finish kapan saja\n\n' +
        '**Other Commands:**\n' +
        '• `!splitmanual` - Manual mode (ketik item names)\n' +
        '• `!utang` - Cek detail hutang dengan ID\n' +
        '• `!bayar 123` atau `!bayar nobar bioskop` - Bayar bill tertentu\n' +
        '• `!bayar @user` - Bayar semua hutang ke user'
      );
    }
    return true;
  }

  // Manual split bill mode (legacy)
  if (command === 'splitmanual') {
    const hasImage = message.attachments.some(att => att.contentType?.startsWith('image/'));
    
    if (hasImage) {
      await handleSplitBillManual(message);
    } else {
      await message.reply(
        '📝 **Split Bill - Manual Mode**\n\n' +
        '**Format:**\n' +
        'Upload foto + ketik:\n' +
        '```\n!splitmanual\nkaraoke healing after UAS\n@user1, indocafe 1\n@user2, sari roti 1\nbayar ke @yang_bayar\n```\n' +
        '✨ _Item ga harus exact, bot akan match otomatis!_\n\n' +
        '**Bagi rata:**\n```\n!splitmanual\nketerangan\n@user1 @user2 bagi rata bayar ke @payer\n```'
      );
    }
    return true;
  }

  if (command === 'utang') {
    await handleUtangCommand(message);
    return true;
  }

  if (content.startsWith('!bayar')) {
    await handleBayarCommand(message);
    return true;
  }

  return false;
}
