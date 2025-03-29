// sandbox_cms/src/api/challenge/services/challenge-list.ts
import { factories } from '@strapi/strapi';

/**
 * Interface defining query options for challenges
 */
interface QueryOptions {
  page?: number;
  pageSize?: number;
  sort?: string | string[];
  filters?: Record<string, any>;
}

export default factories.createCoreService('api::challenge.challenge', ({ strapi }) => ({
  /**
   * Get challenges filtered by status and grouped accordingly
   * @param {string} status - Challenge status filter (upcoming, ongoing, complete, or all)
   * @param {QueryOptions} options - Query options for pagination, sorting, and filtering
   * @returns {Promise<object>} - Paginated and grouped challenges
   */
  async getChallengesByStatus(status, options: QueryOptions = {}) {
    const { page = 1, pageSize = 25, sort = 'startDate:desc', filters = {} } = options;
    
    // Calculate pagination parameters
    const start = (page - 1) * pageSize;
    const limit = parseInt(String(pageSize), 10);
    
    // Build the query filters
    const query: any = {
      publicationState: 'live', // Only return published challenges
      locale: 'en', // Default locale
    };
    
    // Add status filter if specified and not 'all'
    if (status && status !== 'all') {
      query.filters = {
        ...filters,
        challengeStatus: status,
      };
    } else if (status === 'all') {
      query.filters = filters;
    }
    
    // Include pagination parameters
    query.pagination = {
      page: parseInt(String(page), 10),
      pageSize: limit,
      withCount: true,
    };
    
    // Include sorting
    query.sort = sort;
    
    // Fields to return (projection)
    query.fields = [
      'id',
      'name',
      'studentLevel',
      'startDate',
      'endDate',
      'targetAcademicPartnership',
      'shortDescription',
      'challengeStatus',
    ];
    
    // Don't need populate for non-relation fields
    
    // Perform the query
    const { results, pagination } = await strapi.entityService.findPage('api::challenge.challenge', query);
    
    // Transform the result format for better client consumption
    const transformedResults = results.map(challenge => ({
      id: challenge.id,
      name: challenge.name,
      studentLevel: challenge.studentLevel,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      company: 'N/A', // Note: Company name not in current schema, placeholder
      targetAcademicPartnership: challenge.targetAcademicPartnership,
      tags: [], // Note: Tags not in current schema, placeholder
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
        meta: { pagination },
      };
    }
    
    // Return non-grouped results
    return {
      data: transformedResults,
      meta: { pagination },
    };
  },
}));