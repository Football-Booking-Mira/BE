import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
const setupSwagger = (app) => {
    app.use('/api-docs', swaggerUi.serve, (req, res, next) => {
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
