// sandbox_cms/src/api/course/content-types/course/lifecycles.ts
import { rabbitmq, QueueType } from '../../../../services/rabbitmq';


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
      console.log('afterUpdate lifecycle hook triggered for course:', event.result?.id);
      
      // Verify we have a result
      if (!event.result) {
        console.error('afterUpdate hook called without result object');
        return;
      }
      
      const { result } = event;
      
      try {
        // Ensure queue exists - just like in afterCreate
        await rabbitmq.assertQueue(QueueType.COURSE_UPDATED);
        
        // Format industry partnerships if it's a relation
        let industries = [];
        if (result.targetIndustryPartnership && Array.isArray(result.targetIndustryPartnership.data)) {
          industries = result.targetIndustryPartnership.data.map(industry => ({
            id: industry.id,
            name: industry.attributes.name
          }));
        }
        
        // Determine which fields were updated
        const updatedFields = event.params && event.params.data ? Object.keys(event.params.data) : [];
        console.log('Fields updated:', updatedFields);
        
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
          status: result.courseStatus || result.status, // Handle both possible field names
          country: result.country,
          updatedFields: updatedFields,
          updatedAt: result.updatedAt
        };
        
        console.log('Sending message to queue:', QueueType.COURSE_UPDATED);
        
        // Send message to queue
        const sent = await rabbitmq.sendToQueue(QueueType.COURSE_UPDATED, message);
        console.log('Update message sent successfully:', sent);
        
        strapi.log.info(`Course updated notification sent for course ID: ${result.id}`);
      } catch (error) {
        console.error(`Failed to send course update notification: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  
  async beforeDelete(event: LifecycleEvent) {
    try {
      // The structure of the event.params differs in bulk delete vs single delete
      // For bulk deletes, the id is in event.params.where.id
      // For single deletes, you might need to check event.params.where directly
      
      let id: string | number | undefined;
      
      if (event.params.where && event.params.where.id) {
        // This handles the case of filters like { id: 1 } or { id: { $in: [1,2,3] } }
        if (typeof event.params.where.id === 'object' && event.params.where.id.$in) {
          // Bulk delete operation
          console.log('Bulk delete operation detected with IDs:', event.params.where.id.$in);
          // For bulk operations, we need to handle each ID
          const ids: (string | number)[] = event.params.where.id.$in;
          global.tempCourseDataMultiple = [];
          
          for (const itemId of ids) {
            try {
              const course = await strapi.entityService.findOne('api::course.course', itemId, {
                populate: '*'
              });
              
              if (course) {
                global.tempCourseDataMultiple.push(course);
              }
            } catch (itemError) {
              console.error(`Failed to retrieve course data for ID ${itemId}: ${itemError instanceof Error ? itemError.message : String(itemError)}`);
            }
          }
          
          // No need to proceed further for bulk operations
          return;
        } else {
          // Single ID delete
          id = event.params.where.id;
        }
      } else if (event.params.id) {
        // Handle the case where id is directly in params
        id = event.params.id;
      } else {
        console.error('Could not determine the course ID from event params:', event.params);
        return;
      }
      
      if (id === undefined) {
        console.error('ID is undefined after extraction attempts');
        return;
      }
      
      console.log(`beforeDelete: Attempting to find course with ID: ${id}`);
      
      // Get the course data before it's deleted with explicit ID
      const course = await strapi.db.query('api::course.course').findOne({
        where: { id },
        populate: true
      });
      
      if (course) {
        console.log(`Found course data for ID ${id} before deletion`);
        global.tempCourseData = course;
      } else {
        console.log(`No course found with ID ${id}`);
      }
    } catch (error) {
      console.error(`Failed to retrieve course data before deletion: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  async afterDelete(event: LifecycleEvent) {
    try {
      // Check if this was a bulk delete operation
      if (global.tempCourseDataMultiple && Array.isArray(global.tempCourseDataMultiple)) {
        console.log(`Processing ${global.tempCourseDataMultiple.length} courses for bulk deletion`);
        
        // Process each course from our temp storage
        for (const courseData of global.tempCourseDataMultiple) {
          await rabbitmq.sendToQueue(QueueType.COURSE_DELETED, {
            id: courseData.id,
            userId: courseData.userId,
            code: courseData.code,
            deletedAt: new Date()
          });
          
          console.log(`Course deleted notification sent for course ID: ${courseData.id}`);
        }
        
        // Clean up temp data
        delete global.tempCourseDataMultiple;
        return;
      }
      
      // Handle single deletion
      let id: string | number | undefined;
      if (event.params && event.params.where && event.params.where.id) {
        if (typeof event.params.where.id === 'object' && event.params.where.id.$in) {
          // This was handled in the bulk case above
          return;
        }
        id = event.params.where.id;
      } else if (event.params && event.params.id) {
        id = event.params.id;
      } else {
        console.error('Could not determine the course ID from afterDelete event params:', event.params);
        id = 'unknown';
      }
      
      // Use stored course data if available
      const courseData = global.tempCourseData || { id };
      
      // Send deletion notification
      await rabbitmq.sendToQueue(QueueType.COURSE_DELETED, {
        id: courseData.id || id,
        userId: courseData.userId || 'unknown',
        code: courseData.code || 'unknown',
        deletedAt: new Date()
      });
      
      console.log(`Course deleted notification sent for course ID: ${courseData.id || id}`);
      
      // Clean up temp data
      if (global.tempCourseData) {
        delete global.tempCourseData;
      }
    } catch (error) {
      console.error(`Failed to send course deletion notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};