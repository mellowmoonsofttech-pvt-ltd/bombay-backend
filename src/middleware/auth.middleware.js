import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../model/Admin.js";

export async function authenticate(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token || token.length > 4096) {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(500).json({
      success: false,
      message: "JWT authentication is not configured correctly",
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({
      success: false,
      message: "Session expired or token is invalid",
    });
  }

  if (
    !decoded ||
    typeof decoded.sub !== "string" ||
    !mongoose.isValidObjectId(decoded.sub)
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }

  try {
    const user = await Admin.findById(decoded.sub)
      .select("role is_active")
      .lean();

    if (!user || user.is_active === false) {
      return res.status(401).json({
        success: false,
        message: "Account is inactive or no longer exists. Please log in again.",
      });
    }

    if (!["admin", "billing"].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Invalid account role",
      });
    }

    // Always use the current database role, not the role inside an old JWT.
    req.user = {
      id: decoded.sub,
      role: user.role,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

export function allowRoles(...roles) {
  const allowedRoles = roles.map((role) => role.toLowerCase());

  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    return next();
  };
}
