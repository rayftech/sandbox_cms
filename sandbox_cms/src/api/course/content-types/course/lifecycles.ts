// sandbox_cms/src/api/course/content-types/course/lifecycles.ts
import { rabbitmq, QueueType } from '../../../../services/rabbitmq';

interface LifecycleEvent {
  action: string;
  params: {
    data?: any;
    where?: any;
    select?: any;
    meta?: {
      source?: string;
    };
    [key: string]: any;
  };
  result: any;
  state: {
    user?: any;
    [key: string]: any;
  };
}

// Declare a global variable to track publish operations
declare global {
  var coursePublishOperations: {
    [key: string]: {
      timestamp: number;
      relatedIds: Set<string | number>;
    };
  };
}

// Initialize global tracking object if not exists
if (!global.coursePublishOperations) {
  global.coursePublishOperations = {};
}

// Clean up old publish operations (older than 30 seconds)
function cleanupOldOperations() {
  const now = Date.now();
  Object.keys(global.coursePublishOperations).forEach(key => {
    if (now - global.coursePublishOperations[key].timestamp > 30000) {
      delete global.coursePublishOperations[key];
    }
  });
}

export default {
  async afterCreate(event: LifecycleEvent) {
    try {
      const { result } = event;
      
      console.log(`afterCreate lifecycle hook triggered for course: ${result.id}`);
      
      // Check if this is a system operation (part of publish workflow)
      if (!event.state?.user || !event.state.user.id) {
        console.log(`Detected system operation for course ID ${result.id} - likely part of publish workflow`);
        
        // Record this ID in any active publish operations
        Object.keys(global.coursePublishOperations).forEach(key => {
          global.coursePublishOperations[key].relatedIds.add(result.id);
        });
        
        return;
      }
      
      // Skip if this is an external sync operation
      if (event.params?.meta?.source === 'external_sync') {
        console.log('Skipping creation notification for external sync operation');
        return;
      }
      
      // Clean up old operations
      cleanupOldOperations();
      
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
        status: result.courseStatus || result.status,
        country: result.country,
        createdAt: result.createdAt,
        publishStatus: result.publishedAt ? 'published' : 'draft',
        triggeredBy: event.state?.user?.id || 'system'
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
    try {
      console.log(`afterUpdate lifecycle hook triggered for course: ${event.result?.id}`);
      
      // Verify we have a result
      if (!event.result) {
        console.error('afterUpdate hook called without result object');
        return;
      }
      
      const { result } = event;
      
      // Skip if this is an external sync operation
      if (event.params?.meta?.source === 'external_sync') {
        console.log('Skipping update notification for external sync operation');
        return;
      }
      
      // Determine which fields were updated
      const updatedFields = event.params && event.params.data ? Object.keys(event.params.data) : [];
      console.log('Fields updated:', updatedFields);
      
      // Detect if this is a publish operation
      const isPublishOperation = updatedFields.includes('publishedAt') && 
                              result.publishedAt !== null;
      
      // If this is a publish operation, register it in our tracking system
      const operationId = `${result.id}-${Date.now()}`;
      if (isPublishOperation && event.state?.user?.id) {
        global.coursePublishOperations[operationId] = {
          timestamp: Date.now(),
          relatedIds: new Set()
        };
        
        console.log(`Registered publish operation: ${operationId}`);
      }
      
      // Clean up old operations
      cleanupOldOperations();
      
      // Ensure queue exists
      await rabbitmq.assertQueue(QueueType.COURSE_UPDATED);
      
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
        status: result.courseStatus || result.status, // Handle both possible field names
        country: result.country,
        updatedFields: updatedFields,
        updatedAt: result.updatedAt,
        publishStatus: result.publishedAt ? 'published' : 'draft',
        operationType: isPublishOperation ? 'publish' : 'update',
        triggeredBy: event.state?.user?.id || 'system'
      };
      
      console.log(`Sending ${isPublishOperation ? 'publish' : 'update'} message to queue:`, QueueType.COURSE_UPDATED);
      
      // Send message to queue
      const sent = await rabbitmq.sendToQueue(QueueType.COURSE_UPDATED, message);
      console.log('Update message sent successfully:', sent);
      
      strapi.log.info(`Course ${isPublishOperation ? 'publish' : 'update'} notification sent for course ID: ${result.id}`);
    } catch (error) {
      console.error(`Failed to send course update notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async beforeDelete(event: LifecycleEvent) {
    try {
      // Skip if this is an internal operation or part of a publish workflow
      if (!event.state?.user || !event.state.user.id) {
        console.log('Skipping beforeDelete for internal operation');
        return;
      }
      
      // The structure of the event.params differs in bulk delete vs single delete
      let id: string | number | undefined;
      
      if (event.params.where && event.params.where.id) {
        // This handles the case of filters like { id: 1 } or { id: { $in: [1,2,3] } }
        if (typeof event.params.where.id === 'object' && event.params.where.id.$in) {
          // Bulk delete operation
          console.log('Bulk delete operation detected with IDs:', event.params.where.id.$in);
          // For bulk operations, we need to handle each ID
          const ids: (string | number)[] = event.params.where.id.$in;
          
          // Check if any of these IDs are part of a publish operation
          let skipAll = false;
          Object.keys(global.coursePublishOperations).forEach(key => {
            const publishOp = global.coursePublishOperations[key];
            for (const courseId of ids) {
              if (publishOp.relatedIds.has(courseId)) {
                console.log(`ID ${courseId} is part of an active publish operation - skipping delete notification`);
                skipAll = true;
                break;
              }
            }
          });
          
          if (skipAll) {
            console.log('Skipping bulk delete notification as it appears to be part of a system operation');
            return;
          }
          
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
      
      // Check if this ID is part of a publish operation
      let isPartOfPublishOperation = false;
      Object.keys(global.coursePublishOperations).forEach(key => {
        if (global.coursePublishOperations[key].relatedIds.has(id)) {
          isPartOfPublishOperation = true;
        }
      });
      
      // Skip if it's part of publish workflow
      if (isPartOfPublishOperation) {
        console.log(`Skipping delete notification for course ID ${id} as it appears to be part of a system operation`);
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
      // Clean up old operations
      cleanupOldOperations();
      
      // Skip if this is an internal operation or part of a publish workflow
      if (!event.state?.user || !event.state.user.id) {
        console.log('Skipping afterDelete for internal operation');
        return;
      }
      
      // Check if this was a bulk delete operation
      if (global.tempCourseDataMultiple && Array.isArray(global.tempCourseDataMultiple)) {
        console.log(`Processing ${global.tempCourseDataMultiple.length} courses for bulk deletion`);
        
        // Process each course from our temp storage
        for (const courseData of global.tempCourseDataMultiple) {
          // Check if this ID is part of a publish operation
          let isPartOfPublishOperation = false;
          Object.keys(global.coursePublishOperations).forEach(key => {
            if (global.coursePublishOperations[key].relatedIds.has(courseData.id)) {
              isPartOfPublishOperation = true;
            }
          });
          
          if (isPartOfPublishOperation) {
            console.log(`Skipping delete notification for course ID ${courseData.id} as it appears to be part of a system operation`);
            continue;
          }
          
          await rabbitmq.sendToQueue(QueueType.COURSE_DELETED, {
            id: courseData.id,
            userId: courseData.userId,
            code: courseData.code,
            deletedAt: new Date(),
            triggeredBy: event.state?.user?.id || 'system'
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
      
      // Check if this ID is part of a publish operation
      let isPartOfPublishOperation = false;
      Object.keys(global.coursePublishOperations).forEach(key => {
        if (global.coursePublishOperations[key].relatedIds.has(id)) {
          isPartOfPublishOperation = true;
        }
      });
      
      // Skip if it's part of publish workflow
      if (isPartOfPublishOperation) {
        console.log(`Skipping delete notification for course ID ${id} as it appears to be part of a system operation`);
        return;
      }
      
      // Use stored course data if available
      const courseData = global.tempCourseData || { id };
      
      // Send deletion notification
      await rabbitmq.sendToQueue(QueueType.COURSE_DELETED, {
        id: courseData.id || id,
        userId: courseData.userId || 'unknown',
        code: courseData.code || 'unknown',
        deletedAt: new Date(),
        triggeredBy: event.state?.user?.id || 'system'
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