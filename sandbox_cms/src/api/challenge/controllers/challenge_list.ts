// sandbox_cms/src/api/challenge/controllers/challenge-list.ts
/**
 * Challenge list controller for showing challenges by status
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::challenge.challenge', ({ strapi }) => ({
  /**
   * Get challenges grouped by status
   * @param {object} ctx - The context object
   */
  async listByStatus(ctx) {
    try {
      const { status } = ctx.params;
      const { page = 1, pageSize = 25, sort, filters = {} } = ctx.query;
      
      // Validate the status parameter
      const validStatuses = ['upcoming', 'ongoing', 'complete', 'all'];
      if (status && !validStatuses.includes(status)) {
        return ctx.badRequest(`Invalid status parameter. Must be one of: ${validStatuses.join(', ')}`);
      }
      
      console.log(`Fetching challenges with status: ${status}`);
      
      try {
        // Check if service exists
        if (!strapi.service('api::challenge.challenge-list')) {
          console.error('Challenge-list service not found');
          
          // Fallback to direct query if service not found
          const query = {
            ...(status && status !== 'all' ? { challengeStatus: status } : {}),
          };
          
          const results = await strapi.entityService.findMany('api::challenge.challenge', {
            filters: query,
            fields: ['id', 'name', 'studentLevel', 'startDate', 'endDate', 'shortDescription', 'challengeStatus', 'targetAcademicPartnership'],
            pagination: { page: parseInt(String(page), 10), pageSize: parseInt(String(pageSize), 10) },
            sort: sort || 'startDate:desc',
          });
          
          return {
            data: results.map(challenge => ({
              id: challenge.id,
              name: challenge.name,
              studentLevel: challenge.studentLevel,
              startDate: challenge.startDate,
              endDate: challenge.endDate,
              company: 'N/A',
              targetAcademicPartnership: challenge.targetAcademicPartnership,
              tags: [],
              shortDescription: challenge.shortDescription,
              status: challenge.challengeStatus,
            })),
          };
        }
        
        // Get challenges from the service
        const result = await strapi.service('api::challenge.challenge-list').getChallengesByStatus(
          status, 
          { page, pageSize, sort, filters }
        );
        
        return result;
      } catch (serviceErr) {
        console.error('Service error:', serviceErr);
        throw serviceErr;
      }
    } catch (err) {
      console.error(`Error listing challenges by status: ${err instanceof Error ? err.message : String(err)}`);
      return ctx.internalServerError('An error occurred while retrieving challenges');
    }
  }
}));