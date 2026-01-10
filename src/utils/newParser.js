/**
 * New Assignment Parser with Fuzzy Matching
 * 
 * Format 1 (Individual):
 * @user1, menu1 qty, menu2 qty
 * @user2, menu1 qty
 * bayar ke @payer
 * 
 * Format 2 (Split equally):
 * bagi rata bayar ke @payer
 */

import { matchItem } from './similarity.js';

/**
 * Parse the new format assignment
 * @param {string} text - Assignment text
 * @param {Array} items - Available items from OCR [{item, price}, ...]
 * @param {Object} message - Discord message object (for mentions)
 * @returns {Object} - Parsed data
 */
export function parseNewFormat(text, items, message) {
  console.log('📝 Parsing new format assignment...');
  
  const lines = text.trim().split('\n').filter(line => line.trim());
  
  // Check for "bagi rata" format
  // Format: @user1 @user2 @user3 bagi rata bayar ke @payer
  const splitEquallyMatch = text.match(/bagi\s*rata.*bayar\s*ke\s*<@!?(\d+)>/i);
  if (splitEquallyMatch) {
    const payerId = splitEquallyMatch[1];
    const payer = message.mentions.users.get(payerId);
    
    if (!payer) {
      return { success: false, error: 'Payer tidak ditemukan. Pastikan mention dengan benar.' };
    }

    // Get all mentioned users as participants (including payer)
    const allMentions = Array.from(message.mentions.users.values());
    
    if (allMentions.length < 2) {
      return { 
        success: false, 
        error: 'Mention minimal 2 orang (peserta + payer).\n\nFormat: `@user1 @user2 @user3 bagi rata bayar ke @payer`' 
      };
    }

    const participants = allMentions.map(u => ({
      id: u.id,
      username: u.username,
      displayName: message.guild?.members.cache.get(u.id)?.displayName || u.username
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.price, 0);
    const perPerson = Math.ceil(totalAmount / participants.length);

    return {
      success: true,
      type: 'split_equally',
      payer: {
        id: payer.id,
        username: payer.username,
        displayName: message.guild?.members.cache.get(payer.id)?.displayName || payer.username
      },
      participants,
      perPerson,
      assignments: [],
      totalAmount
    };
  }

  // Parse individual assignments
  // Format: @user, menu qty, menu qty
  const assignments = [];
  let payer = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for "bayar ke @user"
    const payerMatch = trimmed.match(/bayar\s*ke\s*<@!?(\d+)>/i);
    if (payerMatch) {
      const payerId = payerMatch[1];
      const payerUser = message.mentions.users.get(payerId);
      if (payerUser) {
        payer = {
          id: payerUser.id,
          username: payerUser.username,
          displayName: message.guild?.members.cache.get(payerUser.id)?.displayName || payerUser.username
        };
      }
      continue;
    }

    // Parse assignment line: @user, menu qty, menu qty, ...
    const userMatch = trimmed.match(/^<@!?(\d+)>\s*,?\s*(.+)/);
    if (!userMatch) continue;

    const userId = userMatch[1];
    const user = message.mentions.users.get(userId);
    if (!user) continue;

    const menuPart = userMatch[2];
    const menuItems = parseMenuItems(menuPart, items);

    if (menuItems.length > 0) {
      assignments.push({
        user: {
          id: user.id,
          username: user.username,
          displayName: message.guild?.members.cache.get(user.id)?.displayName || user.username
        },
        items: menuItems
      });
    }
  }

  if (!payer) {
    return { success: false, error: 'Payer tidak ditemukan. Tambahkan "bayar ke @username" di akhir.' };
  }

  if (assignments.length === 0) {
    return { success: false, error: 'Tidak ada assignment yang valid. Pastikan format benar.' };
  }

  // Calculate totals
  let totalAssigned = 0;
  for (const assignment of assignments) {
    assignment.total = assignment.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    totalAssigned += assignment.total;
  }

  return {
    success: true,
    type: 'individual',
    payer,
    assignments,
    totalAssigned,
    totalFromOCR: items.reduce((sum, item) => sum + item.price, 0)
  };
}

/**
 * Parse menu items from string like "Chicken Ramen 1, Ocha 2"
 * Now with fuzzy matching using cosine similarity
 */
function parseMenuItems(menuString, ocrItems) {
  const parts = menuString.split(',').map(p => p.trim()).filter(p => p);
  const result = [];

  for (const part of parts) {
    // Try to extract quantity from end
    const qtyMatch = part.match(/^(.+?)\s+(\d+)$/);
    let itemName, qty;

    if (qtyMatch) {
      itemName = qtyMatch[1].trim();
      qty = parseInt(qtyMatch[2]);
    } else {
      itemName = part.trim();
      qty = 1;
    }

    // Use similarity matching from utility
    const matched = matchItem(itemName, ocrItems);
    if (matched) {
      result.push({
        name: matched.item,
        price: matched.price,
        qty,
        originalInput: itemName // Keep original for reference
      });
    } else {
      console.warn(`⚠️ Item not found: "${itemName}"`);
    }
  }

  return result;
}

/**
 * Check if text looks like new format
 */
export function looksLikeNewFormat(text) {
  // Has @mention followed by comma and items
  const hasUserAssignment = /<@!?\d+>\s*,/.test(text);
  // Has "bayar ke @mention"
  const hasPayerLine = /bayar\s*ke\s*<@!?\d+>/i.test(text);
  // Has "bagi rata"
  const hasSplitEqually = /bagi\s*rata/i.test(text);
  
  return (hasUserAssignment && hasPayerLine) || (hasSplitEqually && hasPayerLine);
}
