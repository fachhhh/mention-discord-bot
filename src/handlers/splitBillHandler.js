import { EmbedBuilder } from 'discord.js';
import visionService from '../services/visionService.js';
import sessionManager from '../utils/sessionManager.js';
import { parseNewFormat, looksLikeNewFormat } from '../utils/newParser.js';
import { query } from '../config/database.js';

/**
 * Split Bill Handler - All-in-One Mode Only
 * 
 * Flow:
 * !split + image + multi-line message:
 *   keterangan
 *   @user1, item 1
 *   bayar ke @user2
 * 
 * Auto-parse everything in one shot!
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
      await message.reply('❌ Upload foto struk bersamaan dengan command !split!');
      return;
    }

    // Get message body (keterangan + assignment)
    const messageBody = message.content.replace(/!split/i, '').trim();

    if (!messageBody) {
      await message.reply(
        '❌ **Format salah! Harus satu pesan lengkap.**\n\n' +
        '**Format yang benar:**\n```\n!split\nkaraoke healing after UAS\n@user1, indocafe 1\n@user2, sari roti 1\nbayar ke @yang_bayar\n```\n' +
        '**Atau bagi rata:**\n```\n!split\nketerangan\n@user1 @user2 @user3 bagi rata bayar ke @payer\n```\n\n' +
        '✨ _Upload foto + ketik semuanya sekaligus!_'
      );
      return;
    }

    if (!looksLikeNewFormat(messageBody)) {
      await message.reply(
        '❌ **Format assignment tidak dikenali!**\n\n' +
        '**Format yang benar:**\n```\n!split\nketerangan\n@user1, item 1\n@user2, item 2\nbayar ke @yang_bayar\n```\n' +
        '**Atau bagi rata:**\n```\n!split\nketerangan\n@user1 @user2 bagi rata bayar ke @payer\n```\n\n' +
        '💡 _Pastikan ada mention dan "bayar ke"_'
      );
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

      await processingMsg.edit('🔄 Memproses pembagian...');

      // Parse message: first line = description, rest = assignment
      const lines = messageBody.split('\n');
      const description = lines[0].trim();
      const assignmentText = lines.slice(1).join('\n');

      if (!assignmentText.trim()) {
        await processingMsg.edit(
          '❌ **Assignment tidak ditemukan!**\n\n' +
          '**Format yang benar:**\n```\n!split\nketerangan\n@user1, item 1\nbayar ke @yang_bayar\n```'
        );
        return;
      }

      // Parse assignment
      const parsed = parseNewFormat(assignmentText, result.items, message);

      if (!parsed.success) {
        await processingMsg.edit(
          `❌ **Error:** ${parsed.error}\n\n` +
          `**Format yang benar:**\n\`\`\`\n!split\nketerangan\n@user1, indocafe 1\n@user2, sari roti 1\nbayar ke @payer\n\`\`\`\n\n` +
          `✨ _Item ga perlu exact, bot auto-match!_`
        );
        return;
      }

      // Calculate bills
      let billDetails = [];
      let totalBill = 0;

      if (parsed.type === 'split_equally') {
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

      // Build bill message
      let billMessage = '';
      for (const bill of billDetails) {
        const itemListMsg = bill.items.map(i => 
          `  • ${i.name}${i.qty > 1 ? ` (${i.qty}x)` : ''} = Rp ${(i.price * i.qty).toLocaleString('id-ID')}`
        ).join('\n');
        billMessage += `<@${bill.user.id}>\n${itemListMsg}\n**Total: Rp ${bill.total.toLocaleString('id-ID')}**\n\n`;
      }
      billMessage += `💳 **Bayar ke:** <@${parsed.payer.id}>`;

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`📊 ${description}`)
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

      // Create session for confirmation
      sessionManager.createSession(message.author.id, message.guild.id, message.channel.id, {
        imageUrl: imageAttachment.url,
        items: result.items,
        totalAmount: result.total,
        storeName: storeName,
        description: description,
        state: 'WAITING_CONFIRMATION',
        parsed,
        billDetails,
        payer: parsed.payer,
        totalBill,
        confirmationMessageId: confirmMsg.id
      });

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
    // Insert bill with description
    const billResult = await query(
      `INSERT INTO bills (guild_id, channel_id, creator_id, creator_username, title, description, image_url, total_amount, status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW())
       RETURNING id`,
      [
        guildId,
        session.channelId,
        creatorId,
        session.payer.username,
        session.storeName || `Split Bill ${new Date().toLocaleDateString('id-ID')}`,
        session.description || null, // User-provided description
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
 * Handle !utang command - show debts with detailed breakdown
 */
