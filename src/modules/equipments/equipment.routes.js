import { Router } from "express";
import { authenticate, authorize } from "../../common/middlewares/auth.middleware.js";
import validate from "../../common/middlewares/validBodyRequest.js";
import { createEquipment, getEquipments, getEquipmentDetail, updateEquipment, deleteEquipment } from "./equipment.controller.js";
import { createEquipmentSchema, updateEquipmentSchema } from "./equipment.schema.js";

const routesEquipment = Router();

routesEquipment.get("/public",
    // #swagger.tags = ['Equipments']
    // #swagger.summary = 'Lấy danh sách thiết bị (công khai)'
    getEquipments
);

routesEquipment.use(authenticate, authorize("admin"));

routesEquipment.get("/",
    // #swagger.tags = ['Equipments']
    // #swagger.summary = 'Lấy danh sách thiết bị (admin)'
    getEquipments
);

routesEquipment.post("/",
    // #swagger.tags = ['Equipments']
    // #swagger.summary = 'Tạo thiết bị mới'
    validate(createEquipmentSchema),
    createEquipment
);

routesEquipment.get("/:id",
    // #swagger.tags = ['Equipments']
    // #swagger.summary = 'Lấy chi tiết thiết bị theo ID'
    getEquipmentDetail
);

routesEquipment.patch("/:id",
    // #swagger.tags = ['Equipments']
    // #swagger.summary = 'Cập nhật thiết bị theo ID'
    validate(updateEquipmentSchema),
    updateEquipment
);

routesEquipment.delete("/:id",
    // #swagger.tags = ['Equipments']
    // #swagger.summary = 'Xóa thiết bị theo ID'
    deleteEquipment
);

export default routesEquipment;
