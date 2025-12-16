import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDashboard() {
  console.log('📊 Testing Dashboard API Data...');
  
  try {
    // Test blog posts
    const blogPosts = await prisma.blogPost.findMany();
    console.log('📝 Blog Posts:', blogPosts.length);
    blogPosts.forEach(post => {
      console.log(`- ${post.title} (${post.sourceTitle || 'Unknown'})`);
    });

    // Test news sources
    const sources = await prisma.newsSource.findMany();
    console.log('📰 News Sources:', sources.length);
    sources.forEach(source => {
      console.log(`- ${source.name} (${source.url})`);
    });

    // Test keywords
    const keywords = await prisma.newsKeyword.findMany();
    console.log('🔑 Keywords:', keywords.length);
    console.log('First 5 keywords:', keywords.slice(0, 5).map(k => k.keyword));

    console.log('✅ Dashboard data test completed');
  } catch (error) {
    console.error('❌ Error testing dashboard data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDashboard();