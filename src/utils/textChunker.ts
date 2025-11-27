// src/utils/textChunker.ts

export class TextChunker {
  /**
   * Splits text into chunks of ~chunkSize characters, respecting sentence boundaries.
   */
  static split(text: string, chunkSize: number = 800, overlap: number = 100): string[] {
    if (!text) return [];
    
    // Split by rough sentence boundaries to avoid cutting words in half
    const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk.length + sentence.length) > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep the last 'overlap' characters for context continuity
        currentChunk = currentChunk.slice(-overlap) + sentence; 
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}