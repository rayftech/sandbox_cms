// src/services/rabbitmq.ts
import * as amqp from 'amqplib';

// These should match the queue types in your external RabbitMQ service
export enum QueueType {
  NOTIFICATION = 'notification',
  PARTNERSHIP_REQUEST = 'partnership_request',
  ANALYTICS = 'analytics',
  EMAIL = 'email',
  // Add these for course synchronization
  COURSE_CREATED = 'course_created',
  COURSE_UPDATED = 'course_updated',
  COURSE_DELETED = 'course_deleted'
}

class RabbitMQService {
  private connection: any = null;
  private channel: any = null;
  private readonly host: string = process.env.RABBITMQ_HOST || 'localhost';
  private readonly port: number = parseInt(process.env.RABBITMQ_PORT || '5672', 10);
  private readonly user: string = process.env.RABBITMQ_USER || 'guest';
  private readonly password: string = process.env.RABBITMQ_PASS || 'guest';
  private readonly vhost: string = process.env.RABBITMQ_VHOST || '/';

  async connect(): Promise<any> {
    if (this.channel) {
      return this.channel;
    }

    try {
      console.log('Attempting to connect to RabbitMQ...');
      const connectionString = `amqp://${this.user}:${this.password}@${this.host}:${this.port}${this.vhost}`;
      this.connection = await amqp.connect(connectionString);
      
      this.connection.on('error', (err: Error) => {
        console.error(`RabbitMQ connection error: ${err.message}`);
        this.resetConnection();
      });
      
      this.connection.on('close', () => {
        console.warn('RabbitMQ connection closed');
        this.resetConnection();
      });
      
      this.channel = await this.connection.createChannel();
      
      this.channel.on('error', (err: Error) => {
        console.error(`RabbitMQ channel error: ${err.message}`);
      });
      
      console.info('Successfully connected to RabbitMQ');
      return this.channel;
    } catch (error) {
      console.error(`Failed to connect to RabbitMQ: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  resetConnection(): void {
    this.channel = null;
    this.connection = null;
  }

  // Add this method to your RabbitMQService class
  async assertQueue(
    queue: string | QueueType, 
    options: any = { durable: true }
  ): Promise<any> {
    const channel = await this.getChannel();
    if (!channel) return null;

    try {
      console.log(`Asserting queue: ${queue}`);
      const result = await channel.assertQueue(queue.toString(), options);
      console.log(`Queue ${queue} asserted successfully`);
      return result;
    } catch (error) {
      console.error(`Failed to assert queue '${queue}': ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async sendToQueue(
    queue: string | QueueType, 
    message: any, 
    options: amqp.Options.Publish = { persistent: true }
  ): Promise<boolean> {
    const channel = await this.getChannel();
    if (!channel) return false;

    try {
      const content = Buffer.from(
        typeof message === 'string' ? message : JSON.stringify(message)
      );
      
      return channel.sendToQueue(queue.toString(), content, options);
    } catch (error) {
      console.error(`Failed to send message to queue '${queue}': ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async getChannel(): Promise<any> {
    if (!this.channel) {
      return await this.connect();
    }
    return this.channel;
  }
}

export const rabbitmq = new RabbitMQService();