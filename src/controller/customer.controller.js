import * as customerService from "../services/customer.service.js";

const handleError = (res, error, context = "Customer API") => {
  console.error(`[${context}]`, error.stack || error);

  const status = error.statusCode || 500;

  return res.status(status).json({
    success: false,
    message:
      status === 500
        ? error.message || "Internal server error"
        : error.message,
  });
};

// GET /api/customers?search=
export const getCustomers = async (req, res) => {
  try {
    const data = await customerService.listCustomers(
      String(req.query.search || "")
    );

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    return handleError(res, error, "GET CUSTOMERS ERROR");
  }
};

// GET /api/customers/:id
export const getCustomer = async (req, res) => {
  try {
    const data = await customerService.getCustomerById(req.params.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error, "GET CUSTOMER ERROR");
  }
};

// POST /api/customers
export const addCustomer = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || null;

    const customer = await customerService.createCustomer(
      req.body,
      userId
    );

    return res.status(201).json({
      success: true,
      message: "Customer added successfully",
      data: {
        id: String(customer._id),
        _id: customer._id,
        name: customer.name,
        mobile: customer.mobile || "",
      },
    });
  } catch (error) {
    return handleError(res, error, "CREATE CUSTOMER ERROR");
  }
};

// PUT /api/customers/:id
export const editCustomer = async (req, res) => {
  try {
    const customer = await customerService.updateCustomer(
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      data: {
        id: String(customer._id),
        _id: customer._id,
        name: customer.name,
        mobile: customer.mobile || "",
      },
    });
  } catch (error) {
    return handleError(res, error, "UPDATE CUSTOMER ERROR");
  }
};

// DELETE /api/customers/:id
export const removeCustomer = async (req, res) => {
  try {
    const data = await customerService.deleteCustomer(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Customer deleted successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error, "DELETE CUSTOMER ERROR");
  }
};
