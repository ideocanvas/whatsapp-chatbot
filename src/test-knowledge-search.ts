import * as dotenv from 'dotenv';
dotenv.config();

import { KnowledgeBasePostgres } from '../src/memory/KnowledgeBasePostgres';
import { createOpenAIServiceFromConfig } from '../src/services/OpenAIService';
import { prisma } from '../src/config/prisma';

/**
 * Test program for pgvector knowledge search with real database
 */

async function testPgvectorKnowledgeSearch() {
  console.log('🧪 Starting pgvector Knowledge Search Tests...\n');

  try {
    // Initialize OpenAI service and Knowledge Base
    console.log('1️⃣ Initializing OpenAI Service...');
    const openaiService = await createOpenAIServiceFromConfig();
    const kb = new KnowledgeBasePostgres(openaiService);
    console.log('✅ OpenAI Service initialized\n');

    // Check database stats
    console.log('2️⃣ Checking database stats...');
    const stats = await kb.getStats();
    console.log(`   - Total documents: ${stats.totalDocuments}`);
    console.log(`   - Categories: ${stats.categories.join(', ')}`);
    console.log(`   - Oldest document: ${stats.oldestDocument}`);
    console.log();

    // Test 1: Check if embedding column exists and has data (using raw SQL)
    console.log('3️⃣ Testing pgvector column existence...');
    const embeddingCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Knowledge" WHERE "embedding" IS NOT NULL
    `;

    if (embeddingCount[0].count > 0) {
      console.log(`✅ Found ${embeddingCount[0].count} documents with embeddings`);
    } else {
      console.log('⚠️  No documents with embeddings found');
    }
    console.log();

    // Test 2: Add a test document
    console.log('4️⃣ Adding a test document...');
    const testDocument = {
      content: 'This is a test document about artificial intelligence and machine learning. AI is transforming many industries including healthcare, finance, and technology.',
      source: 'test://artificial-intelligence',
      tags: ['test', 'ai', 'ml', 'technology'],
      timestamp: new Date(),
      category: 'technology'
    };

    await kb.learnDocument(testDocument);
    console.log('✅ Test document added\n');

    // Test 3: Search for the test document
    console.log('5️⃣ Testing vector similarity search...');
    const query = 'What is artificial intelligence?';
    console.log(`   Query: "${query}"`);
    
    const searchResults = await kb.search(query, 5);
    console.log('\n   Search Results:');
    console.log('   ' + '='.repeat(80));
    console.log(searchResults);
    console.log('   ' + '='.repeat(80));
    console.log();

    // Test 4: Search with category filter
    console.log('6️⃣ Testing search with category filter...');
    const categoryResults = await kb.search('machine learning', 3, 'technology');
    console.log('\n   Category Filtered Results (technology):');
    console.log('   ' + '='.repeat(80));
    console.log(categoryResults);
    console.log('   ' + '='.repeat(80));
    console.log();

    // Test 5: Test recency prioritization (search recent content)
    console.log('7️⃣ Testing recency prioritization...');
    const recentResults = await kb.search('recent news', 3);
    console.log('\n   Recent Content Results:');
    console.log('   ' + '='.repeat(80));
    console.log(recentResults);
    console.log('   ' + '='.replace(/=/g, ''));
    console.log();

    // Test 6: Test no results case
    console.log('8️⃣ Testing no results case...');
    const noResults = await kb.search('xkcdzqj123456789 nonsense query that should not match anything', 3);
    console.log('\n   No Results Case:');
    console.log('   ' + '='.repeat(80));
    console.log(noResults);
    console.log('   ' + '='.repeat(80));
    console.log();

    // Test 7: Test raw SQL vector search (direct pgvector query)
    console.log('9️⃣ Testing raw SQL pgvector search...');
    const queryEmbedding = await openaiService.createEmbedding('test search query');
    const vectorString = `[${queryEmbedding.join(',')}]`;
    
    const rawResults = await prisma.$queryRawUnsafe<Array<{ id: string; content: string; similarity: number }>>(`
      SELECT id, content, 1 - (embedding <=> $1::vector) as similarity
      FROM "Knowledge"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector ASC
      LIMIT 3
    `, vectorString);

    console.log(`   Found ${rawResults.length} results via raw SQL`);
    rawResults.forEach((r, i) => {
      console.log(`   ${i + 1}. Similarity: ${r.similarity.toFixed(4)} | ${r.content.substring(0, 60)}...`);
    });
    console.log();

    // Test 8: Cleanup test document
    console.log('🔟 Cleaning up test document...');
    await prisma.knowledge.deleteMany({
      where: { source: 'test://artificial-intelligence' }
    });
    console.log('✅ Test document removed\n');

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testPgvectorKnowledgeSearch().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});