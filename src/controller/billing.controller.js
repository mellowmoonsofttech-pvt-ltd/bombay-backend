
import {
  getSettings,
  getProducts,
  createInvoice,
  getInvoiceById,
  getInvoices,
  editInvoice,
  cancelInvoice,
  deleteInvoice,
  getInvoicePaidAmounts,
  getInvoicePayments,
  recordInvoicePayment,
} from "../services/billing.service.js";

import Settings from "../model/Settings.js";

export async function settingsController(req, res, next) {
  try {
    const settings = await getSettings();

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateSettingsController(req, res, next) {
  try {
    const allowedFields = [
      "business_name",
      "address",
      "phone",
      "email",
      "gstin",
      "invoice_prefix",
      "invoice_footer",
      "default_price_type",
      "allow_discount",
      "billing_can_discount",
      "allow_price_override",
      "billing_can_override",
      "allow_negative_stock",
      "low_stock_alerts",
      "max_discount_percent",
      "max_discount_amount",
      "payment_methods",
    ];

    const body = req.body;

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return res.status(400).json({
        success: false,
        message: "Request body must be a JSON object",
      });
    }

    const updates = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid settings fields provided",
      });
    }

    const settings = await Settings.findOneAndUpdate(
      { key: "billing" },
      {
        $set: updates,
        $setOnInsert: { key: "billing" },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Settings saved successfully",
      data: settings,
    });
  } catch (error) {
    return next(error);
  }
}

export async function productsController(req, res, next) {
  try {
    const products = await getProducts(req.query.search || "");

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    return next(error);
  }
}

export async function createInvoiceController(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const invoice = await createInvoice(
      req.validated?.body ?? req.body,
      {
        id: req.user.id,
        role: req.user.role,
      }
    );

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: invoice,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getInvoiceController(req, res, next) {
  try {
    const invoice = await getInvoiceById(req.params.id);

    return res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getInvoicesController(req, res, next) {
  try {
    const result = await getInvoices({
      from: req.query.from,
      to: req.query.to,
      search: req.query.search || "",
    });

    return res.status(200).json({
      success: true,
      count: result.invoices.length,
      summary: result.summary,
      data: result.invoices,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getInvoicePaidAmountsController(req, res, next) {
  try {
    const data = await getInvoicePaidAmounts();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getInvoicePaymentsController(req, res, next) {
  try {
    const data = await getInvoicePayments(req.params.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export async function recordInvoicePaymentController(req, res, next) {
  try {
    const data = await recordInvoicePayment(
      req.params.id,
      req.validated.body,
      req.user.id
    );

    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export async function editInvoiceController(req, res, next) {
  try {
    const invoice = await editInvoice(
      req.params.id,
      req.validated?.body ?? req.body,
      {
        id: req.user.id,
        role: req.user.role,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Invoice updated successfully",
      data: invoice,
    });
  } catch (error) {
    return next(error);
  }
}

export async function cancelInvoiceController(req, res, next) {
  try {
    const invoice = await cancelInvoice(
      req.params.id,
      req.body?.cancel_reason || "",
      {
        id: req.user.id,
        role: req.user.role,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Invoice cancelled successfully",
      data: invoice,
    });
  } catch (error) {
    return next(error);
  }
}

export async function deleteInvoiceController(req, res, next) {
  try {
    await deleteInvoice(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Invoice deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
}
