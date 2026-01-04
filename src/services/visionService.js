import Groq from 'groq-sdk';
import fetch from 'node-fetch';

/**
 * Vision AI Service using Groq (Llama 3.2 Vision)
 * Multimodal: Directly extract items from receipt image
 * Free tier: 30 req/min, 14,400 req/day
 */

class VisionAIService {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.client = null;
    this.modelName = 'meta-llama/llama-4-scout-17b-16e-instruct'; // Vision model replacement
  }

  /**
   * Initialize Groq client
   */
  initClient() {
    if (!this.client) {
      this.client = new Groq({ apiKey: this.apiKey });
      console.log(`✅ Groq Vision initialized (${this.modelName})`);
    }
    return this.client;
  }

  /**
   * Download image as base64 data URL
   */
  async downloadImageAsBase64(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      
      // Detect mime type from URL or default to jpeg
      let mimeType = 'image/jpeg';
      if (imageUrl.includes('.png')) mimeType = 'image/png';
      else if (imageUrl.includes('.webp')) mimeType = 'image/webp';
      
      return { base64, mimeType };
    } catch (error) {
      console.error('❌ Image download error:', error);
      throw error;
    }
  }

  /**
   * Extract items from receipt image using Vision AI
   * @param {string} imageUrl - Discord attachment URL
   * @returns {Promise<Object>} - Extracted items with confidence
   */
  async extractItemsFromImage(imageUrl) {
    try {
      console.log('👁️  Starting Groq Vision extraction...');
      
      const client = this.initClient();
      const { base64, mimeType } = await this.downloadImageAsBase64(imageUrl);

      const prompt = `Kamu adalah AI expert untuk extract data dari struk belanja Indonesia.

**TASK:** Analisis gambar struk ini dan extract SEMUA item dengan harga.

**OUTPUT FORMAT (HARUS JSON array):**
\`\`\`json
[
  {"item": "Nama Item", "price": 15000},
  {"item": "Item Lain", "price": 5000}
]
\`\`\`

**RULES:**
1. Extract SEMUA item makanan/minuman dengan harganya
2. JANGAN include: SUBTOTAL, TOTAL, PB1, PPN, TAX, SERVICE CHARGE, GRAND TOTAL
3. Jika ada quantity (misal "2 x Nasi Goreng"), expand jadi 2 entries terpisah
4. Fix typo obvious (misal "Chícken" → "Chicken")
5. Harga dalam format number (tidak pakai titik/koma)
6. Handle berbagai format: baris, kolom, tabel, dll
7. Jika ada item yang tidak jelas harganya, skip item tersebut

**PENTING:** 
- Return HANYA JSON array, TIDAK ADA teks lain
- Jangan hallucinate item yang tidak ada
- Pastikan semua price adalah number valid

Analisis gambar sekarang:`;

      const completion = await client.chat.completions.create({
        model: this.modelName,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2048
      });

      const text = completion.choices[0]?.message?.content || '';
      
      console.log('📄 Groq Vision raw response:', text.substring(0, 200));

      // Extract JSON from response
      let jsonText = text.trim();
      
      // Remove markdown code blocks if present
      if (jsonText.includes('```')) {
        const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) jsonText = match[1].trim();
      }
      
      // Try to find JSON array
      const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonText = arrayMatch[0];
      }

      const items = JSON.parse(jsonText);
      
      console.log(`✅ Groq Vision extracted ${items.length} items`);
      
      // Calculate total
      const total = items.reduce((sum, item) => sum + item.price, 0);
      
      return {
        items,
        total,
        confidence: 90,
        source: 'groq-vision',
        rawText: text
      };

    } catch (error) {
      console.error('❌ Groq Vision error:', error);
      throw error;
    }
  }

  /**
   * Cleanup - no resources to free
   */
  async cleanup() {
    console.log('✅ Groq Vision cleanup complete');
  }
}

// Export singleton
export default new VisionAIService();
