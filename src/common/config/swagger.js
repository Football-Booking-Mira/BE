import swaggerAutogen from 'swagger-autogen';
import { HOST, PORT } from './environment.js';
const outputFile = './src/common/config/swagger-output.json';
const endpointsFiles = ['./src/routes/index.js'];
const swaggerConfig = {
    info: {
        title: 'Backend API',
        description: 'API By Trịnh Quốc Hùng',
        version: '1.0.0',
    },
    host: `${HOST}:${PORT}`,
    basePath: '/api',
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],

    securityDefinitions: {
        BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
        },
    },
};

swaggerAutogen()(outputFile, endpointsFiles, swaggerConfig);
