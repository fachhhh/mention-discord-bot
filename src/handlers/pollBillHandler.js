/**
 * Poll-based Split Bill Handler
 * Users claim items via button clicks instead of manual text input
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import visionService from '../services/visionService.js';
import sessionManager from '../utils/sessionManager.js';
import { query } from '../config/database.js';

const ITEMS_PER_PAGE = 15; // 15 items per page (5 buttons per row x 3 rows = 15, + nav + finalize = 5 rows max)
const BUTTONS_PER_ROW = 5; // Discord max 5 buttons per row
const REMINDER_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
const GRACE_PERIOD = 30 * 1000; // 30 seconds grace period (for testing)

/**
 * Start polling flow
 * Format: !split [image]\nketerangan\n@user1 @user2 @user3\nbayar ke @payer
 */
export async function handlePollBillStart(message) {
  try {
    // Check if message has image attachment
    const attachment = message.attachments.find(att => 
      att.contentType?.startsWith('image/')
    );

    if (!attachment) {
      await message.reply(
        '❌ **Perlu foto struk!**\n\n' +
        '**Format:**\n' +
        '```\n!split [attach image]\nketerangan\n@user1 @user2 @user3\nbayar ke @payer\n```'
      );
      return;
    }

    // Parse message content
    const content = message.content.trim();
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      await message.reply(
        '❌ **Format tidak lengkap!**\n\n' +
        '**Format:**\n' +
        '```\n!split [attach image]\n@user1 @user2 @user3\nbayar ke @payer\n```\n' +
        '**Atau dengan keterangan:**\n' +
        '```\n!split\nkaraoke healing after UAS\n@user1 @user2 @user3\nbayar ke @payer\n```\n' +
        '💡 _Keterangan opsional, bot akan ambil dari nama toko di struk_'
      );
      return;
    }

    // Find participants line (line with @mentions)
    let participantLineIdx = -1;
    let participantMentions = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes('bayar')) continue; // Skip payer line
      
      const mentions = line.match(/<@!?(\d+)>/g);
      if (mentions && mentions.length > 0) {
        participantLineIdx = i;
        participantMentions = mentions;
        break;
      }
    }

    if (!participantMentions || participantMentions.length === 0) {
      await message.reply(
        '❌ **Harus tag participants!**\n\n' +
        'Tag semua orang yang ikut split bill:\n' +
        '```\n@user1 @user2 @user3\n```'
      );
      return;
    }

    // Extract description (everything before participants line, excluding !split)
    let description = '';
    for (let i = 0; i < participantLineIdx; i++) {
      const line = lines[i].replace('!split', '').trim();
      if (line) {
        description += (description ? ' ' : '') + line;
      }
    }

    // If no description, will be filled from OCR later
    let descriptionProvided = description.length > 0;

    const participants = [];
    for (const mention of participantMentions) {
      const userId = mention.match(/\d+/)[0];
      try {
        const user = await message.guild.members.fetch(userId);
        participants.push({ id: userId, username: user.user.username });
      } catch (error) {
        console.error(`Failed to fetch user ${userId}:`, error);
      }
    }

    // Extract payer - find line with "bayar"
    let payer = null;
    for (let i = participantLineIdx + 1; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const payerMatch = line.match(/bayar\s*(ke)?\s*<@!?(\d+)>/);
      if (payerMatch) {
        const payerId = payerMatch[2];
        try {
          const payerMember = await message.guild.members.fetch(payerId);
          payer = { id: payerId, username: payerMember.user.username };
          break;
        } catch (error) {
          console.error(`Failed to fetch payer ${payerId}:`, error);
        }
      }
    }

    if (!payer) {
      await message.reply(
        '❌ **Payer tidak ditemukan!**\n\n' +
        'Format: `bayar ke @user`'
      );
      return;
    }

    // Process OCR
    const processingMsg = await message.reply('🔄 Scanning struk...');

    let ocrResult;
    try {
      ocrResult = await visionService.extractItemsFromImage(attachment.url);
    } catch (error) {
      console.error('❌ OCR Error:', error);
      await processingMsg.edit(`❌ **OCR Error:** ${error.message || 'Gagal scan struk'}`);
      return;
    }

    const { items, total, storeName } = ocrResult;

    if (!items || items.length === 0) {
      await processingMsg.edit('❌ Tidak ada item yang terdeteksi dari struk.');
      return;
    }

    // Auto-generate description if not provided
    if (!descriptionProvided) {
      if (storeName) {
        description = `Split Bill - ${storeName}`;
      } else {
        const date = new Date().toLocaleDateString('id-ID', { 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric' 
        });
        description = `Split Bill - ${date}`;
      }
      console.log(`📝 Auto-generated description: ${description}`);
    }

    await processingMsg.delete();

    const creatorId = message.author.id;

    // Create poll message with buttons
    const pollMsg = await createPollMessage(message.channel, creatorId, description, items, participants, payer, total, 0);

    // Create session
    sessionManager.createSession(creatorId, {
      state: 'WAITING_VOTES',
      guildId: message.guild.id,
      channelId: message.channel.id,
      creatorId: message.author.id,
      description,
      participants,
      payer,
      items,
      total,
      claims: {}, // { itemIndex: { userId: qty } }
      pollMessageId: pollMsg.id,
      currentPage: 0,
      lastReminderAt: Date.now(),
      graceTimerId: null,
      createdAt: Date.now()
    });

    // Schedule first reminder
    scheduleReminder(message.author.id, message.channel);

  } catch (error) {
    console.error('❌ Error in handlePollBillStart:', error);
    await message.reply('❌ Gagal memulai polling. Coba lagi.');
  }
}

