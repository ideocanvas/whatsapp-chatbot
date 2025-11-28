import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeDuplicates() {
  try {
    console.log('🧹 Starting duplicate removal process...');
    
    // First, get all duplicate sources
    const duplicates = await prisma.$queryRaw<Array<{source: string, count: number}>>`
      SELECT source, COUNT(*) as count
      FROM "Knowledge"
      GROUP BY source
      HAVING COUNT(*) > 1
    `;
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicates found to remove');
      return;
    }
    
    console.log(`📊 Found ${duplicates.length} sources with duplicates`);
    
    let totalRemoved = 0;
    
    // Process each duplicate source
    for (const dup of duplicates) {
      console.log(`\n🔧 Processing: ${dup.source} (${dup.count} entries)`);
      
      // Get all entries for this source, ordered by timestamp (newest first)
      const entries = await prisma.knowledge.findMany({
        where: { source: dup.source },
        orderBy: { timestamp: 'desc' }
      });
      
      if (entries.length <= 1) continue;
      
      // Keep the most recent entry, delete the rest
      const entriesToDelete = entries.slice(1); // All except the first (most recent)
      
      console.log(`🗑️  Removing ${entriesToDelete.length} duplicate entries`);
      
      // Delete the duplicate entries
      for (const entry of entriesToDelete) {
        await prisma.knowledge.delete({
          where: { id: entry.id }
        });
        totalRemoved++;
      }
      
      console.log(`✅ Kept most recent entry from ${dup.source}`);
    }
    
    console.log(`\n🎉 Duplicate removal completed!`);
    console.log(`📊 Total entries removed: ${totalRemoved}`);
    
    // Verify the cleanup
    const remainingDuplicates = await prisma.$queryRaw<Array<{source: string, count: number}>>`
      SELECT source, COUNT(*) as count
      FROM "Knowledge"
      GROUP BY source
      HAVING COUNT(*) > 1
    `;
    
    if (remainingDuplicates.length === 0) {
      console.log('✅ All duplicates successfully removed');
    } else {
      console.log('⚠️ Some duplicates may remain:', remainingDuplicates);
    }
    
    const finalCount = await prisma.knowledge.count();
    console.log(`📈 Final knowledge entries count: ${finalCount}`);
    
  } catch (error) {
    console.error('❌ Error removing duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeDuplicates();