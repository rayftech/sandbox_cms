// src/services/express-sync.ts
import { rabbitmq, QueueType } from './rabbitmq';

/**
 * Operation types that can be received from Express backend
 */
export enum SyncOperationType {
  CREATE_COURSE = 'CREATE_COURSE',
  UPDATE_COURSE = 'UPDATE_COURSE',
  DELETE_COURSE = 'DELETE_COURSE',
  CREATE_CHALLENGE = 'CREATE_CHALLENGE',
  UPDATE_CHALLENGE = 'UPDATE_CHALLENGE',
  DELETE_CHALLENGE = 'DELETE_CHALLENGE'
}

/**
 * Interface for sync operation requests coming from Express backend
 */
interface SyncOperationRequest {
  correlationId: string;
  operationType: SyncOperationType;
  userId?: string;
  data: any;
  timestamp: Date;
  backendId?: string
}

/**
 * Interface for sync operation responses sent back to Express backend
 */
interface SyncOperationResponse {
  correlationId: string;
  operationType: SyncOperationType;
  status: 'success' | 'error';
  data?: any;
  error?: string;
  timestamp: Date;
  backendId?: string
}

// Queue names for the sync operations
const SYNC_REQUEST_QUEUE = 'strapi_operation_requests';
const SYNC_RESPONSE_QUEUE = 'strapi_operation_responses';

/**
 * Valid values for industry partnerships based on schema.json
 */
const VALID_INDUSTRY_PARTNERSHIPS = [
  'Financial Services',
  'Technology Consulting',
  'Cybersecurity',
  'Digital Transformation',
  'Data Analytics',
  'Enterprise Software',
  'Healthcare Information Systems',
  'Government & Public Sector',
  'Retail Technology',
  'Supply Chain & Logistics',
  'Fintech',
  'Education Technology',
  'Manufacturing Systems',
  'Professional Services',
  'Business Process Outsourcing',
  'Cloud Services',
  'E-commerce',
  'Telecommunications',
  'Intellectual Property & Digital Assets',
  'Business Intelligence'
];

/**
 * Converts plain text to Strapi blocks format for rich text fields
 * @param text Plain text string, potentially with Markdown formatting
 * @returns Structured blocks format for Strapi rich text editor
 */
function convertTextToBlocks(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  console.log('Converting text to blocks format');
  
  return [
    {
      type: 'paragraph',
      children: [
        { type: 'text', text: text }
      ]
    }
  ];
}

/**
 * Service for handling synchronization requests from Express backend
 */
