import { Router } from 'express';
import routesCourt from '../modules/courts/court.routes.js';

const routes = Router();
routes.use('/courts', routesCourt);
export default routes;
