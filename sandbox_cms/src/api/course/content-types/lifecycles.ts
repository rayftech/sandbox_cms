// sandbox_cms/src/api/course/content-types/course/lifecycles.ts
import { rabbitmq, QueueType } from '../../../services/rabbitmq';


interface LifecycleEvent {
    action: string;
    params: {
      data?: any;
      where?: any;
      select?: any;
      [key: string]: any;
    };
    result: any;
    state: {
      user?: any;
      [key: string]: any;
    };
  }

export default {
    async afterCreate(event: LifecycleEvent) {
        const { result } = event;
        
        console.log('afterCreate lifecycle hook triggered for course:', result.id);
        
        try {
          // Ensure queue exists
          await rabbitmq.assertQueue(QueueType.COURSE_CREATED);
          
          // Format industry partnerships if it's a relation
          let industries = [];
          if (result.targetIndustryPartnership && Array.isArray(result.targetIndustryPartnership.data)) {
            industries = result.targetIndustryPartnership.data.map(industry => ({
              id: industry.id,
              name: industry.attributes.name
            }));
          }
          
          // Prepare message
          const message = {
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
          };
          
          console.log('Sending message to queue:', QueueType.COURSE_CREATED);
          
          // Send message to queue
          const sent = await rabbitmq.sendToQueue(QueueType.COURSE_CREATED, message);
          console.log('Message sent successfully:', sent);
          
        } catch (error) {
          console.error(`Failed to send course creation notification: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
  
  async afterUpdate(event: LifecycleEvent) {
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
  
  async beforeDelete(event: LifecycleEvent) {
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
  
  async afterDelete(event: LifecycleEvent) {
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