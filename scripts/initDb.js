import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeDatabase() {
  console.log('🔧 Initializing database...');
  
  try {
    // Read schema SQL file
    const schemaPath = path.join(__dirname, '../src/models/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    
    // Execute schema
    await pool.query(schemaSql);
    
    console.log('✅ Database tables created successfully!');
    console.log('📋 Tables: bills, items, participants, ledger');
    
    // Close connection
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();