export async function handleUtangCommand(message) {
  try {
    const guildId = message.guild.id;
    const userId = message.author.id;

    // Get detailed debts where user owes money (with bill details)
    const owesResult = await query(
      `SELECT 
        l.creditor_id, l.creditor_username, l.amount, l.bill_id,
        b.id as bill_id_num, b.description, b.title, b.created_at,
        COALESCE(
          (SELECT json_agg(json_build_object('item', i.item_name, 'price', i.price))
           FROM items i
           JOIN participants p ON p.item_id = i.id
           WHERE p.bill_id = b.id AND p.user_id = l.debtor_id),
          '[]'::json
        ) as my_items
       FROM ledger l
       JOIN bills b ON b.id = l.bill_id
       WHERE l.guild_id = $1 AND l.debtor_id = $2 AND l.status = 'unpaid'
       ORDER BY b.created_at DESC`,
      [guildId, userId]
    );

    // Get total owed by others to this user
    const owedResult = await query(
      `SELECT debtor_id, debtor_username, SUM(amount) as total
       FROM ledger 
       WHERE guild_id = $1 AND creditor_id = $2 AND status = 'unpaid'
       GROUP BY debtor_id, debtor_username`,
      [guildId, userId]
    );

    const embeds = [];

    // === DEBTS USER OWES ===
    if (owesResult.rows.length > 0) {
      // Group by creditor
      const byCreditor = {};
      for (const row of owesResult.rows) {
        if (!byCreditor[row.creditor_id]) {
          byCreditor[row.creditor_id] = {
            username: row.creditor_username,
            bills: [],
            total: 0
          };
        }
        byCreditor[row.creditor_id].bills.push(row);
        byCreditor[row.creditor_id].total += parseFloat(row.amount);
      }

      for (const [creditorId, data] of Object.entries(byCreditor)) {
        const billsDetail = data.bills.map(bill => {
          const date = new Date(bill.created_at).toLocaleDateString('id-ID', { 
            day: 'numeric', 
            month: 'short' 
          });
          const desc = bill.description || bill.title || 'Split Bill';
          const billIdNum = bill.bill_id_num || bill.bill_id;
          return `**#${billIdNum} - ${desc}** _(${date})_\n` +
                 `   → Rp ${parseFloat(bill.amount).toLocaleString('id-ID')}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle(`💸 Hutang ke @${data.username}`)
          .setDescription(billsDetail)
          .addFields({
            name: '💰 Total Hutang',
            value: `**Rp ${data.total.toLocaleString('id-ID')}**`,
            inline: false
          })
          .setFooter({ text: `Ketik "!bayar ${billIdNum}" atau "!bayar ${desc}" untuk tandai lunas` });

        embeds.push(embed);
      }
    }

    // === MONEY OWED TO USER ===
    if (owedResult.rows.length > 0) {
      let owedText = '';
      let totalOwed = 0;
      
      for (const row of owedResult.rows) {
        const amount = parseFloat(row.total);
        totalOwed += amount;
        owedText += `<@${row.debtor_id}> → **Rp ${amount.toLocaleString('id-ID')}**\n`;
      }

      const embed = new EmbedBuilder()
        .setColor('#51CF66')
        .setTitle('💰 Yang Hutang ke Kamu')
        .setDescription(owedText)
        .addFields({
          name: '💵 Total yang Akan Diterima',
          value: `**Rp ${totalOwed.toLocaleString('id-ID')}**`
        });

      embeds.push(embed);
    }

    // === NO DEBTS ===
    if (embeds.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#51CF66')
        .setTitle('✨ Bebas Hutang!')
        .setDescription('Tidak ada hutang tercatat saat ini.');
      
      embeds.push(embed);
    }

    await message.reply({ embeds });

  } catch (error) {
    console.error('❌ Utang command error:', error);
    await message.reply('❌ Gagal mengambil data hutang.');
  }
}

/**
 * Handle !bayar command - mark debt as paid
 * Supports: !bayar @user, !bayar 123 (bill ID), !bayar description text
 */
export async function handleBayarCommand(message) {
  try {
    const guildId = message.guild.id;
    const userId = message.author.id;
    
    // Parse command: !bayar @user | !bayar 123 | !bayar description text
    const content = message.content.replace(/!bayar/i, '').trim();
    const targetUser = message.mentions.users.first();

    if (!content) {
      await message.reply(
        '❌ **Format salah!**\n\n' +
        '**Cara pakai:**\n' +
        '• `!bayar @username` - bayar semua hutang ke user\n' +
        '• `!bayar 123` - bayar bill dengan ID #123\n' +
        '• `!bayar nobar bioskop avatar` - bayar bill dengan deskripsi'
      );
      return;
    }

    let result;
    let paymentType;
    let billDescription;

    // Case 1: !bayar @user (mention)
    if (targetUser) {
      result = await query(
        `UPDATE ledger 
         SET status = 'paid', settled_at = NOW()
         WHERE guild_id = $1 AND debtor_id = $2 AND creditor_id = $3 AND status = 'unpaid'
         RETURNING amount`,
        [guildId, userId, targetUser.id]
      );
      paymentType = 'user';
    } 
    // Case 2: !bayar 123 (numeric bill ID)
    else if (/^\d+$/.test(content)) {
      const billId = parseInt(content);
      result = await query(
        `UPDATE ledger 
         SET status = 'paid', settled_at = NOW()
         WHERE guild_id = $1 AND debtor_id = $2 AND bill_id = $3 AND status = 'unpaid'
         RETURNING amount, creditor_id, bill_id`,
        [guildId, userId, billId]
      );
      
      if (result.rows.length > 0) {
        // Get bill description
        const billInfo = await query(
          `SELECT description, title FROM bills WHERE id = $1`,
          [billId]
        );
        billDescription = billInfo.rows[0]?.description || billInfo.rows[0]?.title || `Bill #${billId}`;
      }
      paymentType = 'billId';
    }
    // Case 3: !bayar description text
    else {
      const searchDesc = content.toLowerCase();
      result = await query(
        `UPDATE ledger 
         SET status = 'paid', settled_at = NOW()
         WHERE guild_id = $1 
           AND debtor_id = $2 
           AND bill_id IN (
             SELECT id FROM bills 
             WHERE LOWER(description) LIKE $3 OR LOWER(title) LIKE $3
           )
           AND status = 'unpaid'
         RETURNING amount, creditor_id, bill_id`,
        [guildId, userId, `%${searchDesc}%`]
      );
      
      if (result.rows.length > 0) {
        // Get bill description
        const billInfo = await query(
          `SELECT description, title FROM bills WHERE id = $1`,
          [result.rows[0].bill_id]
        );
        billDescription = billInfo.rows[0]?.description || billInfo.rows[0]?.title || 'Split Bill';
      }
      paymentType = 'description';
    }

    // Check if payment was successful
    if (!result || result.rows.length === 0) {
      if (paymentType === 'user') {
        await message.reply(`❌ Tidak ada hutang ke <@${targetUser.id}>`);
      } else if (paymentType === 'billId') {
        await message.reply(`❌ Tidak ada hutang untuk Bill ID #${content}, atau bill tidak ditemukan.`);
      } else {
        await message.reply(`❌ Tidak ada hutang dengan deskripsi "${content}"`);
      }
      return;
    }

    // Calculate total paid and get creditor
    const totalPaid = result.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);
    const creditorId = result.rows[0].creditor_id;
    const billId = result.rows[0].bill_id;

    // Build response message
    let responseMsg = `✅ **Lunas!**\n\n`;
    
    if (paymentType === 'user') {
      responseMsg += `<@${userId}> sudah bayar **Rp ${totalPaid.toLocaleString('id-ID')}** ke <@${targetUser.id}>`;
    } else {
      responseMsg += `<@${userId}> sudah bayar **Rp ${totalPaid.toLocaleString('id-ID')}** ke <@${creditorId}>\n`;
      responseMsg += `📝 **${billDescription}** (Bill #${billId})`;
    }

    await message.reply(responseMsg);

  } catch (error) {
    console.error('❌ Bayar command error:', error);
    await message.reply('❌ Gagal update status pembayaran.');
  }
}
