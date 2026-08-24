import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

// Validate SESSION_SECRET at startup — refuse to run with a missing/default value
const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret || sessionSecret === "changeme" || sessionSecret === "secret" || sessionSecret.length < 32) {
  logger.error(
    "SESSION_SECRET is missing, too short (< 32 chars), or set to a default placeholder. " +
    "Generate a strong secret: openssl rand -hex 32"
  );
  process.exit(1);
}

const app: Express = express();

// Violet is served through one managed reverse-proxy hop. Trust that proxy so
// rate limits use the caller's forwarded address instead of one shared proxy IP.
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  })
);

// Auth rate limiting — brute-force protection
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute before trying again." },
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: process.env["CORS_ORIGIN"] || true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiter to auth endpoints
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/manager-unlock", authLimiter);

app.use("/api", router);

export default app;
