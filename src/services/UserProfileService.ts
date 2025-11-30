import { prisma, PrismaDatabaseUtils } from '../config/prisma';

export interface UserFact {
  key: string;
  value: string;
}

export class UserProfileService {
  constructor() {
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  async getProfile(userId: string) {
    let profile = await prisma.userProfile.findUnique({ where: { userId } });
    
    if (!profile) {
      profile = await prisma.userProfile.create({
        data: { userId, facts: {} }
      });
    }
    return profile;
  }

  /**
   * Updates specific fields or adds to the facts JSON
   */
  async updateProfile(userId: string, data: { 
    name?: string; 
    location?: string; 
    language?: string;
    fact?: UserFact 
  }) {
    const current = await this.getProfile(userId);
    const updateData: any = {};

    if (data.name) updateData.name = data.name;
    if (data.location) updateData.location = data.location;
    if (data.language) updateData.language = data.language;

    // Merge new fact into existing JSON
    if (data.fact) {
      const currentFacts = (current.facts as Record<string, string>) || {};
      currentFacts[data.fact.key] = data.fact.value;
      updateData.facts = currentFacts;
    }

    return await prisma.userProfile.update({
      where: { userId },
      data: updateData
    });
  }

  /**
   * Returns a formatted string for the System Prompt
   */
  async getProfileContext(userId: string): Promise<string> {
    const p = await this.getProfile(userId);
    const facts = p.facts as Record<string, string>;
    
    let context = `👤 **User Profile:**\n`;
    context += `- Name: ${p.name || 'Unknown'}\n`;
    context += `- Location: ${p.location || 'Unknown'}\n`;
    
    if (Object.keys(facts).length > 0) {
      context += `- Known Facts: ${Object.entries(facts).map(([k, v]) => `${k}: ${v}`).join(', ')}`;
    } else {
      context += `- Known Facts: None yet`;
    }

    return context;
  }

  /**
   * Calculate profile completeness score (0-100)
   */
  async calculateCompleteness(userId: string): Promise<number> {
    const profile = await this.getProfile(userId);
    let score = 0;
    
    // Name is worth 30 points
    if (profile.name) score += 30;
    
    // Location is worth 30 points
    if (profile.location) score += 30;
    
    // Each fact is worth 10 points (max 40 points)
    const facts = profile.facts as Record<string, string>;
    const factCount = Object.keys(facts).length;
    score += Math.min(factCount * 10, 40);
    
    return score;
  }

  /**
   * Update lastAsked timestamp
   */
  async updateLastAsked(userId: string): Promise<void> {
    await prisma.userProfile.update({
      where: { userId },
      data: { lastAsked: new Date() }
    });
  }

  /**
   * Check if we should ask a personal question (cooldown logic)
   */
  async shouldAskPersonalQuestion(userId: string): Promise<boolean> {
    const profile = await this.getProfile(userId);
    
    // If we've never asked, or it's been more than 1 hour since last ask
    if (!profile.lastAsked) return true;
    
    const timeSinceLastAsk = Date.now() - profile.lastAsked.getTime();
    return timeSinceLastAsk > 60 * 60 * 1000; // 1 hour cooldown
  }
}