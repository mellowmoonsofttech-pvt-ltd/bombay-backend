import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import connectDB from "./src/config/db.js";

import billingRoutes from "./src/Routes/billing.routes.js";
import productRoutes from "./src/Routes/product.routes.js";
import customerRoutes from "./src/Routes/customer.routes.js";
import purchaseRoutes from "./src/Routes/purchase.routes.js";
import usersRoutes from "./src/Routes/users.routes.js";
import reportRoutes from "./src/Routes/report.routes.js";
import dashboardRoutes from "./src/Routes/dashboard.routes.js";
import auditRoutes from "./src/Routes/audit.routes.js";
import dns from "dns";

import {
  notFoundHandler,
  errorHandler,
} from "./src/middleware/error.middleware.js";


// ===============================
// DNS Resolver
// ===============================

dns.setServers([
  "1.1.1.1",
  "8.8.8.8",
]);

// --------------------------------------------------
// Validate environment variables
// --------------------------------------------------

const requiredEnv = [
  "MONGODB_URI",
  "JWT_SECRET",
  "CORS_ORIGIN",
];

for (const key of requiredEnv) {
  if (
    typeof process.env[key] !== "string" ||
    !process.env[key].trim()
  ) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET must be at least 32 characters long."
  );
}

// --------------------------------------------------
// Initialize Express
// --------------------------------------------------

const app = express();

app.disable("x-powered-by");

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

// --------------------------------------------------
// CORS
// --------------------------------------------------

const allowedOrigins = process.env.CORS_ORIGIN
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  throw new Error(
    "CORS_ORIGIN must contain at least one frontend origin."
  );
}

if (
  process.env.NODE_ENV === "production" &&
  allowedOrigins.includes("*")
) {
  throw new Error(
    "Wildcard CORS is not allowed in production."
  );
}

app.use(
  helmet()
);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without Origin, such as Postman, are allowed.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin not allowed by CORS")
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],

    maxAge: 600,
  })
);

// --------------------------------------------------
// Rate limiter
// --------------------------------------------------

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

// --------------------------------------------------
// Body parsing
// --------------------------------------------------

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

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Bombay Suiting & Shirting backend is running",
  });
});

// --------------------------------------------------
// API routes
// Register all routes before the 404 handler.
// --------------------------------------------------

// Billing, invoices, settings and billing authentication
app.use("/api", billingRoutes);

// Products and categories
app.use("/api", productRoutes);

// Customer management
app.use("/api/customers", customerRoutes);

// Purchases
app.use("/api/purchases", purchaseRoutes);

// Users and authentication
app.use("/api/users", usersRoutes);

// Reports
app.use("/api/reports", reportRoutes);

// Audit logs
app.use("/api/audit", auditRoutes);

// Dashboard
app.use("/api", dashboardRoutes);

// --------------------------------------------------
// Error handlers
// --------------------------------------------------

app.use(notFoundHandler);

app.use(errorHandler);

// --------------------------------------------------
// Connect to MongoDB and start server
// --------------------------------------------------

const port = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    await connectDB();

    const server = app.listen(port, () => {
      console.log("----------------------------------------");
      console.log("Bombay Suiting & Shirting Backend");
      console.log(`Port: ${port}`);
      console.log(`Health: http://localhost:${port}/api/health`);
      console.log("MongoDB: Connected");
      console.log("Billing routes: /api");
      console.log("Product routes: /api");
      console.log("Customer routes: /api/customers");
      console.log("Purchase routes: /api/purchases");
      console.log("User routes: /api/users");
      console.log("Report routes: /api/reports");
      console.log("Audit routes: /api/audit");
      console.log("Dashboard route: /api/dashboard");
      console.log("----------------------------------------");
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
