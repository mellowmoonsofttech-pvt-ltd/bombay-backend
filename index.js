
import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dns from "node:dns";

import connectDB from "./src/config/db.js";

import billingRoutes from "./src/Routes/billing.routes.js";
import productRoutes from "./src/Routes/product.routes.js";
import customerRoutes from "./src/Routes/customer.routes.js";
import purchaseRoutes from "./src/Routes/purchase.routes.js";
import usersRoutes from "./src/Routes/users.routes.js";
import reportRoutes from "./src/Routes/report.routes.js";
import dashboardRoutes from "./src/Routes/dashboard.routes.js";
import auditRoutes from "./src/Routes/audit.routes.js";

import {
  notFoundHandler,
  errorHandler,
} from "./src/middleware/error.middleware.js";

// DNS resolver
dns.setServers(["1.1.1.1", "8.8.8.8"]);

// Required environment variables
// CORS_ORIGIN is optional.
const requiredEnv = ["MONGODB_URI", "JWT_SECRET"];

for (const key of requiredEnv) {
  if (
    typeof process.env[key] !== "string" ||
    !process.env[key].trim()
  ) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long.");
}

// Initialize Express
const app = express();

app.disable("x-powered-by");

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

// CORS configuration
// CORS_ORIGIN is optional. If configured, only listed origins are allowed.
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

if (
  process.env.NODE_ENV === "production" &&
  allowedOrigins.includes("*")
) {
  throw new Error("Wildcard CORS is not allowed in production.");
}

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header.
      if (!origin) {
        return callback(null, true);
      }

      // Without configured origins, do not grant cross-origin
      // browser access.
      if (allowedOrigins.length === 0) {
        return callback(null, false);
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");

      return callback(
        null,
        allowedOrigins.includes(normalizedOrigin)
      );
    },
    credentials: true,
  })
);

// Security middleware
app.use(helmet());

// Rate limiter
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  })
);

// Body parsing
app.use(
  express.json({
    limit: "100kb",
    strict: true,
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "20kb",
  })
);

// MongoDB connection management
let dbConnectionPromise;

async function ensureDatabaseConnection() {
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectDB().catch((error) => {
      dbConnectionPromise = undefined;
      throw error;
    });
  }

  await dbConnectionPromise;
}

// Database connection middleware for API requests.
// Registered before API routes so the database is ready first.
app.use("/api", async (req, res, next) => {
  try {
    await ensureDatabaseConnection();
    return next();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    if (!res.headersSent) {
      return res.status(503).json({
        success: false,
        message: "Database temporarily unavailable",
      });
    }

    return next(error);
  }
});

// Root route
app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Bombay Suiting & Shirting API is running",
    health: "/api/health",
  });
});

// Health check
app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Bombay Suiting & Shirting backend is running",
  });
});

// Existing API routes
app.use("/api", billingRoutes);
app.use("/api", productRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api", dashboardRoutes);

// Error handlers must be registered last
app.use(notFoundHandler);
app.use(errorHandler);

// Export Express app for Vercel
export default app;

// Start HTTP server locally only
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 5000;

  async function startServer() {
    try {
      await ensureDatabaseConnection();

      const server = app.listen(port, () => {
        // Only a short startup message; no route banner.
        console.log(`Backend running on port ${port}`);
      });

      server.on("error", (error) => {
        console.error("HTTP server error:", error.message);
        process.exit(1);
      });
    } catch (error) {
      console.error(
        "Server startup failed:",
        error instanceof Error ? error.message : error
      );

      process.exit(1);
    }
  }

  startServer();
}
