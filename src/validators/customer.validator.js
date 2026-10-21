import { z } from "zod";

export const validateCustomer = (req, res, next) => {
  const { name, mobile } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Customer name is required",
    });
  }

  if (name.trim().length > 100) {
    return res.status(400).json({
      success: false,
      message: "Customer name cannot exceed 100 characters",
    });
  }

  if (mobile !== undefined && typeof mobile !== "string") {
    return res.status(400).json({
      success: false,
      message: "Mobile must be a string",
    });
  }

  const normalizedMobile =
    typeof mobile === "string" ? mobile.trim() : undefined;

  if (
    normalizedMobile !== undefined &&
    normalizedMobile &&
    !/^(?=(?:\D*\d){7,15}\D*$)[+0-9()\-\s]{7,15}$/.test(
      normalizedMobile
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid mobile number",
    });
  }

  req.body.name = name.trim();
  if (normalizedMobile !== undefined) {
    req.body.mobile = normalizedMobile;
  }

  next();
};

export const customerIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid customer ID"),
});