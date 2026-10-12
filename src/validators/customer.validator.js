export const validateCustomer = (req, res, next) => {
  const { name, mobile = "" } = req.body;

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

  if (typeof mobile !== "string") {
    return res.status(400).json({
      success: false,
      message: "Mobile must be a string",
    });
  }

  const normalizedMobile = mobile.trim();

  if (
    normalizedMobile &&
    !/^[+0-9()\-\s]{7,15}$/.test(normalizedMobile)
  ) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid mobile number",
    });
  }

  req.body.name = name.trim();
  req.body.mobile = normalizedMobile;

  next();
};