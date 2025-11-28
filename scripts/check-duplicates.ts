import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDuplicates() {
  try {
    // Check for duplicate sources
    const duplicates = await prisma.$queryRaw`
      SELECT source, COUNT(*) as count 
      FROM "Knowledge" 
      GROUP BY source 
      HAVING COUNT(*) > 1
    `;
    
    console.log('📊 Duplicate entries found:');
    if (Array.isArray(duplicates) && duplicates.length > 0) {
      duplicates.forEach((dup: any) => {
        console.log(`- ${dup.source}: ${dup.count} entries`);
      });
    } else {
      console.log('✅ No duplicate entries found');
    }
    
    // Get total entries
    const totalEntries = await prisma.knowledge.count();
    console.log('\n📈 Total knowledge entries:', totalEntries);
    
    // Show some sample entries to verify content
    const sampleEntries = await prisma.knowledge.findMany({
      take: 5,
      orderBy: { timestamp: 'desc' },
      select: { source: true, category: true, timestamp: true }
    });
    
    console.log('\n📝 Recent entries:');
    sampleEntries.forEach(entry => {
      console.log(`- ${entry.source} [${entry.category}] - ${entry.timestamp.toISOString()}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();