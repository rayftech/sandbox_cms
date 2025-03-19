// sandbox_cms/src/api/challenge/controllers/custom-challenge.ts
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::challenge.challenge', ({ strapi }) => ({
  async syncFromExternal(ctx) {
    try {
      const { id } = ctx.params;
      const updateData = ctx.request.body;
      
      // Validate that challenge exists
      const challenge = await strapi.entityService.findOne('api::challenge.challenge', id);
      
      if (!challenge) {
        return ctx.notFound('Challenge not found');
      }
      
      // Update challenge with data from external backend
      const updatedChallenge = await strapi.entityService.update('api::challenge.challenge', id, {
        data: updateData,
        // Add metadata to prevent infinite sync loops
        meta: {
          source: 'external_sync'
        }
      });
      
      return updatedChallenge;
    } catch (err) {
      strapi.log.error(`Error syncing challenge from external system: ${err instanceof Error ? err.message : String(err)}`);
      return ctx.internalServerError('An error occurred during synchronization');
    }
  },
  
  async validateUserId(ctx) {
    try {
      const { userId } = ctx.request.body;
      
      if (!userId) {
        return ctx.badRequest('User ID is required');
      }
      
      // Check if any challenges exist with this userId
      const challenges = await strapi.entityService.findMany('api::challenge.challenge', {
        filters: { userId },
        limit: 1
      });
      
      // Return whether the userId is valid (exists in our system)
      return { exists: challenges.length > 0 };
    } catch (err) {
      strapi.log.error(`Error validating user ID: ${err instanceof Error ? err.message : String(err)}`);
      return ctx.internalServerError('An error occurred');
    }
  }
}));