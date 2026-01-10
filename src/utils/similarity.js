/**
 * Text similarity utilities for fuzzy item matching
 */

/**
 * Convert text to vector (bag of words)
 */
function textToVector(text) {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter(w => w.length > 0);
  
  const vector = {};
  for (const word of words) {
    vector[word] = (vector[word] || 0) + 1;
  }
  return vector;
}

/**
 * Calculate cosine similarity between two text strings
 */
export function cosineSimilarity(text1, text2) {
  const vec1 = textToVector(text1);
  const vec2 = textToVector(text2);
  
  // Get all unique words
  const allWords = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
  
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  for (const word of allWords) {
    const val1 = vec1[word] || 0;
    const val2 = vec2[word] || 0;
    
    dotProduct += val1 * val2;
    magnitude1 += val1 * val1;
    magnitude2 += val2 * val2;
  }
  
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  
  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Find best matching item from OCR items list
 * Returns { item, score } or null if no good match
 */
export function findBestMatch(userInput, ocrItems, threshold = 0.5) {
  let bestMatch = null;
  let bestScore = 0;
  
  for (const item of ocrItems) {
    const score = cosineSimilarity(userInput, item.item);
    
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = item;
    }
  }
  
  return bestMatch ? { item: bestMatch, score: bestScore } : null;
}

/**
 * Match user input with OCR items (case insensitive, flexible)
 * Returns the matched OCR item or null
 */
export function matchItem(userInput, ocrItems) {
  const input = userInput.trim().toLowerCase();
  
  // 1. Try exact match first (case insensitive)
  for (const item of ocrItems) {
    if (item.item.toLowerCase() === input) {
      return item;
    }
  }
  
  // 2. Try substring match
  for (const item of ocrItems) {
    const itemName = item.item.toLowerCase();
    if (itemName.includes(input) || input.includes(itemName)) {
      return item;
    }
  }
  
  // 3. Use cosine similarity for fuzzy match
  const match = findBestMatch(userInput, ocrItems, 0.4); // Lower threshold for flexibility
  return match ? match.item : null;
}

/**
 * Match multiple items at once
 * Returns array of { userInput, matchedItem, notFound }
 */
export function matchItems(userInputs, ocrItems) {
  const results = [];
  
  for (const userInput of userInputs) {
    const matched = matchItem(userInput, ocrItems);
    
    results.push({
      userInput,
      matchedItem: matched,
      notFound: !matched
    });
  }
  
  return results;
}
