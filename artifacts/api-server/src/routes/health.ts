import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import {
  ensureLocalDataStoreAvailable,
  LOCAL_DATA_STORE_ERROR_CODE,
  LOCAL_DATA_STORE_RECOVERY_MESSAGE,
} from "../lib/remoteLicense";

const router: IRouter = Router();

router.get(["/", "/healthz"], async (_req, res) => {
  try {
    await ensureLocalDataStoreAvailable();
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch {
    res.status(503).json({
      status: "error",
      code: LOCAL_DATA_STORE_ERROR_CODE,
      error: LOCAL_DATA_STORE_RECOVERY_MESSAGE,
    });
  }
});

export default router;
