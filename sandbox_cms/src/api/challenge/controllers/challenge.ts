// sandbox_cms/src/api/challenge/controllers/challenge.ts
/**
 * challenge controller
 */

import { factories } from '@strapi/strapi'
// import { Strapi } from '@strapi/strapi';

export default factories.createCoreController('api::challenge.challenge', ({ strapi }) => ({
  // Keep the original functionality
  async find(ctx, next) {
    const { query } = ctx;
    
    // If status parameter is provided, use the custom method
    if (query.status) {
      return this.findByStatus(ctx, next);
    }
    
    // Otherwise use the default find method
    return await super.find(ctx, next);
  },

  /**
   * Get challenges grouped by status
   */
  async findByStatus(ctx, next) {
    try {
      const { query } = ctx;
      const status = query.status as string;
      const { page = 1, pageSize = 25, sort = 'startDate:desc' } = query;
      
      // Validate the status parameter
      const validStatuses = ['upcoming', 'ongoing', 'complete', 'all'];
      if (status && !validStatuses.includes(status)) {
        return ctx.badRequest(`Invalid status parameter. Must be one of: ${validStatuses.join(', ')}`);
      }
      
      // Build the query filters - using a type assertion to satisfy TypeScript
      const filters: any = status && status !== 'all' 
        ? { challengeStatus: status }
        : {};
        
      // Perform query directly using entityService
      const challenges = await strapi.entityService.findMany('api::challenge.challenge', {
        filters,
        fields: ['id', 'name', 'studentLevel', 'startDate', 'endDate', 'shortDescription', 'challengeStatus', 'targetAcademicPartnership'],
        sort,
        pagination: {
          page: parseInt(String(page), 10),
          pageSize: parseInt(String(pageSize), 10),
          withCount: true
        }
      });

      // Transform results
      const transformedResults = challenges.map(challenge => ({
        id: challenge.id,
        name: challenge.name,
        studentLevel: challenge.studentLevel,
        startDate: challenge.startDate,
        endDate: challenge.endDate,
        company: 'N/A', // Not in current schema
        targetAcademicPartnership: challenge.targetAcademicPartnership,
        tags: [], // Not in current schema
        shortDescription: challenge.shortDescription,
        status: challenge.challengeStatus,
      }));
      
      // If status is 'all', group challenges by status
      if (status === 'all') {
        const grouped = {
          upcoming: transformedResults.filter(c => c.status === 'upcoming'),
          ongoing: transformedResults.filter(c => c.status === 'ongoing'),
          complete: transformedResults.filter(c => c.status === 'complete'),
        };
        
        return {
          data: grouped,
          meta: { pagination: { page, pageSize, total: challenges.length } },
        };
      }
      
      // Return non-grouped results
      return {
        data: transformedResults,
        meta: { pagination: { page, pageSize, total: challenges.length } },
      };
    } catch (err) {
      console.error(`Error listing challenges by status: ${err instanceof Error ? err.message : String(err)}`);
      return ctx.internalServerError('An error occurred while retrieving challenges');
    }
  }
}));