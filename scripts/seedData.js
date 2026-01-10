import pool from '../src/config/database.js';

/**
 * Seed dummy data untuk UAT/PAT
 * Data ini bisa dihapus dengan script clearSeeding.js
 */

async function seedData() {
  console.log('🌱 Starting data seeding...\n');
  
  try {
    // Discord IDs asli!
    const GUILD_ID = '1282348142808793089'; // Ganti dengan guild ID asli kalau mau
    const CHANNEL_ID = '1457050419288342753';
    
    const users = [
      { id: '399440250134593536', username: 'arrayofintegers' },
      { id: '620585995431051285', username: 'flaurossu' },
      { id: '718022906809942067', username: '_dzakiii_' },
      { id: '553836442065829898', username: 'wsnugroho' },
    ];

    // === BILL 1: Makan di Warteg (Confirmed) ===
    console.log('📝 Creating Bill #1: Warteg Bahari...');
    const bill1 = await pool.query(
      `INSERT INTO bills (guild_id, channel_id, creator_id, creator_username, title, description, image_url, total_amount, status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW())
       RETURNING id`,
      [GUILD_ID, CHANNEL_ID, users[0].id, users[0].username, 'Warteg Bahari', 
       'makan siang bareng after kelas', 'https://example.com/struk1.jpg', 85000]
    );
    const billId1 = bill1.rows[0].id;

    // Items untuk Bill 1
    await pool.query(
      `INSERT INTO items (bill_id, item_name, price, quantity) VALUES
       ($1, 'Nasi Putih', 5000, 3),
       ($1, 'Ayam Goreng', 15000, 2),
       ($1, 'Tempe Goreng', 3000, 2),
       ($1, 'Es Teh Manis', 3000, 3),
       ($1, 'Sayur Asem', 5000, 1)`,
      [billId1]
    );

    // Ledger untuk Bill 1 (Bob & Charlie hutang ke Alice)
    await pool.query(
      `INSERT INTO ledger (guild_id, debtor_id, debtor_username, creditor_id, creditor_username, amount, bill_id, status)
       VALUES 
       ($1, $2, $3, $4, $5, 28000, $6, 'unpaid'),
       ($1, $7, $8, $4, $5, 31000, $6, 'unpaid')`,
      [GUILD_ID, users[1].id, users[1].username, users[0].id, users[0].username, billId1,
       users[2].id, users[2].username]
    );
    console.log(`✅ Bill #${billId1} created with 2 debts\n`);

    // === BILL 2: Cafe (Confirmed) ===
    console.log('📝 Creating Bill #2: Kopi Kenangan...');
    const bill2 = await pool.query(
      `INSERT INTO bills (guild_id, channel_id, creator_id, creator_username, title, description, image_url, total_amount, status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW() - INTERVAL '1 day')
       RETURNING id`,
      [GUILD_ID, CHANNEL_ID, users[1].id, users[1].username, 'Kopi Kenangan Sutos', 
       'ngopi sambil ngerjain tugas', 'https://example.com/struk2.jpg', 125000]
    );
    const billId2 = bill2.rows[0].id;

    await pool.query(
      `INSERT INTO items (bill_id, item_name, price, quantity) VALUES
       ($1, 'Kopi Kenangan Mantan', 35000, 2),
       ($1, 'Es Kopi Susu Tetangga', 28000, 1),
       ($1, 'Risoles Mayo', 15000, 2)`,
      [billId2]
    );

    // Ledger untuk Bill 2 (Alice & David hutang ke Bob)
    await pool.query(
      `INSERT INTO ledger (guild_id, debtor_id, debtor_username, creditor_id, creditor_username, amount, bill_id, status)
       VALUES 
       ($1, $2, $3, $4, $5, 50000, $6, 'unpaid'),
       ($1, $7, $8, $4, $5, 43000, $6, 'unpaid')`,
      [GUILD_ID, users[0].id, users[0].username, users[1].id, users[1].username, billId2,
       users[3].id, users[3].username]
    );
    console.log(`✅ Bill #${billId2} created with 2 debts\n`);

    // === BILL 3: Restoran (Confirmed & PAID) ===
    console.log('📝 Creating Bill #3: Ayam Geprek Bensu...');
    const bill3 = await pool.query(
      `INSERT INTO bills (guild_id, channel_id, creator_id, creator_username, title, description, image_url, total_amount, status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW() - INTERVAL '2 days')
       RETURNING id`,
      [GUILD_ID, CHANNEL_ID, users[2].id, users[2].username, 'Ayam Geprek Bensu', 
       'makan malam after rapat kelompok', 'https://example.com/struk3.jpg', 156000]
    );
    const billId3 = bill3.rows[0].id;

    await pool.query(
      `INSERT INTO items (bill_id, item_name, price, quantity) VALUES
       ($1, 'Geprek Level 5', 25000, 3),
       ($1, 'Es Jeruk', 8000, 3),
       ($1, 'Kentang Goreng', 15000, 2),
       ($1, 'Paket Nasi + Ayam', 35000, 1)`,
      [billId3]
    );

    // Ledger untuk Bill 3 (David hutang ke Charlie, sudah PAID)
    await pool.query(
      `INSERT INTO ledger (guild_id, debtor_id, debtor_username, creditor_id, creditor_username, amount, bill_id, status, settled_at)
       VALUES 
       ($1, $2, $3, $4, $5, 78000, $6, 'paid', NOW() - INTERVAL '1 day')`,
      [GUILD_ID, users[3].id, users[3].username, users[2].id, users[2].username, billId3]
    );
    console.log(`✅ Bill #${billId3} created with 1 paid debt\n`);

    // === BILL 4: Pending (Belum confirmed) ===
    console.log('📝 Creating Bill #4: McDonald\'s (PENDING)...');
    const bill4 = await pool.query(
      `INSERT INTO bills (guild_id, channel_id, creator_id, creator_username, title, description, image_url, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id`,
      [GUILD_ID, CHANNEL_ID, users[3].id, users[3].username, 'McDonald\'s', 
       'snack time pas lagi coding', 'https://example.com/struk4.jpg', 95000]
    );
    const billId4 = bill4.rows[0].id;

    await pool.query(
      `INSERT INTO items (bill_id, item_name, price, quantity) VALUES
       ($1, 'Big Mac', 45000, 1),
       ($1, 'Chicken McNuggets', 35000, 1),
       ($1, 'French Fries', 15000, 1)`,
      [billId4]
    );
    console.log(`✅ Bill #${billId4} created (pending, no ledger yet)\n`);

    // === BILL 5: Makan besar (Multiple people) ===
    console.log('📝 Creating Bill #5: Pizza Hut...');
    const bill5 = await pool.query(
      `INSERT INTO bills (guild_id, channel_id, creator_id, creator_username, title, description, image_url, total_amount, status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW() - INTERVAL '3 hours')
       RETURNING id`,
      [GUILD_ID, CHANNEL_ID, users[0].id, users[0].username, 'Pizza Hut Central Park', 
       'karaoke healing after UAS', 'https://example.com/struk5.jpg', 485000]
    );
    const billId5 = bill5.rows[0].id;

    await pool.query(
      `INSERT INTO items (bill_id, item_name, price, quantity) VALUES
       ($1, 'Super Supreme Large', 185000, 1),
       ($1, 'Beef Pepperoni Large', 165000, 1),
       ($1, 'Cheesy Bites', 45000, 2),
       ($1, 'Coca Cola 1L', 25000, 2)`,
      [billId5]
    );

    // Ledger untuk Bill 5 (3 orang hutang ke arrayofintegers)
    await pool.query(
      `INSERT INTO ledger (guild_id, debtor_id, debtor_username, creditor_id, creditor_username, amount, bill_id, status)
       VALUES 
       ($1, $2, $3, $4, $5, 161666, $6, 'unpaid'),
       ($1, $7, $8, $4, $5, 161667, $6, 'unpaid'),
       ($1, $9, $10, $4, $5, 161667, $6, 'unpaid')`,
      [GUILD_ID, users[1].id, users[1].username, users[0].id, users[0].username, billId5,
       users[2].id, users[2].username,
       users[3].id, users[3].username]
    );
    console.log(`✅ Bill #${billId5} created with 3 debts (split equally)\n`);

    // === SUMMARY ===
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ SEEDING COMPLETED!\n');
    console.log('📊 Summary:');
    console.log('   • 5 Bills created');
    console.log('   • 4 Confirmed, 1 Pending');
    console.log('   • 4 users: arrayofintegers, flaurossu, _dzakiii_, wsnugroho');
    console.log('   • Multiple debts between users');
    console.log('   • 1 debt marked as PAID');
    console.log('\n✅ User IDs are REAL! Tags will work in Discord.');
    console.log('   (Don\'t forget to set correct GUILD_ID if needed)');
    console.log('\n🧪 Test Commands:');
    console.log('   !utang    - Check debts');
    console.log('   !riwayat  - View history');
    console.log('   !bayar @user - Mark as paid');
    console.log('\n🗑️  To clear seeding data:');
    console.log('   node scripts/clearSeeding.js');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedData();
