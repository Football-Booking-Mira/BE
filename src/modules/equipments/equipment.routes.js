import { Router } from "express";
import {
  authenticate,
  authorize,
} from "../../common/middlewares/auth.middleware.js";
import validate from "../../common/middlewares/validBodyRequest.js";
import {
  createEquipment,
  getEquipments,
  getEquipmentDetail,
  updateEquipment,
  deleteEquipment,
} from "./equipment.controller.js";
import {
  createEquipmentSchema,
  updateEquipmentSchema,
} from "./equipment.schema.js";

const routesEquipment = Router();
routesEquipment.get("/public", getEquipments); // user không cần auth

routesEquipment.use(authenticate, authorize("admin"));
routesEquipment.get("/", getEquipments); // hiển thị tất cả thiết bị
routesEquipment.post("/", validate(createEquipmentSchema), createEquipment);
routesEquipment.get("/:id", getEquipmentDetail); // xem chi tiết thiết bị
routesEquipment.patch("/:id", validate(updateEquipmentSchema), updateEquipment);
routesEquipment.delete("/:id", deleteEquipment);

export default routesEquipment;
