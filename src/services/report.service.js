import mongoose from "mongoose";
import Invoice from "../model/Invoice.js";

function parseDateRange(from, to) {
  if (!from || !to) {
    const error = new Error("Both from and to dates are required.");
    error.statusCode = 400;
    throw error;
  }

  const start = new Date(from);
  const end = new Date(to);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    const error = new Error("Invalid date range.");
    error.statusCode = 400;
    throw error;
  }

  return { start, end };
}

export async function getReportData({ from, to }) {
  const { start, end } = parseDateRange(from, to);

  const invoices = await Invoice.find({
    createdAt: { $gte: start, $lte: end },
  })
    .select(
      "invoice_number customer_name payment_method subtotal discount_amount gst_amount grand_total total status created_by items createdAt"
    )
    .sort({ createdAt: -1 })
    .lean();

  const completed = invoices.filter(
    (invoice) => invoice.status === "completed"
  );

  const cancelled = invoices.filter(
    (invoice) => invoice.status === "cancelled"
  );

  const summary = {
    totalInvoices: invoices.length,
    completedInvoices: completed.length,
    cancelledInvoices: cancelled.length,
    netSales: 0,
    discounts: 0,
    gst: 0,
  };

  for (const invoice of completed) {
    summary.netSales += Number(invoice.grand_total || 0);
    summary.discounts += Number(invoice.discount_amount || 0);
    summary.gst += Number(invoice.gst_amount || 0);
  }

  summary.netSales = Number(summary.netSales.toFixed(2));
  summary.discounts = Number(summary.discounts.toFixed(2));
  summary.gst = Number(summary.gst.toFixed(2));

  const invoiceRows = invoices.map((invoice) => ({
    id: invoice._id.toString(),
    invoice_number: invoice.invoice_number,
    created_at: invoice.createdAt,
    customer_name: invoice.customer_name,
    payment_method: invoice.payment_method,
    subtotal: invoice.subtotal,
    discount_amount: invoice.discount_amount,
    gst_amount: invoice.gst_amount,
    grand_total: invoice.grand_total,
    status: invoice.status,
    created_by: invoice.created_by?.toString() || null,
  }));

  const itemRows = invoices.flatMap((invoice) =>
    (invoice.items || []).map((item) => ({
      id: item._id?.toString() || null,
      product_name: item.product_name,
      unit: item.unit,
      quantity: item.quantity,
      amount: item.amount,
      rate: item.rate,
      original_rate: item.original_rate,
      price_overridden: item.price_overridden,
      invoices: {
        status: invoice.status,
        created_at: invoice.createdAt,
      },
    }))
  );

  return {
    summary,
    invoices: invoiceRows,
    items: itemRows,
  };
}

export async function getReportUsers() {
  const Admin =
    mongoose.models.Admin || mongoose.model("Admin");

  return Admin.find({ is_active: true })
    .select("full_name email role")
    .sort({ full_name: 1 })
    .lean();
}
