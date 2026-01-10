import pool from '../src/config/database.js';

/**
 * Clear/hapus semua data seeding untuk UAT/PAT
 * HATI-HATI: Ini akan menghapus semua data di database!
 */

async function clearSeeding() {
  console.log('🗑️  Clearing seeding data...\n');
  
  try {
    // Konfirmasi
    console.log('⚠️  WARNING: This will delete ALL data from the database!');
    console.log('   Including: bills, items, participants, and ledger\n');

    // Hapus data (cascade akan otomatis hapus items & participants)
    console.log('Deleting ledger entries...');
    const ledgerResult = await pool.query('DELETE FROM ledger RETURNING id');
    console.log(`✅ Deleted ${ledgerResult.rowCount} ledger entries`);

    console.log('Deleting participants...');
    const participantsResult = await pool.query('DELETE FROM participants RETURNING id');
    console.log(`✅ Deleted ${participantsResult.rowCount} participants`);

    console.log('Deleting items...');
    const itemsResult = await pool.query('DELETE FROM items RETURNING id');
    console.log(`✅ Deleted ${itemsResult.rowCount} items`);

    console.log('Deleting bills...');
    const billsResult = await pool.query('DELETE FROM bills RETURNING id');
    console.log(`✅ Deleted ${billsResult.rowCount} bills`);

    // Reset sequences (auto-increment)
    console.log('\nResetting auto-increment sequences...');
    await pool.query('ALTER SEQUENCE bills_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE items_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE participants_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE ledger_id_seq RESTART WITH 1');
    console.log('✅ Sequences reset');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ DATABASE CLEARED SUCCESSFULLY!');
    console.log('   All tables are now empty and ready for fresh data.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Clear failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

clearSeeding();
