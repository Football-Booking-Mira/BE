import { Router } from 'express';
import {
    createCourt,
    deleteCourt,
    getDetailCourt,
    getListCourts,
    softDeleteCourt,
    updateCourt,
} from './court.controller.js';
import validBodyrequest from '../../common/middlewares/validBodyRequest.js';
import courtSchema from './court.schema.js';

const routesCourt = Router();

routesCourt.get('/', getListCourts);
routesCourt.get('/:id', getDetailCourt);

routesCourt.delete('/:id', deleteCourt);
routesCourt.delete('/soft-delete/:id', softDeleteCourt);

routesCourt.use(validBodyrequest(courtSchema));
routesCourt.post('/', createCourt);
routesCourt.patch('/:id', updateCourt);
export default routesCourt;
