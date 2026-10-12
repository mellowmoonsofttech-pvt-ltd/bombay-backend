
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Admin from "../model/Admin.js";

const validRoles = ["admin", "billing"];

export const getProfilesController = async (req, res, next) => {
  try {
    const users = await Admin.find({})
      .select("full_name email role is_active createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: users.map(({ _id, ...user }) => ({
        ...user,
        id: _id.toString(),
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const createStaffUserController = async (req, res, next) => {
  try {
    const full_name =
      typeof req.body?.full_name === "string"
        ? req.body.full_name.trim()
        : "";

    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const password = req.body?.password;
    const role = req.body?.role;

    if (!full_name || full_name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid full name",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email",
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 6 ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be 6 to 128 characters",
      });
    }

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be admin or billing",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await Admin.create({
      full_name,
      email,
      password: passwordHash,
      role,
      is_active: true,
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        id: user._id.toString(),
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered",
      });
    }
    next(error);
  }
};

export const updateStaffUserController = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await Admin.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const { role, is_active, password } = req.body ?? {};

    if (
      role === undefined &&
      is_active === undefined &&
      password === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "No update fields provided",
      });
    }

    if (role !== undefined && !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be admin or billing",
      });
    }

    if (
      is_active !== undefined &&
      typeof is_active !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "is_active must be true or false",
      });
    }

    if (
      password !== undefined &&
      (typeof password !== "string" ||
        password.length < 6 ||
        password.length > 128)
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be 6 to 128 characters",
      });
    }

    const isSelf = user._id.toString() === req.user.id;

    if (isSelf && (role === "billing" || is_active === false)) {
      return res.status(400).json({
        success: false,
        message: "You cannot remove your own admin access",
      });
    }

    const removingAdmin =
      user.role === "admin" &&
      (role === "billing" || is_active === false);

    if (removingAdmin && user.is_active) {
      const count = await Admin.countDocuments({
        role: "admin",
        is_active: true,
      });

      if (count <= 1) {
        return res.status(400).json({
          success: false,
          message: "At least one active admin must remain",
        });
      }
    }

    if (role !== undefined) user.role = role;
    if (is_active !== undefined) user.is_active = is_active;

    if (password !== undefined) {
      user.password = await bcrypt.hash(password, 12);
    }

    await user.save();

    return res.json({
      success: true,
      message: "User updated successfully",
      data: {
        id: user._id.toString(),
        full_name: user.full_name || "",
        email: user.email,
        role: user.role,
        is_active: user.is_active,
      },
    });
  } catch (error) {
    next(error);
  }
};
