// src/index.ts
import { rabbitmq, QueueType } from './services/rabbitmq';

export default {
  register(/* { strapi } */) {},

  async bootstrap({ strapi }) {
    // Initialize RabbitMQ connection
    try {
      await rabbitmq.connect();
      console.log('RabbitMQ connection initialized successfully');
      
      // Assert all the queues we need
      await rabbitmq.assertQueue(QueueType.COURSE_CREATED);
      await rabbitmq.assertQueue(QueueType.COURSE_UPDATED);
      await rabbitmq.assertQueue(QueueType.COURSE_DELETED);
      
      console.log('All RabbitMQ queues have been asserted');
    } catch (error) {
      console.error(`Failed to initialize RabbitMQ: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};