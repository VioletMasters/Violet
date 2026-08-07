import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import productsRouter from "./products";
import categoriesRouter from "./categories";
import customersRouter from "./customers";
import salesRouter from "./sales";
import inventoryRouter from "./inventory";
import employeesRouter from "./employees";
import suppliersRouter from "./suppliers";
import plansRouter from "./plans";
import reportsRouter from "./reports";
import settingsRouter from "./settings";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(productsRouter);
router.use(categoriesRouter);
router.use(customersRouter);
router.use(salesRouter);
router.use(inventoryRouter);
router.use(employeesRouter);
router.use(suppliersRouter);
router.use(plansRouter);
router.use(reportsRouter);
router.use(settingsRouter);
router.use(adminRouter);

export default router;
