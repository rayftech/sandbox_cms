// sandbox_cms/src/api/course/controllers/custom-course.ts
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::course.course', ({ strapi }) => ({
  async syncFromExternal(ctx) {
    try {
      const { id } = ctx.params;
      const updateData = ctx.request.body;
      
      // Validate that course exists
      const course = await strapi.entityService.findOne('api::course.course', id);
      
      if (!course) {
        return ctx.notFound('Course not found');
      }
      
      // Update course with data from external backend
      const updatedCourse = await strapi.entityService.update('api::course.course', id, {
        data: updateData,
        // Add metadata to prevent infinite sync loops
        meta: {
          source: 'external_sync'
        }
      });
      
      return updatedCourse;
    } catch (err) {
      strapi.log.error(`Error syncing course from external system: ${err instanceof Error ? err.message : String(err)}`);
      return ctx.internalServerError('An error occurred during synchronization');
    }
  },
  
  async validateUserId(ctx) {
    try {
      const { userId } = ctx.request.body;
      
      if (!userId) {
        return ctx.badRequest('User ID is required');
      }
      
      // Check if any courses exist with this userId
      const courses = await strapi.entityService.findMany('api::course.course', {
        filters: { userId },
        limit: 1
      });
      
      // Return whether the userId is valid (exists in our system)
      return { exists: courses.length > 0 };
    } catch (err) {
      strapi.log.error(`Error validating user ID: ${err instanceof Error ? err.message : String(err)}`);
      return ctx.internalServerError('An error occurred');
    }
  }
}));