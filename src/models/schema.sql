-- Bills table: Main transaction records
CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    creator_id VARCHAR(20) NOT NULL,
    creator_username VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    description TEXT, -- User-friendly description: "karaoke healing after UAS", "makan siang bareng", etc.
    image_url TEXT,
    ocr_result TEXT,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, confirmed, cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP
);

-- Items table: Individual items in a bill
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Participants table: Who ordered what
CREATE TABLE IF NOT EXISTS participants (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    username VARCHAR(100) NOT NULL,
    share_amount DECIMAL(10, 2) NOT NULL, -- How much this person owes for this item
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ledger table: Debt tracking between users
CREATE TABLE IF NOT EXISTS ledger (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    debtor_id VARCHAR(20) NOT NULL,
    debtor_username VARCHAR(100) NOT NULL,
    creditor_id VARCHAR(20) NOT NULL,
    creditor_username VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'unpaid', -- unpaid, paid, settled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMP,
    UNIQUE(guild_id, debtor_id, creditor_id, bill_id)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_bills_guild ON bills(guild_id);
CREATE INDEX IF NOT EXISTS idx_bills_creator ON bills(creator_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_items_bill ON items(bill_id);
CREATE INDEX IF NOT EXISTS idx_participants_bill ON participants(bill_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_guild ON ledger(guild_id);
CREATE INDEX IF NOT EXISTS idx_ledger_debtor ON ledger(debtor_id);
CREATE INDEX IF NOT EXISTS idx_ledger_creditor ON ledger(creditor_id);
CREATE INDEX IF NOT EXISTS idx_ledger_status ON ledger(status);
