import { Router } from 'express';
import {
    createCourt,
    deleteCourt,
    getDetailCourt,
    getListCourts,
    softDeleteCourt,
    updateCourt,
} from './court.controller.js';
const routesCourt = Router();
routesCourt.post('/', createCourt);
routesCourt.get('/', getListCourts);
routesCourt.get('/:id', getDetailCourt);
routesCourt.patch('/:id', updateCourt);
routesCourt.delete('/:id', deleteCourt);
routesCourt.delete('/soft-delete/:id', softDeleteCourt);
export default routesCourt;
