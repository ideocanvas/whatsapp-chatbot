import { BaseTool } from '../core/BaseTool';
import { UserProfileService } from '../services/UserProfileService';

export class UpdateProfileTool extends BaseTool {
  name = 'update_profile';
  description = 'Save information about the user. Use this when the user tells you their name, location, job, hobbies, or other personal details. ALWAYS use this to persist new information.';
  
  parameters = {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['name', 'location', 'language', 'general_fact'],
        description: 'The type of information to save.'
      },
      key: {
        type: 'string',
        description: 'If category is "general_fact", a short key (e.g., "job", "pet", "diet"). Ignored for others.'
      },
      value: {
        type: 'string',
        description: 'The actual information to save (e.g., "John", "New York", "Vegetarian").'
      }
    },
    required: ['category', 'value'],
    additionalProperties: false,
  };

  constructor(private profileService: UserProfileService, private userId: string) {
    super();
  }

  // We set userId dynamically before execution in the Agent
  setUserId(userId: string) {
    this.userId = userId;
  }

  async execute(args: any): Promise<string> {
    const { category, key, value } = args;
    
    if (!this.userId) return "Error: No User ID context.";

    try {
      if (category === 'name') {
        await this.profileService.updateProfile(this.userId, { name: value });
        return `✅ Saved name: ${value}`;
      } 
      else if (category === 'location') {
        await this.profileService.updateProfile(this.userId, { location: value });
        return `✅ Saved location: ${value}`;
      }
      else if (category === 'language') {
        await this.profileService.updateProfile(this.userId, { language: value });
        return `✅ Saved language preference: ${value}`;
      }
      else {
        // General Fact
        const factKey = key || 'note';
        await this.profileService.updateProfile(this.userId, { fact: { key: factKey, value } });
        return `✅ Saved fact - ${factKey}: ${value}`;
      }
    } catch (e) {
      console.error(e);
      return "Failed to save profile information.";
    }
  }
}