import { EmbedBuilder } from 'discord.js';
import visionService from '../services/visionService.js';
import sessionManager from '../utils/sessionManager.js';
import { parseNewFormat, looksLikeNewFormat } from '../utils/newParser.js';
import { query } from '../config/database.js';

/**
 * Split Bill Handler - New UX
 * 
 * Flow:
 * 1. User mentions bot + uploads image
 * 2. OCR extracts items
 * 3. User assigns with format:
 *    @user1, menu1 qty, menu2 qty
 *    @user2, menu1 qty
 *    bayar ke @payer
 *    
 *    OR: bagi rata bayar ke @payer
 * 
 * 4. Bot calculates and tags everyone with their bill
 * 5. React to confirm → save to database
 */

/**
 * Handle message with image attachment
 */
export async function handleSplitBillStart(message) {
  try {
    if (sessionManager.hasSession(message.author.id)) {
      await message.reply('⚠️ Kamu masih punya sesi aktif. Kirim "cancel" untuk membatalkan.');
      return;
    }

    const imageAttachment = message.attachments.find(att => 
      att.contentType?.startsWith('image/')
    );

    if (!imageAttachment) {
      await message.reply('❌ Upload foto struk bersamaan dengan mention bot!');
      return;
    }

    const processingMsg = await message.reply('⏳ Menganalisis struk...');

    try {
      const result = await visionService.extractItemsFromImage(imageAttachment.url);
      
      if (result.items.length === 0) {
        await processingMsg.edit(
          '❌ **Tidak ada item terdeteksi**\n\n' +
          'Pastikan:\n' +
          '• Foto struk jelas & tidak blur\n' +
          '• Ada daftar item dengan harga\n\n' +
          'Coba foto ulang!'
        );
        return;
      }

      // Extract restaurant/store name if available
      const storeName = result.storeName || null;

      // Create session
      sessionManager.createSession(message.author.id, message.guild.id, message.channel.id, {
        imageUrl: imageAttachment.url,
        items: result.items,
        totalAmount: result.total,
        storeName: storeName,
        rawText: result.rawText
      });

      // Build items list with numbers for easy reference
      const itemList = result.items.map((item, idx) => 
        `\`${idx + 1}\` ${item.item} — **Rp ${item.price.toLocaleString('id-ID')}**`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#00D166')
        .setTitle('🧾 Struk Berhasil Dibaca!')
        .setDescription(storeName ? `📍 **${storeName}**\n\n${itemList}` : itemList)
        .addFields({ 
          name: '💰 Total Struk', 
          value: `**Rp ${result.total.toLocaleString('id-ID')}**`,
          inline: true 
        })
        .addFields({
          name: '\n📝 Sekarang, assign siapa pesan apa:',
          value: '```\n' +
            '@user1, Chicken Ramen 1, Ocha 2\n' +
            '@user2, Beef Curry 1\n' +
            'bayar ke @yang_bayar\n' +
            '```\n' +
            '**Atau bagi rata:**\n' +
            '```\n@user1 @user2 @user3 bagi rata bayar ke @yang_bayar\n```\n' +
            '_Ketik "cancel" untuk batalkan_'
        })
        .setThumbnail(imageAttachment.url)
        .setFooter({ text: `💡 Mention semua orang yang ikut makan! • Sesi aktif 10 menit` });

      await processingMsg.delete();
      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('❌ Vision error:', error);
      await processingMsg.edit(`❌ **Error:** ${error.message}`);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await message.reply('❌ Terjadi error. Coba lagi.').catch(console.error);
  }
}

/**
 * Handle assignment from user
 */
export async function handleDescription(message) {
  try {
    const session = sessionManager.getSession(message.author.id);
    
    if (!session || session.state !== 'WAITING_DESCRIPTION') {
      return;
    }

    const text = message.content.trim();

    // Handle cancel
    if (text.toLowerCase() === 'cancel') {
      sessionManager.deleteSession(message.author.id);
      await message.reply('❌ Sesi dibatalkan.');
      return;
    }

    // Check if format is correct
    if (!looksLikeNewFormat(text)) {
      await message.reply(
        '❌ **Format tidak dikenali**\n\n' +
        'Gunakan format:\n' +
        '```\n@user1, menu1 qty, menu2 qty\n@user2, menu1 qty\nbayar ke @payer\n```\n' +
        'Atau:\n```\nbagi rata bayar ke @payer\n```'
      );
      return;
    }

    const processingMsg = await message.reply('🔄 Menghitung...');

    // Parse assignment
    const parsed = parseNewFormat(text, session.items, message);

    if (!parsed.success) {
      await processingMsg.edit(`❌ **Error:** ${parsed.error}`);
      return;
    }

    let billDetails = [];
    let totalBill = 0;

    if (parsed.type === 'split_equally') {
      // Split equally among all participants
      const perPerson = parsed.perPerson;
      
      for (const participant of parsed.participants) {
        if (participant.id !== parsed.payer.id) {
          billDetails.push({
            user: participant,
            items: [{ name: `Bagi rata (${parsed.participants.length} orang)`, qty: 1, price: perPerson }],
            total: perPerson
          });
          totalBill += perPerson;
        }
      }
    } else {
      // Individual assignments
      for (const assignment of parsed.assignments) {
        if (assignment.user.id !== parsed.payer.id) {
          billDetails.push({
            user: assignment.user,
            items: assignment.items,
            total: assignment.total
          });
          totalBill += assignment.total;
        }
      }
    }

    // Build the bill message with tags
    let billMessage = '';
    
    for (const bill of billDetails) {
      const itemList = bill.items.map(i => 
        `  • ${i.name}${i.qty > 1 ? ` (${i.qty}x)` : ''} = Rp ${(i.price * i.qty).toLocaleString('id-ID')}`
      ).join('\n');
      
      billMessage += `<@${bill.user.id}>\n${itemList}\n**Total: Rp ${bill.total.toLocaleString('id-ID')}**\n\n`;
    }

    billMessage += `💳 **Bayar ke:** <@${parsed.payer.id}>`;

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('📊 Ringkasan Tagihan')
      .setDescription(billMessage)
      .addFields({
        name: '💰 Total yang harus dibayar ke payer',
        value: `**Rp ${totalBill.toLocaleString('id-ID')}**`
      })
      .setFooter({ text: 'React ✅ untuk konfirmasi & simpan ke database' });

    await processingMsg.delete();
    const confirmMsg = await message.reply({ embeds: [embed] });

    await confirmMsg.react('✅');
    await confirmMsg.react('❌');

    // Update session
    sessionManager.updateSession(message.author.id, {
      state: 'WAITING_CONFIRMATION',
      parsed,
      billDetails,
      payer: parsed.payer,
      totalBill,
      confirmationMessageId: confirmMsg.id
    });

  } catch (error) {
    console.error('❌ Error in handleDescription:', error);
    await message.reply('❌ Gagal memproses. Coba lagi atau ketik "cancel".');
  }
}

/**
 * Handle confirmation reaction
 */
export async function handleConfirmation(reaction, user) {
  try {
    const sessionData = sessionManager.getSessionByMessageId(reaction.message.id);
    
    if (!sessionData) return;
    
    const { userId, session } = sessionData;

    if (user.id !== userId) return;
    if (session.state !== 'WAITING_CONFIRMATION') return;

    const emoji = reaction.emoji.name;

    if (emoji === '❌') {
      sessionManager.deleteSession(userId);
      await reaction.message.reply('❌ Dibatalkan.');
      return;
    }

    if (emoji === '✅') {
      const savingMsg = await reaction.message.reply('💾 Menyimpan...');

      try {
        const billId = await saveBillToDatabase(session, userId, reaction.message.guild.id);

        sessionManager.deleteSession(userId);
        
        // Tag everyone with their debt
        let tagMessage = '✅ **Tagihan Tercatat!**\n\n';
        
        for (const bill of session.billDetails) {
          tagMessage += `<@${bill.user.id}> hutang **Rp ${bill.total.toLocaleString('id-ID')}** ke <@${session.payer.id}>\n`;
        }
        
        tagMessage += `\n📝 Bill ID: \`#${billId}\`\n`;
        tagMessage += `💡 Ketik \`!utang\` untuk cek semua hutang`;

        await savingMsg.edit(tagMessage);

      } catch (dbError) {
        console.error('❌ DB Error:', dbError);
        await savingMsg.edit('❌ Gagal menyimpan. Coba lagi.');
      }
    }

  } catch (error) {
    console.error('❌ Confirmation error:', error);
  }
}

/**
 * Save bill to database
 */
async function saveBillToDatabase(session, creatorId, guildId) {
  try {
    // Insert bill
    const billResult = await query(
      `INSERT INTO bills (guild_id, channel_id, creator_id, creator_username, title, image_url, total_amount, status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', NOW())
       RETURNING id`,
      [
        guildId,
        session.channelId,
        creatorId,
        session.payer.username,
        session.storeName || `Split Bill ${new Date().toLocaleDateString('id-ID')}`,
        session.imageUrl,
        session.totalBill
      ]
    );

    const billId = billResult.rows[0].id;

    // Insert items
    for (const item of session.items) {
      await query(
        `INSERT INTO items (bill_id, item_name, price, quantity) VALUES ($1, $2, $3, 1)`,
        [billId, item.item, item.price]
      );
    }

    // Insert ledger entries (debts)
    for (const bill of session.billDetails) {
      await query(
        `INSERT INTO ledger (guild_id, debtor_id, debtor_username, creditor_id, creditor_username, amount, bill_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'unpaid')
         ON CONFLICT (guild_id, debtor_id, creditor_id, bill_id) DO UPDATE SET amount = EXCLUDED.amount`,
        [
          guildId,
          bill.user.id,
          bill.user.username,
          session.payer.id,
          session.payer.username,
          bill.total,
          billId
        ]
      );
    }

    console.log(`✅ Bill #${billId} saved`);
    return billId;

  } catch (error) {
    console.error('❌ Save error:', error);
    throw error;
  }
}

/**
 * Handle !utang command - show debts
 */
export async function handleUtangCommand(message) {
  try {
    const guildId = message.guild.id;
    const userId = message.author.id;

    // Get debts where user is debtor (owes money)
    const owesResult = await query(
      `SELECT creditor_id, creditor_username, SUM(amount) as total
       FROM ledger 
       WHERE guild_id = $1 AND debtor_id = $2 AND status = 'unpaid'
       GROUP BY creditor_id, creditor_username`,
      [guildId, userId]
    );

    // Get debts where user is creditor (owed money)
    const owedResult = await query(
      `SELECT debtor_id, debtor_username, SUM(amount) as total
       FROM ledger 
       WHERE guild_id = $1 AND creditor_id = $2 AND status = 'unpaid'
       GROUP BY debtor_id, debtor_username`,
      [guildId, userId]
    );

    let response = '';

    if (owesResult.rows.length > 0) {
      response += '💸 **Kamu hutang ke:**\n';
      for (const row of owesResult.rows) {
        response += `• <@${row.creditor_id}> — **Rp ${parseFloat(row.total).toLocaleString('id-ID')}**\n`;
      }
      response += '\n';
    }

    if (owedResult.rows.length > 0) {
      response += '💰 **Yang hutang ke kamu:**\n';
      for (const row of owedResult.rows) {
        response += `• <@${row.debtor_id}> — **Rp ${parseFloat(row.total).toLocaleString('id-ID')}**\n`;
      }
    }

    if (!response) {
      response = '✨ Tidak ada hutang tercatat!';
    }

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📒 Catatan Hutang')
      .setDescription(response)
      .setFooter({ text: `Ketik "!bayar @user" untuk tandai lunas` });

    await message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('❌ Utang command error:', error);
    await message.reply('❌ Gagal mengambil data hutang.');
  }
}

/**
 * Handle !bayar command - mark debt as paid
 */
export async function handleBayarCommand(message) {
  try {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const targetUser = message.mentions.users.first();

    if (!targetUser) {
      await message.reply('❌ Mention orang yang kamu bayar. Contoh: `!bayar @username`');
      return;
    }

    // Update ledger - mark as paid
    const result = await query(
      `UPDATE ledger 
       SET status = 'paid', settled_at = NOW()
       WHERE guild_id = $1 AND debtor_id = $2 AND creditor_id = $3 AND status = 'unpaid'
       RETURNING amount`,
      [guildId, userId, targetUser.id]
    );

    if (result.rows.length === 0) {
      await message.reply(`❌ Tidak ada hutang ke <@${targetUser.id}>`);
      return;
    }

    const totalPaid = result.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);

    await message.reply(
      `✅ **Lunas!**\n\n` +
      `<@${userId}> sudah bayar **Rp ${totalPaid.toLocaleString('id-ID')}** ke <@${targetUser.id}>`
    );

  } catch (error) {
    console.error('❌ Bayar command error:', error);
    await message.reply('❌ Gagal update status pembayaran.');
  }
}

/**
 * Handle !riwayat command - show bill history
 */
export async function handleRiwayatCommand(message) {
  try {
    const guildId = message.guild.id;

    const result = await query(
      `SELECT id, title, total_amount, creator_username, created_at
       FROM bills 
       WHERE guild_id = $1 AND status = 'confirmed'
       ORDER BY created_at DESC
       LIMIT 10`,
      [guildId]
    );

    if (result.rows.length === 0) {
      await message.reply('📭 Belum ada riwayat split bill.');
      return;
    }

    const history = result.rows.map(row => {
      const date = new Date(row.created_at).toLocaleDateString('id-ID');
      return `\`#${row.id}\` **${row.title}** — Rp ${parseFloat(row.total_amount).toLocaleString('id-ID')} (${date})`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📜 Riwayat Split Bill')
      .setDescription(history)
      .setFooter({ text: '10 transaksi terakhir' });

    await message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('❌ Riwayat command error:', error);
    await message.reply('❌ Gagal mengambil riwayat.');
  }
}
