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

async function removeDocumentDuplicates() {
  try {
    console.log('🧹 Starting Document table duplicate removal...');
    
    // Get all Document entries ordered by creation date (newest first)
    const allDocuments = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`📊 Total Document entries to analyze: ${allDocuments.length}`);
    
    const entriesToDelete: string[] = []; // IDs of entries to delete
    const processed = new Set<string>();
    
    // Identify content-based duplicates
    for (let i = 0; i < allDocuments.length; i++) {
      const doc1 = allDocuments[i];
      
      if (processed.has(doc1.id)) continue;
      
      // Skip if this entry is already marked for deletion
      if (entriesToDelete.includes(doc1.id)) continue;
      
      for (let j = i + 1; j < allDocuments.length; j++) {
        const doc2 = allDocuments[j];
        
        if (processed.has(doc2.id)) continue;
        if (entriesToDelete.includes(doc2.id)) continue;
        
        // Check if documents have similar content
        const similarity = calculateBasicSimilarity(doc1.content, doc2.content);
        
        // Consider documents duplicates if similarity > 0.8
        if (similarity > 0.8) {
          console.log(`🔍 Found similar documents: ${doc1.source} (similarity: ${similarity.toFixed(3)})`);
          console.log(`   Keeping: ${doc1.createdAt.toISOString()} - "${doc1.title?.substring(0, 40)}..."`);
          console.log(`   Deleting: ${doc2.createdAt.toISOString()} - "${doc2.title?.substring(0, 40)}..."`);
          
          // Mark the older entry for deletion
          entriesToDelete.push(doc2.id);
          processed.add(doc2.id);
        }
      }
      
      processed.add(doc1.id);
    }
    
    console.log(`\n🗑️  Document entries to remove: ${entriesToDelete.length}`);
    
    if (entriesToDelete.length === 0) {
      console.log('✅ No Document duplicates found to remove');
      return;
    }
    
    // Remove the duplicate entries
    let removedCount = 0;
    for (const docId of entriesToDelete) {
      try {
        await prisma.document.delete({
          where: { id: docId }
        });
        removedCount++;
        if (removedCount % 50 === 0) {
          console.log(`✅ Removed ${removedCount} duplicate entries...`);
        }
      } catch (error) {
        console.error(`❌ Failed to remove document ${docId}:`, error);
      }
    }
    
    console.log(`\n🎉 Document duplicate removal completed!`);
    console.log(`📊 Total Document entries removed: ${removedCount}`);
    
    // Verify the cleanup
    const finalCount = await prisma.document.count();
    console.log(`📈 Final Document entries count: ${finalCount}`);
    
    // Show remaining entries by source
    const remainingEntries = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    console.log('\n📝 Recent remaining Document entries:');
    remainingEntries.forEach(doc => {
      console.log(`- ${doc.source} [${doc.category}] - "${doc.title?.substring(0, 30)}..." - ${doc.createdAt.toISOString()}`);
    });
    
  } catch (error) {
    console.error('❌ Error removing Document duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeDocumentDuplicates();