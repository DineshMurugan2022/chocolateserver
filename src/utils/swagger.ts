import swaggerJsdoc from 'swagger-jsdoc';
import { config } from '../config.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ChocoLux API',
      version: '1.0.0',
      description: 'Premium Chocolate E-commerce API Documentation',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Local server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'], // Path to the API docs
};

export const swaggerSpec = swaggerJsdoc(options);