export default {
    /**
     * Initialize the sync service and start consuming messages
     */
    async initialize() {
      try {
        // Connect to RabbitMQ
        await rabbitmq.connect();
        
        // Ensure queues exist
        await rabbitmq.assertQueue(SYNC_REQUEST_QUEUE);
        await rabbitmq.assertQueue(SYNC_RESPONSE_QUEUE);
        
        // Set up channel and start consuming
        const channel = await rabbitmq.getChannel();
        
        // Set prefetch to 1 to ensure we process one message at a time
        await channel.prefetch(1);
        
        // Start consuming messages from the request queue
        await channel.consume(
          SYNC_REQUEST_QUEUE,
          async (msg) => {
            if (!msg) return;
            
            try {
              // Parse the message content
              const content = msg.content.toString();
              const request = JSON.parse(content) as SyncOperationRequest;
              
              console.log(`Received sync operation: ${request.operationType} with correlationId: ${request.correlationId}`);
              
              // Process the operation
              let result;
              try {
                result = await this.processOperation(request);
                
                // Send success response
                await this.sendResponse({
                  correlationId: request.correlationId,
                  operationType: request.operationType,
                  status: 'success',
                  data: result,
                  timestamp: new Date(),
                  backendId: request.backendId  // Pass back the backend ID
                });
              } catch (error) {
                console.error(`Error processing operation: ${error instanceof Error ? error.message : String(error)}`);
                
                // Send error response
                await this.sendResponse({
                  correlationId: request.correlationId,
                  operationType: request.operationType,
                  status: 'error',
                  error: error instanceof Error ? error.message : String(error),
                  timestamp: new Date(),
                  backendId: request.backendId  // Pass back the backend ID
                });
              }
              
              // Acknowledge the message
              channel.ack(msg);
            } catch (error) {
              console.error(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
              // Reject the message and requeue it
              channel.nack(msg, false, true);
            }
          },
          { noAck: false }
        );
        
        console.log('ExpressSync service initialized successfully');
        return true;
      } catch (error) {
        console.error(`Failed to initialize ExpressSync service: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },
  
  /**
   * Process an operation request based on type
   */
  async processOperation(request: SyncOperationRequest) {
    const { operationType, data, userId } = request;
    const strapi = global.strapi;
    
    // Add userId to data if it's provided but not in data
    if (userId && !data.userId) {
      data.userId = userId;
    }
    
    switch (operationType) {
      case SyncOperationType.CREATE_COURSE:
        return this.createCourse(data);
        
      case SyncOperationType.UPDATE_COURSE:
        return this.updateCourse(data);
        
      case SyncOperationType.DELETE_COURSE:
        return this.deleteCourse(data);
        
      case SyncOperationType.CREATE_CHALLENGE:
        return this.createChallenge(data);
        
      case SyncOperationType.UPDATE_CHALLENGE:
        return this.updateChallenge(data);
        
      case SyncOperationType.DELETE_CHALLENGE:
        return this.deleteChallenge(data);
        
      default:
        throw new Error(`Unsupported operation type: ${operationType}`);
    }
  },
  
/**
   * Create a course in Strapi
   */
async createCourse(data) {
    try {
      // Remove strapiId if present to prevent validation errors
      const { ...courseData } = data;
      
      console.log('Processing course data:', JSON.stringify({
        name: courseData.name,
        code: courseData.code,
        hasDescription: !!courseData.description
      }));
      
      // Validate and normalize industry partnership
      if (courseData.targetIndustryPartnership) {
        // Match the industry partnership with schema-defined values
        const industry = courseData.targetIndustryPartnership;
        
        // First try to find an exact match (case-sensitive)
        let normalizedPartnership = VALID_INDUSTRY_PARTNERSHIPS.find(
          p => p === industry
        );
        
        // If no exact match, try case-insensitive match
        if (!normalizedPartnership) {
          normalizedPartnership = VALID_INDUSTRY_PARTNERSHIPS.find(
            p => p.toLowerCase() === industry.toLowerCase()
          );
        }
        
        // If still no match, try with spaces removed (to handle cases like "HealthcareInformationSystems")
        if (!normalizedPartnership) {
          const noSpaceIndustry = industry.replace(/\s+/g, '');
          const partnerships = VALID_INDUSTRY_PARTNERSHIPS.map(p => ({
            original: p,
            noSpace: p.replace(/\s+/g, '')
          }));
          
          const match = partnerships.find(p => 
            p.noSpace.toLowerCase() === noSpaceIndustry.toLowerCase()
          );
          
          if (match) {
            normalizedPartnership = match.original;
          }
        }
    
        if (!normalizedPartnership) {
          throw new Error(`Invalid target industry partnership: ${industry}`);
        }
    
        courseData.targetIndustryPartnership = normalizedPartnership;
      }

      // Convert description from text to blocks format if it exists and is a string
      if (courseData.description && typeof courseData.description === 'string') {
        courseData.description = convertTextToBlocks(courseData.description);
      }
      
      // Map courseLevel if needed
      if (courseData.level && !courseData.courseLevel) {
        const levelMapping = {
          'Undergraduate 1st & 2nd year': 'Undergraduate 1st & 2nd year',
          'Undergraduate penultimate & final year': 'Undergraduate penultimate & final year',
          'Postgraduate': 'Postgraduate',
          'Other': 'Other'
        };
        
        courseData.courseLevel = levelMapping[courseData.level] || courseData.level;
      }

      // Set metadata to identify source of the operation
      const preparedCourseData = {
        ...courseData,
        meta: {
          source: 'express_sync'
        },
        publishedAt: new Date()
      };

      // Ensure global.strapi is available
      if (!global.strapi) {
        throw new Error('Strapi global object is not available');
      }
      
      console.log('Final prepared course data:', JSON.stringify({
        name: preparedCourseData.name,
        code: preparedCourseData.code,
        targetIndustryPartnership: preparedCourseData.targetIndustryPartnership,
        descriptionFormat: preparedCourseData.description ? 'blocks structure' : 'none'
      }));
      
      // Create course using entityService
      const course = await strapi.entityService.create('api::course.course', {
        data: preparedCourseData
      });
      
      return { 
        id: course.id,  // Strapi's internal ID 
        ...course 
      };
    } catch (error) {
      console.error(`Error creating course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
  
  /**
   * Update a course in Strapi
   */
  async updateCourse(data) {
    try {
      const { id, ...updateData } = data;
      
      if (!id) {
        throw new Error('Course ID is required for update operation');
      }
      
      // Validate and normalize industry partnership if present
      if (updateData.targetIndustryPartnership) {
        const industry = updateData.targetIndustryPartnership;
        
        // Try various matching strategies as in createCourse
        let normalizedPartnership = VALID_INDUSTRY_PARTNERSHIPS.find(
          p => p === industry || p.toLowerCase() === industry.toLowerCase()
        );
        
        if (!normalizedPartnership) {
          const noSpaceIndustry = industry.replace(/\s+/g, '');
          const partnerships = VALID_INDUSTRY_PARTNERSHIPS.map(p => ({
            original: p,
            noSpace: p.replace(/\s+/g, '')
          }));
          
          const match = partnerships.find(p => 
            p.noSpace.toLowerCase() === noSpaceIndustry.toLowerCase()
          );
          
          if (match) {
            normalizedPartnership = match.original;
          }
        }
    
        if (!normalizedPartnership) {
          throw new Error(`Invalid target industry partnership: ${industry}`);
        }
    
        updateData.targetIndustryPartnership = normalizedPartnership;
      }
      
      // Convert description from text to blocks format if it exists and is a string
      if (updateData.description && typeof updateData.description === 'string') {
        updateData.description = convertTextToBlocks(updateData.description);
      }
      
      // Map courseLevel if needed
      if (updateData.level && !updateData.courseLevel) {
        const levelMapping = {
          'Undergraduate 1st & 2nd year': 'Undergraduate 1st & 2nd year',
          'Undergraduate penultimate & final year': 'Undergraduate penultimate & final year',
          'Postgraduate': 'Postgraduate',
          'Other': 'Other'
        };
        
        updateData.courseLevel = levelMapping[updateData.level] || updateData.level;
      }
      
      // Set metadata to identify source of the operation
      const courseData = {
        ...updateData,
        meta: {
          source: 'express_sync'
        }
      };
      
      console.log('Updating course with data:', JSON.stringify({
        id,
        name: updateData.name,
        code: updateData.code,
        targetIndustryPartnership: updateData.targetIndustryPartnership,
        descriptionFormat: updateData.description ? 'blocks structure' : 'unchanged'
      }));
      
      // Update course using entityService
      const course = await strapi.entityService.update('api::course.course', id, {
        data: courseData
      });
      
      return { id: course.id, ...course };
    } catch (error) {
      console.error(`Error updating course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
  
  /**
   * Delete a course in Strapi
   */
  async deleteCourse(data) {
    try {
      const { id } = data;
      
      if (!id) {
        throw new Error('Course ID is required for delete operation');
      }
      
      // Delete course using entityService
      const result = await strapi.entityService.delete('api::course.course', id);
      
      return { id, deleted: true };
    } catch (error) {
      console.error(`Error deleting course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
  
  /**
   * Create a challenge in Strapi
   */
  async createChallenge(data) {
    try {
      const { ...challengeData } = data;
      
      // Convert various rich text fields if they exist and are strings
      ['detailDescription', 'Aim', 'potentialSolution', 'additionalInformation'].forEach(field => {
        if (challengeData[field] && typeof challengeData[field] === 'string') {
          challengeData[field] = convertTextToBlocks(challengeData[field]);
        }
      });
      
      // Set metadata to identify source of the operation
      const preparedChallengeData = {
        ...challengeData,
        meta: {
          source: 'express_sync'
        },
        publishedAt: new Date()
      };
      
      // Create challenge using entityService
      const challenge = await strapi.entityService.create('api::challenge.challenge', {
        data: preparedChallengeData
      });
      
      return { id: challenge.id, ...challenge };
    } catch (error) {
      console.error(`Error creating challenge: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
  
  /**
   * Update a challenge in Strapi
   */
  async updateChallenge(data) {
    try {
      const { id, ...updateData } = data;
      
      if (!id) {
        throw new Error('Challenge ID is required for update operation');
      }
      
      // Convert various rich text fields if they exist and are strings
      ['detailDescription', 'Aim', 'potentialSolution', 'additionalInformation'].forEach(field => {
        if (updateData[field] && typeof updateData[field] === 'string') {
          updateData[field] = convertTextToBlocks(updateData[field]);
        }
      });
      
      // Set metadata to identify source of the operation
      const challengeData = {
        ...updateData,
        meta: {
          source: 'express_sync'
        }
      };
      
      // Update challenge using entityService
      const challenge = await strapi.entityService.update('api::challenge.challenge', id, {
        data: challengeData
      });
      
      return { id: challenge.id, ...challenge };
    } catch (error) {
      console.error(`Error updating challenge: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
  
  /**
   * Delete a challenge in Strapi
   */
  async deleteChallenge(data) {
    try {
      const { id } = data;
      
      if (!id) {
        throw new Error('Challenge ID is required for delete operation');
      }
      
      // Delete challenge using entityService
      const result = await strapi.entityService.delete('api::challenge.challenge', id);
      
      return { id, deleted: true };
    } catch (error) {
      console.error(`Error deleting challenge: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
  
  /**
   * Send a response back to the Express backend
   */
  async sendResponse(response: SyncOperationResponse) {
    try {
      const result = await rabbitmq.sendToQueue(
        SYNC_RESPONSE_QUEUE,
        JSON.stringify(response)
      );
      
      if (!result) {
        console.error(`Failed to send response for correlationId: ${response.correlationId}`);
      }
      
      return result;
    } catch (error) {
      console.error(`Error sending response: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
};