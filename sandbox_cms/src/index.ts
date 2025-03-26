// src/index.ts
import { rabbitmq, QueueType } from './services/rabbitmq';
import expressSync from './services/express-sync';

export default {
  register(/* { strapi } */) {},

  async bootstrap({ strapi }) {
    // Initialize RabbitMQ connection
    try {
      await rabbitmq.connect();
      console.log('RabbitMQ connection initialized successfully');
      
      // Assert all the queues we need
      // Course queues
      await rabbitmq.assertQueue(QueueType.COURSE_CREATED);
      await rabbitmq.assertQueue(QueueType.COURSE_UPDATED);
      await rabbitmq.assertQueue(QueueType.COURSE_DELETED);
      
      // Challenge queues
      await rabbitmq.assertQueue(QueueType.CHALLENGE_CREATED);
      await rabbitmq.assertQueue(QueueType.CHALLENGE_UPDATED);
      await rabbitmq.assertQueue(QueueType.CHALLENGE_DELETED);
      
      // Initialize Express sync service
      await expressSync.initialize();
      console.log('All RabbitMQ queues have been asserted');
    } catch (error) {
      console.error(`Failed to initialize RabbitMQ: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};