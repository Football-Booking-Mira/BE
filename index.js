import express from 'express';
import cors from 'cors';
import routes from './src/routes/index.js';
import { notFoundMiddleware } from './src/common/middlewares/notfound.middleware.js';
import { errorMiddleware } from './src/common/middlewares/error.middleware.js';
import { HOST, PORT } from './src/common/config/environment.js';
import { connectDB } from './src/common/config/database.js';
import morgan from 'morgan';
import setupSwagger from './src/common/config/swagger-config.js';

connectDB();
const app = express();
app.use(express.json());

app.use(cors());

app.use(morgan('dev'));

app.use('/api', routes);
setupSwagger(app);
app.use(notFoundMiddleware);

app.use(errorMiddleware);

const server = app.listen(PORT, () => {
    console.log('API RUNNING');
    console.log(`API: http://${HOST}:${PORT}/api`);
    console.log(`Swagger at: http://${HOST}:${PORT}/api-docs`);
});

process.on('unhandledRejection', (error) => {
    console.error(`Error: ${error.message}`);
    server.close(() => process.exit(1));
});
