
import {
  getSettings,
  getProducts,
  createInvoice,
  getInvoiceById,
  getInvoices,
  editInvoice,
  cancelInvoice,
  deleteInvoice,
} from "../services/billing.service.js";

export async function settingsController(req, res, next) {
  try {
    const settings = await getSettings();
    return res.status(200).json({ success: true, data: settings });
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
      { id: req.user.id, role: req.user.role }
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
    return res.status(200).json({ success: true, data: invoice });
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

export async function editInvoiceController(req, res, next) {
  try {
    const invoice = await editInvoice(
      req.params.id,
      req.validated?.body ?? req.body,
      { id: req.user.id, role: req.user.role }
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
      { id: req.user.id, role: req.user.role }
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
