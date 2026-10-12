import {
  listPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  deletePurchase,
  recordPurchasePayment,
} from "../services/purchase.service.js";

function handleError(res, error, context) {
  console.error(`[Purchase ${context}]`, error);

  return res.status(error.status || 500).json({
    success: false,
    message:
      error.status && error.status < 500
        ? error.message
        : "An internal server error occurred",
  });
}

export async function listPurchasesController(req, res) {
  try {
    const data = await listPurchases();

    return res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    return handleError(res, error, "list");
  }
}

export async function getPurchaseController(req, res) {
  try {
    const data = await getPurchase(req.params.id);

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "get");
  }
}

export async function createPurchaseController(req, res) {
  try {
    const data = await createPurchase(req.validatedBody, req.user);

    return res.status(201).json({
      success: true,
      message: "Purchase bill created successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error, "create");
  }
}

export async function updatePurchaseController(req, res) {
  try {
    const data = await updatePurchase(req.params.id, req.validatedBody);

    return res.json({
      success: true,
      message: "Purchase bill updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error, "update");
  }
}

export async function deletePurchaseController(req, res) {
  try {
    await deletePurchase(req.params.id);

    return res.json({
      success: true,
      message: "Purchase bill deleted successfully",
    });
  } catch (error) {
    return handleError(res, error, "delete");
  }
}

export async function recordPaymentController(req, res) {
  try {
    const data = await recordPurchasePayment(
      req.params.id,
      req.validatedBody.amount
    );

    return res.json({
      success: true,
      message: "Payment recorded successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error, "payment");
  }
}
