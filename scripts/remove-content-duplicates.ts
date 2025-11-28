import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to calculate basic content similarity
function calculateBasicSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

async function removeContentDuplicates() {
  try {
    console.log('🧹 Starting content-based duplicate removal...');
    
    // Get all knowledge entries ordered by timestamp (newest first)
    const allEntries = await prisma.knowledge.findMany({
      orderBy: { timestamp: 'desc' }
    });
    
    console.log(`📊 Total entries to analyze: ${allEntries.length}`);
    
    const entriesToDelete: string[] = []; // IDs of entries to delete
    const processed = new Set<string>();
    
    // Identify content-based duplicates
    for (let i = 0; i < allEntries.length; i++) {
      const entry1 = allEntries[i];
      
      if (processed.has(entry1.id)) continue;
      
      // Skip if this entry is already marked for deletion
      if (entriesToDelete.includes(entry1.id)) continue;
      
      for (let j = i + 1; j < allEntries.length; j++) {
        const entry2 = allEntries[j];
        
        if (processed.has(entry2.id)) continue;
        if (entriesToDelete.includes(entry2.id)) continue;
        
        // Check if entries have similar content
        const similarity = calculateBasicSimilarity(entry1.content, entry2.content);
        
        // Consider entries duplicates if similarity > 0.7
        if (similarity > 0.7) {
          console.log(`🔍 Found similar entries: ${entry1.source} (similarity: ${similarity.toFixed(3)})`);
          console.log(`   Keeping: ${entry1.timestamp.toISOString()}`);
          console.log(`   Deleting: ${entry2.timestamp.toISOString()}`);
          
          // Mark the older entry for deletion
          entriesToDelete.push(entry2.id);
          processed.add(entry2.id);
        }
      }
      
      processed.add(entry1.id);
    }
    
    console.log(`\n🗑️  Entries to remove: ${entriesToDelete.length}`);
    
    if (entriesToDelete.length === 0) {
      console.log('✅ No content-based duplicates found to remove');
      return;
    }
    
    // Remove the duplicate entries
    let removedCount = 0;
    for (const entryId of entriesToDelete) {
      try {
        await prisma.knowledge.delete({
          where: { id: entryId }
        });
        removedCount++;
        console.log(`✅ Removed duplicate entry: ${entryId}`);
      } catch (error) {
        console.error(`❌ Failed to remove entry ${entryId}:`, error);
      }
    }
    
    console.log(`\n🎉 Duplicate removal completed!`);
    console.log(`📊 Total entries removed: ${removedCount}`);
    
    // Verify the cleanup
    const finalCount = await prisma.knowledge.count();
    console.log(`📈 Final knowledge entries count: ${finalCount}`);
    
    // Show remaining entries by source
    const remainingEntries = await prisma.knowledge.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10
    });
    
    console.log('\n📝 Recent remaining entries:');
    remainingEntries.forEach(entry => {
      console.log(`- ${entry.source || 'unknown'} - ${entry.timestamp.toISOString()}`);
    });
    
  } catch (error) {
    console.error('❌ Error removing duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeContentDuplicates();