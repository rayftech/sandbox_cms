// sandbox_cms/src/api/challenge/content-types/challenge/lifecycles.ts
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
  var publishOperations: {
    [key: string]: {
      timestamp: number;
      relatedIds: Set<string | number>;
    };
  };
}

// Initialize global tracking object if not exists
if (!global.publishOperations) {
  global.publishOperations = {};
}

// Clean up old publish operations (older than 30 seconds)
function cleanupOldOperations() {
  const now = Date.now();
  Object.keys(global.publishOperations).forEach(key => {
    if (now - global.publishOperations[key].timestamp > 30000) {
      delete global.publishOperations[key];
    }
  });
}

export default {
  async afterCreate(event: LifecycleEvent) {
    try {
      const { result } = event;
      
      console.log(`afterCreate lifecycle hook triggered for challenge: ${result.id}`);
      
      // Check if this is a system operation (part of publish workflow)
      if (!event.state?.user || !event.state.user.id) {
        console.log(`Detected system operation for challenge ID ${result.id} - likely part of publish workflow`);
        
        // Record this ID in any active publish operations
        Object.keys(global.publishOperations).forEach(key => {
          global.publishOperations[key].relatedIds.add(result.id);
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
      await rabbitmq.assertQueue(QueueType.CHALLENGE_CREATED);
      
      // Format academic partnerships if needed from relation data
      let academicPartnership = result.targetAcademicPartnership || '';
      
      // Prepare message
      const message = {
        id: result.id,
        userId: result.userId,
        name: result.name,
        shortDescription: result.shortDescription,
        targetAcademicPartnership: academicPartnership,
        studentLevel: result.studentLevel,
        startDate: result.startDate,
        endDate: result.endDate,
        isActive: result.isActive,
        challengeStatus: result.challengeStatus,
        country: result.country,
        createdAt: result.createdAt,
        publishStatus: result.publishedAt ? 'published' : 'draft',
        triggeredBy: event.state?.user?.id || 'system'
      };
      
      console.log('Sending message to queue:', QueueType.CHALLENGE_CREATED);
      
      // Send message to queue
      const sent = await rabbitmq.sendToQueue(QueueType.CHALLENGE_CREATED, message);
      console.log('Message sent successfully:', sent);
      
    } catch (error) {
      console.error(`Failed to send challenge creation notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async afterUpdate(event: LifecycleEvent) {
    try {
      console.log(`afterUpdate lifecycle hook triggered for challenge: ${event.result?.id}`);
      
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
        global.publishOperations[operationId] = {
          timestamp: Date.now(),
          relatedIds: new Set()
        };
        
        console.log(`Registered publish operation: ${operationId}`);
      }
      
      // Clean up old operations
      cleanupOldOperations();
      
      // Ensure queue exists
      await rabbitmq.assertQueue(QueueType.CHALLENGE_UPDATED);
      
      // Format academic partnerships if needed
      let academicPartnership = result.targetAcademicPartnership || '';
      
      // Prepare message
      const message = {
        id: result.id,
        userId: result.userId,
        name: result.name,
        shortDescription: result.shortDescription,
        targetAcademicPartnership: academicPartnership,
        studentLevel: result.studentLevel,
        startDate: result.startDate,
        endDate: result.endDate,
        isActive: result.isActive,
        challengeStatus: result.challengeStatus,
        country: result.country,
        updatedFields: updatedFields,
        updatedAt: result.updatedAt,
        publishStatus: result.publishedAt ? 'published' : 'draft',
        operationType: isPublishOperation ? 'publish' : 'update',
        triggeredBy: event.state?.user?.id || 'system'
      };
      
      console.log(`Sending ${isPublishOperation ? 'publish' : 'update'} message to queue:`, QueueType.CHALLENGE_UPDATED);
      
      // Send message to queue
      const sent = await rabbitmq.sendToQueue(QueueType.CHALLENGE_UPDATED, message);
      console.log('Update message sent successfully:', sent);
      
      strapi.log.info(`Challenge ${isPublishOperation ? 'publish' : 'update'} notification sent for challenge ID: ${result.id}`);
    } catch (error) {
      console.error(`Failed to send challenge update notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async beforeDelete(event: LifecycleEvent) {
    try {
      // The structure of the event.params differs in bulk delete vs single delete
      let id: string | number | undefined;
      
      if (event.params.where && event.params.where.id) {
        // This handles the case of filters like { id: 1 } or { id: { $in: [1,2,3] } }
        if (typeof event.params.where.id === 'object' && event.params.where.id.$in) {
          // Bulk delete operation
          console.log('Bulk delete operation detected with IDs:', event.params.where.id.$in);
          const ids: (string | number)[] = event.params.where.id.$in;
          
          // Check if any of these IDs are part of a publish operation
          let skipAll = false;
          Object.keys(global.publishOperations).forEach(key => {
            const publishOp = global.publishOperations[key];
            for (const challengeId of ids) {
              if (publishOp.relatedIds.has(challengeId)) {
                console.log(`ID ${challengeId} is part of an active publish operation - skipping delete notification`);
                skipAll = true;
                break;
              }
            }
          });
          
          if (skipAll || !event.state?.user?.id) {
            console.log('Skipping bulk delete notification as it appears to be part of a system operation');
            return;
          }
          
          global.tempChallengeDataMultiple = [];
          
          for (const itemId of ids) {
            try {
              const challenge = await strapi.entityService.findOne('api::challenge.challenge', itemId, {
                populate: '*'
              });
              
              if (challenge) {
                global.tempChallengeDataMultiple.push(challenge);
              }
            } catch (itemError) {
              console.error(`Failed to retrieve challenge data for ID ${itemId}: ${itemError instanceof Error ? itemError.message : String(itemError)}`);
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
        console.error('Could not determine the challenge ID from event params:', event.params);
        return;
      }
      
      if (id === undefined) {
        console.error('ID is undefined after extraction attempts');
        return;
      }
      
      // Check if this ID is part of a publish operation
      let isPartOfPublishOperation = false;
      Object.keys(global.publishOperations).forEach(key => {
        if (global.publishOperations[key].relatedIds.has(id)) {
          isPartOfPublishOperation = true;
        }
      });
      
      // Skip if it's a system operation or part of publish workflow
      if (isPartOfPublishOperation || !event.state?.user?.id) {
        console.log(`Skipping delete notification for challenge ID ${id} as it appears to be part of a system operation`);
        return;
      }
      
      console.log(`beforeDelete: Attempting to find challenge with ID: ${id}`);
      
      // Get the challenge data before it's deleted with explicit ID
      const challenge = await strapi.db.query('api::challenge.challenge').findOne({
        where: { id },
        populate: true
      });
      
      if (challenge) {
        console.log(`Found challenge data for ID ${id} before deletion`);
        global.tempChallengeData = challenge;
      } else {
        console.log(`No challenge found with ID ${id}`);
      }
    } catch (error) {
      console.error(`Failed to retrieve challenge data before deletion: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  async afterDelete(event: LifecycleEvent) {
    try {
      // Clean up old operations
      cleanupOldOperations();
      
      // Check if this was a bulk delete operation
      if (global.tempChallengeDataMultiple && Array.isArray(global.tempChallengeDataMultiple)) {
        console.log(`Processing ${global.tempChallengeDataMultiple.length} challenges for bulk deletion`);
        
        // Process each challenge from our temp storage
        for (const challengeData of global.tempChallengeDataMultiple) {
          await rabbitmq.sendToQueue(QueueType.CHALLENGE_DELETED, {
            id: challengeData.id,
            userId: challengeData.userId,
            name: challengeData.name,
            deletedAt: new Date(),
            triggeredBy: event.state?.user?.id || 'system'
          });
          
          console.log(`Challenge deleted notification sent for challenge ID: ${challengeData.id}`);
        }
        
        // Clean up temp data
        delete global.tempChallengeDataMultiple;
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
        console.error('Could not determine the challenge ID from afterDelete event params:', event.params);
        id = 'unknown';
      }
      
      // Check if this ID is part of a publish operation
      let isPartOfPublishOperation = false;
      Object.keys(global.publishOperations).forEach(key => {
        if (global.publishOperations[key].relatedIds.has(id)) {
          isPartOfPublishOperation = true;
        }
      });
      
      // Skip if it's a system operation or part of publish workflow
      if (isPartOfPublishOperation || !event.state?.user?.id) {
        console.log(`Skipping delete notification for challenge ID ${id} as it appears to be part of a system operation`);
        return;
      }
      
      // Use stored challenge data if available
      const challengeData = global.tempChallengeData || { id };
      
      // Send deletion notification
      await rabbitmq.sendToQueue(QueueType.CHALLENGE_DELETED, {
        id: challengeData.id || id,
        userId: challengeData.userId || 'unknown',
        name: challengeData.name || 'unknown',
        deletedAt: new Date(),
        triggeredBy: event.state?.user?.id || 'system'
      });
      
      console.log(`Challenge deleted notification sent for challenge ID: ${challengeData.id || id}`);
      
      // Clean up temp data
      if (global.tempChallengeData) {
        delete global.tempChallengeData;
      }
    } catch (error) {
      console.error(`Failed to send challenge deletion notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};