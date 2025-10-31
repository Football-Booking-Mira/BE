import { Router } from 'express';
import {
    createCourt,
    deleteCourt,
    getDetailCourt,
    getListCourts,
    softDeleteCourt,
    updateCourt,
    updateCourtMaintenance,
} from './court.controller.js';
import validBodyrequest from '../../common/middlewares/validBodyRequest.js';
import { courtSchema, updateCourtSchema } from './court.schema.js';
import upload from '../../common/middlewares/upload.middleware.js';

const routesCourt = Router();

routesCourt.get('/', getListCourts);
routesCourt.get('/:id', getDetailCourt);
routesCourt.delete('/:id', deleteCourt);
routesCourt.delete('/soft-delete/:id', softDeleteCourt);

routesCourt.post('/', upload.array('images', 10), validBodyrequest(courtSchema), createCourt);
routesCourt.patch(
    '/:id',
    upload.array('images', 10),
    validBodyrequest(updateCourtSchema),
    updateCourt
);
//Bảo trì
routesCourt.patch('/maintenance/:id', updateCourtMaintenance);

export default routesCourt;
