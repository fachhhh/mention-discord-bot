# Split Bill Discord Bot

Bot Discord untuk split bill dari foto struk dengan OCR + AI parsing.

## Features
✅ **Cloud OCR** (OCR.space API - 25,000 free/month)  
✅ **Fallback to Tesseract** (if cloud fails)  
✅ AI parsing deskripsi natural (Groq API - Llama 3.1)  
✅ Multi-step conversation flow  
✅ Debt calculation & minimization  
✅ PostgreSQL ledger tracking  

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` ke `.env` dan isi:
```env
DISCORD_TOKEN=your_discord_bot_token
DB_URL=postgresql://user:password@host:5432/database
GROQ_API_KEY=your_groq_api_key
PORT=3000
```

**Get Groq API Key (GRATIS):**
1. Daftar di https://console.groq.com
2. Create API Key
3. Copy ke `.env`

### 3. Initialize Database
```bash
npm run init-db
```

### 4. Run Bot
```bash
npm start
```

## Usage

### Split Bill Flow
1. **Upload struk + mention bot:**
   ```
   @BotName [upload foto struk]
   ```

2. **Bot proses OCR & tampilkan items**

3. **Jelaskan siapa pesan apa:**
   ```
   aku pesan nasi goreng, @budi pesan es teh
   ```
   atau
   ```
   semuanya dibagi rata
   ```

4. **Konfirmasi dengan react ✅ atau ❌**

5. **Done! Utang tercatat di database**

### Commands
- `cancel` - Batalkan transaksi aktif
- `!ledger` - Cek utang (coming soon)

## Tech Stack
- **Node.js** + discord.js v14
- **OCR.space API** - Cloud OCR (25K free/month)
- **Tesseract.js** - Fallback OCR
- **Groq API** - AI parsing (Llama 3.1 8B)
- **PostgreSQL** (Neon) - Database
- **Sharp** - Image preprocessing

## Architecture
```
src/
├── index.js              # Main bot entry
├── config/
│   └── database.js       # PostgreSQL connection
├── services/
│   ├── ocrService.js     # Tesseract OCR
│   └── aiService.js      # Groq AI parsing
├── handlers/
│   └── splitBillHandler.js  # Main flow orchestration
├── utils/
│   ├── sessionManager.js    # Session tracking
│   └── debtCalculator.js    # Debt settlement logic
└── models/
    └── schema.sql        # Database schema
```

## Database Schema
- `bills` - Transaction records
- `items` - Items in each bill
- `participants` - Who ordered what
- `ledger` - Debt tracking

## Deployment
Works on:
- Railway (512MB RAM)
- Render (free tier)
- Fly.io
- Any VPS with Node.js

## Notes
- OCR confidence varies (60-90%) depending on image quality
- AI fallback to "split equally" if description ambiguous
- Session expires after 10 minutes
- Groq free tier: 30 req/min (sufficient for small servers)

## Troubleshooting

**OCR gagal / hasil jelek:**
- Foto struk dengan pencahayaan bagus
- Pastikan tidak blur
- Foto tegak lurus (tidak miring)

**AI parsing salah:**
- Gunakan format lebih jelas
- Mention user dengan @username
- Atau pilih "dibagi rata" saja

**Database error:**
- Check DB_URL di `.env`
- Run `npm run init-db` ulang

## Future Features
- [ ] `!ledger` command - View all debts
- [ ] `!pay` command - Mark debt as paid
- [ ] Multiple currency support
- [ ] Export to CSV
- [ ] Tax & service charge handling
