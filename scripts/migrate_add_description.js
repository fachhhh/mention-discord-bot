import pool from '../src/config/database.js';

/**
 * Migration: Add description column to bills table
 */

async function addDescriptionColumn() {
  console.log('🔄 Running migration: Add description column to bills table...\n');
  
  try {
    // Check if column already exists
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'bills' AND column_name = 'description';
    `);

    if (checkColumn.rows.length > 0) {
      console.log('✅ Column "description" already exists in bills table.');
    } else {
      // Add description column
      await pool.query(`
        ALTER TABLE bills 
        ADD COLUMN description TEXT;
      `);
      console.log('✅ Column "description" added to bills table successfully!');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ MIGRATION COMPLETED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addDescriptionColumn();