/**
 * Create poll message with paginated buttons
 */
async function createPollMessage(channel, creatorId, description, items, participants, payer, total, page = 0) {
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const startIdx = page * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, items.length);
  const pageItems = items.slice(startIdx, endIdx);

  // Build embed
  const participantList = participants.map(p => `<@${p.id}>`).join(', ');
  
  let itemsText = '';
  for (let i = startIdx; i < endIdx; i++) {
    const item = items[i];
    itemsText += `\`${i + 1}\` ${item.item} — **Rp ${item.price.toLocaleString('id-ID')}**\n`;
  }

  const embed = new EmbedBuilder()
    .setColor('#00D9FF')
    .setTitle('🗳️ Split Bill - Claim Items')
    .setDescription(
      `**${description}**\n\n` +
      `👥 **Participants:** ${participantList}\n` +
      `💳 **Bayar ke:** <@${payer.id}>\n` +
      `💰 **Total Struk:** Rp ${total.toLocaleString('id-ID')}\n\n` +
      `**Menu Items (Page ${page + 1}/${totalPages}):**\n${itemsText}`
    )
    .setFooter({ text: '⬇️ Klik nomor item untuk claim (klik lagi untuk unclaim)' });

  // Build buttons - 5 buttons per row, toggle claim/unclaim with same button
  // Use creatorId in custom ID for reliable session lookup
  const rows = [];
  let currentRow = new ActionRowBuilder();
  
  for (let i = startIdx; i < endIdx; i++) {
    const item = items[i];
    const itemNum = i + 1;
    
    // Show full item name (Discord button label max 80 chars)
    const label = `${itemNum}. ${item.item}`.substring(0, 80);
    
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`toggle_${creatorId}_${i}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary)
    );
    
    // Start new row every 5 buttons
    if (currentRow.components.length === BUTTONS_PER_ROW) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  }
  
  // Add remaining buttons if any
  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  // Add navigation buttons if needed (only if we have room - max 5 rows)
  if (totalPages > 1 && rows.length < 4) {
    const navRow = new ActionRowBuilder();
    
    if (page > 0) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`page_${creatorId}_prev`)
          .setLabel('◀️ Prev')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`page_${creatorId}_info`)
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    if (page < totalPages - 1) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`page_${creatorId}_next`)
          .setLabel('Next ▶️')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    rows.push(navRow);
  }

  // Add force finalize button (only for creator) - only if we have room
  if (rows.length < 5) {
    const finalizeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`force_finalize_${creatorId}`)
        .setLabel('🛑 Force Finish')
        .setStyle(ButtonStyle.Danger)
    );
    rows.push(finalizeRow);
  }

  return await channel.send({ embeds: [embed], components: rows });
}

/**
 * Update poll message with current claims
 */
async function updatePollMessage(session, channel) {
  try {
    const pollMsg = await channel.messages.fetch(session.pollMessageId);
    
    const { description, items, participants, payer, total, claims, currentPage, creatorId } = session;
    
    // Calculate who claimed what
    const claimedByUser = {}; // { userId: [{ item, price, index }] }
    const claimedItems = {}; // { itemIndex: [userId1, userId2, ...] }
    
    for (const [itemIdx, userClaims] of Object.entries(claims)) {
      for (const [userId, qty] of Object.entries(userClaims)) {
        if (qty > 0) {
          if (!claimedByUser[userId]) claimedByUser[userId] = [];
          claimedByUser[userId].push({
            item: items[itemIdx].item,
            price: items[itemIdx].price,
            index: parseInt(itemIdx)
          });
          if (!claimedItems[parseInt(itemIdx)]) claimedItems[parseInt(itemIdx)] = [];
          claimedItems[parseInt(itemIdx)].push(userId);
        }
      }
    }

    // Build claims summary
    let claimsSummary = '\n**📋 Current Claims:**\n';
    if (Object.keys(claimedByUser).length === 0) {
      claimsSummary += '_Belum ada yang claim_\n';
    } else {
      for (const participant of participants) {
        const userClaims = claimedByUser[participant.id];
        if (userClaims) {
          const totalClaimed = userClaims.reduce((sum, c) => sum + c.price, 0);
          claimsSummary += `<@${participant.id}>: ${userClaims.length} items (Rp ${totalClaimed.toLocaleString('id-ID')})\n`;
        } else {
          claimsSummary += `<@${participant.id}>: ❌ Belum claim\n`;
        }
      }
    }

    // Build items list for current page
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    const startIdx = currentPage * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, items.length);
    
    let itemsText = '';
    for (let i = startIdx; i < endIdx; i++) {
      const item = items[i];
      const claimerIds = claimedItems[i] || [];
      const claimIcon = claimerIds.length > 0 ? '✅' : '⬜';
      const claimers = claimerIds.length > 0 ? ` → ${claimerIds.map(id => `<@${id}>`).join(', ')}` : '';
      itemsText += `${claimIcon} \`${i + 1}\` ${item.item} — **Rp ${item.price.toLocaleString('id-ID')}**${claimers}\n`;
    }

    const participantList = participants.map(p => `<@${p.id}>`).join(', ');

    const embed = new EmbedBuilder()
      .setColor('#00D9FF')
      .setTitle('🗳️ Split Bill - Claim Items')
      .setDescription(
        `**${description}**\n\n` +
        `👥 **Participants:** ${participantList}\n` +
        `💳 **Bayar ke:** <@${payer.id}>\n` +
        `💰 **Total Struk:** Rp ${total.toLocaleString('id-ID')}\n\n` +
        `**Menu Items (Page ${currentPage + 1}/${totalPages}):**\n${itemsText}` +
        claimsSummary
      )
      .setFooter({ text: '⬇️ Klik nomor item untuk claim (klik lagi untuk unclaim)' });

    // Rebuild buttons with updated state - 5 buttons per row
    const rows = [];
    let currentRow = new ActionRowBuilder();
    
    for (let i = startIdx; i < endIdx; i++) {
      const item = items[i];
      const itemNum = i + 1;
      const claimerIds = claimedItems[i] || [];
      const isClaimed = claimerIds.length > 0;
      
      // Show full item name (Discord button label max 80 chars)
      const label = `${itemNum}. ${item.item}`.substring(0, 80);
      
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`toggle_${creatorId}_${i}`)
          .setLabel(label)
          .setStyle(isClaimed ? ButtonStyle.Success : ButtonStyle.Primary)
      );
      
      // Start new row every 5 buttons
      if (currentRow.components.length === BUTTONS_PER_ROW) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
    }
    
    // Add remaining buttons if any
    if (currentRow.components.length > 0) {
      rows.push(currentRow);
    }

    // Check if all participants have claimed
    const allClaimed = participants.every(p => claimedByUser[p.id]);
    
    // Navigation buttons (if room)
    if (totalPages > 1 && rows.length < 4) {
      const navRow = new ActionRowBuilder();
      
      if (currentPage > 0) {
        navRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`page_${creatorId}_prev`)
            .setLabel('◀️ Prev')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`page_${creatorId}_info`)
          .setLabel(`${currentPage + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      if (currentPage < totalPages - 1) {
        navRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`page_${creatorId}_next`)
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      rows.push(navRow);
    }

    // Finalize button (if room)
    if (rows.length < 5) {
      if (allClaimed && !session.graceTimerId) {
        // Start grace period
        const graceRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`grace_finalize_${creatorId}`)
            .setLabel('✅ Semua sudah claim! Finalize?')
            .setStyle(ButtonStyle.Success)
        );
        rows.push(graceRow);
        
        // Schedule auto-finalize after grace period
        const graceTimerId = setTimeout(async () => {
          await autoFinalizeBill(session, channel);
        }, GRACE_PERIOD);
        
        sessionManager.updateSession(creatorId, { graceTimerId });
      } else {
        const finalizeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`force_finalize_${creatorId}`)
            .setLabel('🛑 Force Finish')
            .setStyle(ButtonStyle.Danger)
        );
        rows.push(finalizeRow);
      }
    }

    await pollMsg.edit({ embeds: [embed], components: rows });

  } catch (error) {
    console.error('❌ Error updating poll message:', error);
  }
}

/**
 * Handle item claim button click (toggle: claim if not claimed, unclaim if already claimed by you)
 */
export async function handleItemClaim(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const { customId, user } = interaction;
  const [action, creatorId, itemIdxStr] = customId.split('_');
  const itemIdx = parseInt(itemIdxStr);

  // Get session by creatorId (from button customId)
  const session = sessionManager.getSession(creatorId);
  if (!session || session.state !== 'WAITING_VOTES') {
    await interaction.editReply({ content: '❌ Session tidak ditemukan atau sudah expired.' });
    return;
  }

  // Check if user is a participant
  const isParticipant = session.participants.some(p => p.id === user.id);
  if (!isParticipant) {
    await interaction.editReply({ 
      content: '❌ Kamu tidak termasuk dalam participants split bill ini!' 
    });
    return;
  }

  // Get item
  const item = session.items[itemIdx];
  if (!item) {
    await interaction.editReply({ content: '❌ Item tidak ditemukan.' });
    return;
  }

  // Initialize claims for this item if not exists
  if (!session.claims[itemIdx]) {
    session.claims[itemIdx] = {};
  }

  // Toggle logic for "toggle" action - allows multiple people to claim same item
  if (action === 'toggle') {
    const userAlreadyClaimed = session.claims[itemIdx]?.[user.id];
    
    if (userAlreadyClaimed) {
      // User already claimed this → unclaim
      delete session.claims[itemIdx][user.id];
      if (Object.keys(session.claims[itemIdx]).length === 0) {
        delete session.claims[itemIdx];
      }
      await interaction.editReply({ 
        content: `❌ Kamu unclaim **${item.item}**` 
      });
    } else {
      // Not claimed by user → claim it (multiple people can claim same item)
      session.claims[itemIdx][user.id] = 1;
      await interaction.editReply({ 
        content: `✅ Kamu claim **${item.item}** (Rp ${item.price.toLocaleString('id-ID')})` 
      });
    }
  } else if (action === 'claim') {
    // Legacy: Add claim
    session.claims[itemIdx][user.id] = 1;
    await interaction.editReply({ 
      content: `✅ Kamu claim **${item.item}** (Rp ${item.price.toLocaleString('id-ID')})` 
    });
  } else if (action === 'unclaim') {
    // Legacy: Remove claim
    delete session.claims[itemIdx][user.id];
    if (Object.keys(session.claims[itemIdx]).length === 0) {
      delete session.claims[itemIdx];
    }
    await interaction.editReply({ 
      content: `❌ Kamu unclaim **${item.item}**` 
    });
  }

  // Update session
  sessionManager.updateSession(creatorId, { claims: session.claims });

  // Update poll message
  await updatePollMessage(session, interaction.channel);
}

/**
 * Handle page navigation
 */
export async function handlePageNavigation(interaction) {
  await interaction.deferUpdate();

  const { customId } = interaction;
  const [_, creatorId, direction] = customId.split('_');

  const session = sessionManager.getSession(creatorId);
  if (!session) return;

  let newPage = session.currentPage;
  if (direction === 'prev' && newPage > 0) {
    newPage--;
  } else if (direction === 'next') {
    const totalPages = Math.ceil(session.items.length / ITEMS_PER_PAGE);
    if (newPage < totalPages - 1) {
      newPage++;
    }
  }

  sessionManager.updateSession(creatorId, { currentPage: newPage });
  
  // Need to re-fetch session to get updated page
  const updatedSession = sessionManager.getSession(creatorId);
  await updatePollMessage(updatedSession, interaction.channel);
}

/**
 * Handle force finalize (creator only)
 */
export async function handleForceFinalize(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const { customId, user } = interaction;
  const creatorId = customId.replace('force_finalize_', '');

  const session = sessionManager.getSession(creatorId);
  if (!session) {
    await interaction.editReply({ content: '❌ Session tidak ditemukan.' });
    return;
  }

  // Check if user is creator
  if (user.id !== creatorId) {
    await interaction.editReply({ 
      content: '❌ Hanya creator yang bisa force finalize!' 
    });
    return;
  }

  await interaction.editReply({ content: '⏳ Finalizing bill...' });

  // Clear grace timer if exists
  if (session.graceTimerId) {
    clearTimeout(session.graceTimerId);
  }

  await finalizeBill(session, interaction.channel);
}

/**
 * Handle grace period finalize
 */
export async function handleGraceFinalize(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const { customId } = interaction;
  const creatorId = customId.replace('grace_finalize_', '');

  const session = sessionManager.getSession(creatorId);
  if (!session) {
    await interaction.editReply({ content: '❌ Session tidak ditemukan.' });
    return;
  }

  // Clear grace timer
  if (session.graceTimerId) {
    clearTimeout(session.graceTimerId);
  }

  await interaction.editReply({ content: '⏳ Finalizing bill...' });
  await finalizeBill(session, interaction.channel);
}

/**
 * Auto-finalize after grace period
 */
async function autoFinalizeBill(session, channel) {
  try {
    await channel.send(`⏰ Grace period selesai. Memfinalisasi bill...`);
    await finalizeBill(session, channel);
  } catch (error) {
    console.error('❌ Error in autoFinalizeBill:', error);
  }
}

/**
 * Finalize bill and save to database
 */
async function finalizeBill(session, channel) {
  try {
    const { description, items, claims, payer, participants } = session;

    // Calculate totals per user
    const userTotals = {}; // { userId: { items: [...], total: number } }

    for (const [itemIdx, userClaims] of Object.entries(claims)) {
      for (const [userId, qty] of Object.entries(userClaims)) {
        if (qty > 0) {
          if (!userTotals[userId]) {
            userTotals[userId] = { items: [], total: 0 };
          }
          const item = items[itemIdx];
          userTotals[userId].items.push({
            name: item.item,
            price: item.price,
            qty
          });
          userTotals[userId].total += item.price * qty;
        }
      }
    }

    // Build summary
    let summaryText = '';
    let totalBill = 0;

    for (const participant of participants) {
      const userTotal = userTotals[participant.id];
      if (userTotal && participant.id !== payer.id) {
        const itemList = userTotal.items.map(i => 
          `  • ${i.name}${i.qty > 1 ? ` (${i.qty}x)` : ''} = Rp ${(i.price * i.qty).toLocaleString('id-ID')}`
        ).join('\n');
        
        summaryText += `<@${participant.id}>\n${itemList}\n**Total: Rp ${userTotal.total.toLocaleString('id-ID')}**\n\n`;
        totalBill += userTotal.total;
      }
    }

    if (totalBill === 0) {
      await channel.send('❌ Tidak ada tagihan (tidak ada yang claim atau semua claim oleh payer).');
      sessionManager.deleteSession(session.creatorId);
      return;
    }

    summaryText += `💳 **Bayar ke:** <@${payer.id}>`;

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('✅ Bill Finalized')
      .setDescription(`**${description}**\n\n${summaryText}`)
      .addFields({
        name: '💰 Total yang harus dibayar ke payer',
        value: `**Rp ${totalBill.toLocaleString('id-ID')}**`
      })
      .setFooter({ text: '💾 Disimpan ke database' });

    await channel.send({ embeds: [embed] });

    // Save to database
    await saveBillToDatabase(description, items, claims, payer, participants, session.guildId, session.channelId);

    // Clean up session
    sessionManager.deleteSession(session.creatorId);

    // Delete poll message
    try {
      const pollMsg = await channel.messages.fetch(session.pollMessageId);
      await pollMsg.delete();
    } catch (error) {
      console.error('Failed to delete poll message:', error);
    }

  } catch (error) {
    console.error('❌ Error finalizing bill:', error);
    await channel.send('❌ Gagal menyimpan bill.');
  }
}

/**
 * Save bill to database
 */
async function saveBillToDatabase(description, items, claims, payer, participants, guildId, channelId) {
  try {
    // Insert bill - use correct column names from schema
    const billResult = await query(
      `INSERT INTO bills (guild_id, channel_id, creator_id, creator_username, description, total_amount, status, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', NOW()) RETURNING id`,
      [guildId, channelId || '0', payer.id, payer.username, description, 0]
    );

    const billId = billResult.rows[0].id;

    let totalAmount = 0;

    // Insert items and participants
    for (const [itemIdx, userClaims] of Object.entries(claims)) {
      const item = items[itemIdx];
      
      // Insert item once
      const itemResult = await query(
        `INSERT INTO items (bill_id, item_name, price, created_at) 
         VALUES ($1, $2, $3, NOW()) RETURNING id`,
        [billId, item.item, item.price]
      );

      const itemId = itemResult.rows[0].id;
      
      // Insert participants who claimed this item
      for (const [userId, qty] of Object.entries(userClaims)) {
        if (qty > 0 && userId !== payer.id) {
          // Calculate share amount (split evenly among all claimers)
          const claimerCount = Object.keys(userClaims).length;
          const shareAmount = item.price / claimerCount;

          // Find participant
          const participant = participants.find(p => p.id === userId);
          if (!participant) continue;

          // Insert participant
          await query(
            `INSERT INTO participants (bill_id, item_id, user_id, username, share_amount, created_at) 
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [billId, itemId, userId, participant.username, shareAmount]
          );

          // Insert ledger entry
          await query(
            `INSERT INTO ledger (creditor_id, creditor_username, debtor_id, debtor_username, amount, guild_id, bill_id, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'unpaid', NOW())`,
            [payer.id, payer.username, userId, participant.username, shareAmount, guildId, billId]
          );

          totalAmount += shareAmount;
        }
      }
    }

    // Update bill total
    await query(
      `UPDATE bills SET total_amount = $1 WHERE id = $2`,
      [totalAmount, billId]
    );

    console.log(`✅ Bill saved to database (ID: ${billId})`);

  } catch (error) {
    console.error('❌ DB Error:', error);
    throw error;
  }
}

/**
 * Schedule reminder for users who haven't claimed
 */
function scheduleReminder(creatorId, channel) {
  setTimeout(async () => {
    const session = sessionManager.getSession(creatorId);
    if (!session || session.state !== 'WAITING_VOTES') return;

    // Check who hasn't claimed
    const claimedUserIds = new Set();
    for (const userClaims of Object.values(session.claims)) {
      for (const userId of Object.keys(userClaims)) {
        claimedUserIds.add(userId);
      }
    }

    const unclaimedUsers = session.participants.filter(p => !claimedUserIds.has(p.id));

    if (unclaimedUsers.length > 0) {
      const mentions = unclaimedUsers.map(u => `<@${u.id}>`).join(', ');
      await channel.send(
        `⏰ **Reminder!** ${mentions}\n` +
        `Kalian belum claim items untuk split bill: **"${session.description}"**\n` +
        `Silakan claim secepatnya!`
      );

      // Update last reminder time
      sessionManager.updateSession(creatorId, { lastReminderAt: Date.now() });

      // Schedule next reminder
      scheduleReminder(creatorId, channel);
    }

  }, REMINDER_INTERVAL);
}
