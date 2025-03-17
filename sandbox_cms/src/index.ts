// sandbox_cms/src/index.ts
import { rabbitmq } from './services/rabbitmq';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  async bootstrap({ strapi }) {
    // Initialize RabbitMQ connection
    try {
      await rabbitmq.connect();
      strapi.log.info('RabbitMQ connection initialized successfully');
    } catch (error) {
      strapi.log.error(`Failed to initialize RabbitMQ connection: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};