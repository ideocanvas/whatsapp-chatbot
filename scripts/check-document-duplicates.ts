import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDocumentDuplicates() {
  try {
    console.log('🔍 Checking Document table for duplicates...');
    
    // Check for duplicate sources in Document table
    const duplicates = await prisma.$queryRaw<Array<{source: string, count: number}>>`
      SELECT source, COUNT(*) as count 
      FROM "Document" 
      GROUP BY source 
      HAVING COUNT(*) > 1
    `;
    
    console.log('📊 Document table duplicate entries found:');
    if (duplicates.length > 0) {
      duplicates.forEach((dup: any) => {
        console.log(`- ${dup.source}: ${dup.count} entries`);
      });
    } else {
      console.log('✅ No duplicate entries found in Document table');
    }
    
    // Get total Document entries
    const totalEntries = await prisma.document.count();
    console.log('\n📈 Total Document entries:', totalEntries);
    
    // Show some sample entries to verify content
    const sampleEntries = await prisma.document.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { source: true, category: true, createdAt: true, title: true }
    });
    
    console.log('\n📝 Recent Document entries:');
    sampleEntries.forEach(entry => {
      console.log(`- ${entry.source} [${entry.category}] - "${entry.title?.substring(0, 30)}..." - ${entry.createdAt.toISOString()}`);
    });
    
    // Check for content-based duplicates by sampling content
    console.log('\n🔍 Checking for content-based duplicates...');
    const allDocuments = await prisma.document.findMany({
      take: 50, // Sample first 50 to check for content duplicates
      orderBy: { createdAt: 'desc' }
    });
    
    if (allDocuments.length > 0) {
      // Simple content comparison for duplicates
      const contentMap = new Map();
      let contentDuplicates = 0;
      
      for (const doc of allDocuments) {
        const contentKey = doc.content.substring(0, 100); // First 100 chars as key
        if (contentMap.has(contentKey)) {
          contentDuplicates++;
          console.log(`⚠️ Potential content duplicate: ${doc.source}`);
        } else {
          contentMap.set(contentKey, doc);
        }
      }
      
      if (contentDuplicates > 0) {
        console.log(`📊 Found ${contentDuplicates} potential content-based duplicates`);
      } else {
        console.log('✅ No content-based duplicates detected in sample');
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking Document duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDocumentDuplicates();