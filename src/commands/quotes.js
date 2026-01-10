import { pool } from "../db/pool.js";

export async function getQuote(message) {
    const result = await pool.query(
        "SELECT quote, name, year FROM quotes ORDER BY RANDOM() LIMIT 1"
    )

    if (result.rows.length === 0){
        await message.reply("Belum ada quote, silakan masukkan quote terlebih dahulu.")
    }

    const quote = result.rows[0]

    await message.channel.send(
        `${quote.quote}\n by ${quote.name} (${quote.year})`
    )  
}