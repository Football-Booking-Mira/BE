import { Router } from 'express';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validate from '../../common/middlewares/validBodyRequest.js';
import {
    createEquipment,
    getEquipments,
    getEquipmentDetail,
    updateEquipment,
    deleteEquipment,
} from './equipment.controller.js';
import { createEquipmentSchema, updateEquipmentSchema } from './equipment.schema.js';

const routesEquipment = Router();

routesEquipment.use(authenticate, authorize('admin'));

routesEquipment.get('/', getEquipments);
routesEquipment.post('/', validate(createEquipmentSchema), createEquipment);
routesEquipment.get('/:id', getEquipmentDetail);
routesEquipment.patch('/:id', validate(updateEquipmentSchema), updateEquipment);
routesEquipment.delete('/:id', deleteEquipment);

export default routesEquipment;
