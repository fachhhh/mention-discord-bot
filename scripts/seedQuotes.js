import { pool } from '../src/db/pool.js';

/**
 * Seed quotes data untuk testing command !quote
 */

async function seedQuotes() {
  console.log('📚 Seeding quotes data...\n');
  
  try {
    // Cek apakah table quotes ada
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'quotes'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Creating quotes table...');
      await pool.query(`
        CREATE TABLE quotes (
          id SERIAL PRIMARY KEY,
          quote TEXT NOT NULL,
          name VARCHAR(255) NOT NULL,
          year INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ Quotes table created\n');
    }

    // Insert dummy quotes
    const quotes = [
      { quote: "The only way to do great work is to love what you do.", name: "Steve Jobs", year: 2005 },
      { quote: "Innovation distinguishes between a leader and a follower.", name: "Steve Jobs", year: 1998 },
      { quote: "Life is what happens when you're busy making other plans.", name: "John Lennon", year: 1980 },
      { quote: "The future belongs to those who believe in the beauty of their dreams.", name: "Eleanor Roosevelt", year: 1960 },
      { quote: "It is during our darkest moments that we must focus to see the light.", name: "Aristotle", year: -350 },
      { quote: "Be yourself; everyone else is already taken.", name: "Oscar Wilde", year: 1890 },
      { quote: "Two things are infinite: the universe and human stupidity.", name: "Albert Einstein", year: 1929 },
      { quote: "In three words I can sum up everything I've learned about life: it goes on.", name: "Robert Frost", year: 1942 },
      { quote: "The only impossible journey is the one you never begin.", name: "Tony Robbins", year: 2010 },
      { quote: "Success is not final, failure is not fatal: It is the courage to continue that counts.", name: "Winston Churchill", year: 1941 }
    ];

    for (const q of quotes) {
      await pool.query(
        'INSERT INTO quotes (quote, name, year) VALUES ($1, $2, $3)',
        [q.quote, q.name, q.year]
      );
    }

    console.log(`✅ Inserted ${quotes.length} quotes\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ QUOTES SEEDING COMPLETED!');
    console.log('\n🧪 Test with: !quote');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Quotes seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedQuotes();
