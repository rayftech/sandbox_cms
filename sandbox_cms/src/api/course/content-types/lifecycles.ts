// sandbox_cms/src/api/course/content-types/course/lifecycles.ts
import { rabbitmq, QueueType } from '../../../services/rabbitmq';

export default {
  async afterCreate(event) {
    const { result } = event;
    
    try {
      // Format industry partnerships if it's a relation
      let industries = [];
      if (result.targetIndustryPartnership && Array.isArray(result.targetIndustryPartnership.data)) {
        industries = result.targetIndustryPartnership.data.map(industry => ({
          id: industry.id,
          name: industry.attributes.name
        }));
      }
      
      // Notify external backend about new course
      await rabbitmq.sendToQueue(QueueType.COURSE_CREATED, {
        id: result.id,
        userId: result.userId,
        code: result.code,
        name: result.name,
        expectedEnrollment: result.expectedEnrollment,
        description: result.description,
        assessmentRedesign: result.assessmentRedesign,
        targetIndustryPartnership: industries,
        preferredPartnerRepresentative: result.preferredPartnerRepresentative,
        startDate: result.startDate,
        endDate: result.endDate,
        isActive: result.isActive,
        status: result.status,
        country: result.country,
        createdAt: result.createdAt
      });
      
      strapi.log.info(`Course created notification sent for course ID: ${result.id}`);
    } catch (error) {
      strapi.log.error(`Failed to send course creation notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  async afterUpdate(event) {
    const { result } = event;
    
    try {
      // Format industry partnerships if it's a relation
      let industries = [];
      if (result.targetIndustryPartnership && Array.isArray(result.targetIndustryPartnership.data)) {
        industries = result.targetIndustryPartnership.data.map(industry => ({
          id: industry.id,
          name: industry.attributes.name
        }));
      }
      
      // Send update notification
      await rabbitmq.sendToQueue(QueueType.COURSE_UPDATED, {
        id: result.id,
        userId: result.userId,
        code: result.code,
        name: result.name,
        expectedEnrollment: result.expectedEnrollment,
        description: result.description,
        assessmentRedesign: result.assessmentRedesign,
        targetIndustryPartnership: industries,
        preferredPartnerRepresentative: result.preferredPartnerRepresentative,
        startDate: result.startDate,
        endDate: result.endDate,
        isActive: result.isActive,
        status: result.status,
        country: result.country,
        updatedFields: Object.keys(event.params.data),
        updatedAt: result.updatedAt
      });
      
      strapi.log.info(`Course updated notification sent for course ID: ${result.id}`);
    } catch (error) {
      strapi.log.error(`Failed to send course update notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  async beforeDelete(event) {
    const { id } = event.params;
    
    try {
      // Get the course data before it's deleted
      // Using the simpler format for populate
      const course = await strapi.entityService.findOne('api::course.course', id, {
        populate: '*'
      });
      
      if (course) {
        // Store for afterDelete handler
        global.tempCourseData = course;
      }
    } catch (error) {
      strapi.log.error(`Failed to retrieve course data before deletion: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  async afterDelete(event) {
    const { id } = event.params;
    
    try {
      // Use stored course data if available
      const courseData = global.tempCourseData || { id };
      
      // Send deletion notification
      await rabbitmq.sendToQueue(QueueType.COURSE_DELETED, {
        id,
        userId: courseData.userId,
        code: courseData.code,
        deletedAt: new Date()
      });
      
      strapi.log.info(`Course deleted notification sent for course ID: ${id}`);
      
      // Clean up temp data
      if (global.tempCourseData) {
        delete global.tempCourseData;
      }
    } catch (error) {
      strapi.log.error(`Failed to send course deletion notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};