import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import { NODE_ENV } from './environment.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const setupSwagger = (app) => {
    // In production, require Admin authentication to access Swagger docs
    const swaggerMiddlewares = NODE_ENV === 'production'
        ? [authenticate, authorize('admin')]
        : [];

    app.use('/api-docs', ...swaggerMiddlewares, swaggerUi.serve, (req, res, next) => {
        try {
            const swaggerDocument = JSON.parse(
                fs.readFileSync('./src/common/config/swagger-output.json', 'utf8')
            );
            req.swaggerDoc = swaggerDocument;
            swaggerUi.setup(swaggerDocument)(req, res, next);
        } catch (error) {
            next(error);
        }
    });
};

export default setupSwagger;
