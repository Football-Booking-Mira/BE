import { Router } from 'express';
import { createInvoice, getInvoiceById, getInvoices, updateInvoiceStatus } from './invoice.controller.js';

const routesInvoices = Router();

routesInvoices.post("/", createInvoice);
routesInvoices.get("/", getInvoices);
routesInvoices.get("/:id", getInvoiceById);
routesInvoices.patch("/:id", updateInvoiceStatus);

export default routesInvoices;
