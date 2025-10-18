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
import { courtSchema, updateCourtSchema } from './court.schema.js';

const routesCourt = Router();

routesCourt.get('/', getListCourts);
routesCourt.get('/:id', getDetailCourt);
routesCourt.delete('/:id', deleteCourt);
routesCourt.delete('/soft-delete/:id', softDeleteCourt);

routesCourt.post('/', validBodyrequest(courtSchema), createCourt);
routesCourt.patch('/:id', validBodyrequest(updateCourtSchema), updateCourt);

export default routesCourt;
