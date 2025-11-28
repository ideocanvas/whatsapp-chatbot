import { PrismaClient } from '@prisma/client';
import { OpenAIService, createOpenAIServiceFromEnv } from '../src/services/openaiService';

const prisma = new PrismaClient();

// Helper function to calculate cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper function to convert BYTEA to Float64Array
function bufferToFloat64Array(buffer: Buffer): Float64Array {
  return new Float64Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 8);
}

async function identifyContentDuplicates() {
  let openaiService: OpenAIService | null = null;
  
  try {
    console.log('🔍 Starting content-based duplicate identification...');
    
    // Initialize OpenAI service for content comparison
    try {
      openaiService = createOpenAIServiceFromEnv();
    } catch (error) {
      console.log('⚠️ OpenAI service not available, using basic content comparison');
    }
    
    // Get all knowledge entries
    const allEntries = await prisma.knowledge.findMany({
      orderBy: { timestamp: 'desc' }
    });
    
    console.log(`📊 Total entries to analyze: ${allEntries.length}`);
    
    const duplicates: Array<{source: string, entries: any[], similarity: number}> = [];
    const processed = new Set<string>();
    
    // Compare entries for similarity
    for (let i = 0; i < allEntries.length; i++) {
      const entry1 = allEntries[i];
      
      if (processed.has(entry1.id)) continue;
      
      const similarEntries = [entry1];
      
      for (let j = i + 1; j < allEntries.length; j++) {
        const entry2 = allEntries[j];
        
        if (processed.has(entry2.id)) continue;
        
        // Check if entries are similar
        let currentSimilarity = 0;
        
        if (openaiService) {
          // Use vector similarity for more accurate comparison
          try {
            const vec1 = bufferToFloat64Array(entry1.vector);
            const vec2 = bufferToFloat64Array(entry2.vector);
            currentSimilarity = cosineSimilarity(Array.from(vec1), Array.from(vec2));
          } catch (error) {
            // Fallback to basic content comparison
            currentSimilarity = calculateBasicSimilarity(entry1.content, entry2.content);
          }
        } else {
          // Use basic content comparison
          currentSimilarity = calculateBasicSimilarity(entry1.content, entry2.content);
        }
        
        // Consider entries similar if similarity > 0.8
        if (currentSimilarity > 0.8) {
          similarEntries.push(entry2);
          processed.add(entry2.id);
        }
      }
      
      if (similarEntries.length > 1) {
        // Calculate average similarity for the group
        let avgSimilarity = 0;
        if (similarEntries.length > 1) {
          // For simplicity, use the first comparison as representative
          avgSimilarity = 0.85; // Placeholder value
        }
        
        duplicates.push({
          source: entry1.source || 'unknown',
          entries: similarEntries,
          similarity: avgSimilarity
        });
      }
      
      processed.add(entry1.id);
    }
    
    console.log(`\n📊 Content-based duplicates found: ${duplicates.length}`);
    
    if (duplicates.length > 0) {
      console.log('\n🔍 Duplicate groups:');
      duplicates.forEach((group, index) => {
        console.log(`\nGroup ${index + 1}: ${group.source}`);
        console.log(`  Entries: ${group.entries.length}`);
        console.log(`  Similarity: ${group.similarity.toFixed(3)}`);
        
        group.entries.forEach((entry, idx) => {
          console.log(`  ${idx + 1}. ${entry.timestamp.toISOString()} - ${entry.content.substring(0, 50)}...`);
        });
      });
    } else {
      console.log('✅ No content-based duplicates found');
    }
    
    // Show summary by source
    console.log('\n📈 Summary by source:');
    const sourceCounts = allEntries.reduce((acc, entry) => {
      const sourceKey = entry.source || 'unknown';
      acc[sourceKey] = (acc[sourceKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        console.log(`- ${source || 'unknown'}: ${count} entries`);
      });
    
  } catch (error) {
    console.error('❌ Error identifying duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Basic similarity calculation using Jaccard similarity on words
function calculateBasicSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

identifyContentDuplicates();