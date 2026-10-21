import mongoose from "mongoose";
import Product from "../model/Product.js";
import Settings from "../model/Settings.js";
import Invoice from "../model/Invoice.js";
import Customer from "../model/Customer.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// --------------------------------------------------
// CUSTOMER CREATE / UPDATE
// --------------------------------------------------

async function upsertInvoiceCustomer(input, user) {
  const name = String(input.customer_name || "").trim();
  const mobile = String(input.customer_mobile || "").trim();

  if (!name || !mobile) {
    throw httpError(400, "Customer name and mobile are required");
  }

  if (input.customer_id) {
    if (!mongoose.isValidObjectId(input.customer_id)) {
      throw httpError(400, "Invalid customer ID");
    }

    const customer = await Customer.findById(input.customer_id);

    if (!customer) {
      throw httpError(404, "Customer not found");
    }

    customer.name = name;
    customer.mobile = mobile;
    await customer.save();

    return customer;
  }

  const existing = await Customer.findOne({ mobile });

  if (existing) {
    existing.name = name;
    await existing.save();
    return existing;
  }

  try {
    return await Customer.create({
      name,
      mobile,
      created_by: mongoose.isValidObjectId(user?.id)
        ? user.id
        : null,
    });
  } catch (error) {
    if (error.code === 11000) {
      const customer = await Customer.findOne({ mobile });

      if (customer) {
        customer.name = name;
        await customer.save();
        return customer;
      }
    }

    throw error;
  }
}

// --------------------------------------------------
// BILLING SETTINGS
// --------------------------------------------------

async function ensureBillingSettings() {
  let settings = await Settings.findOne({ key: "billing" });

  if (!settings) {
    try {
      settings = await Settings.create({
        key: "billing",
        invoice_prefix: "BSS-",
        next_invoice_no: 1,
      });
    } catch (error) {
      // Another request may have created the unique document.
      if (error.code !== 11000) {
        throw error;
      }

      settings = await Settings.findOne({ key: "billing" });
    }
  }

  if (!settings) {
    throw httpError(500, "Unable to initialize billing settings");
  }

  // Repair old documents where the counter is missing or invalid.
  if (
    !Number.isSafeInteger(settings.next_invoice_no) ||
    settings.next_invoice_no < 1
  ) {
    settings.next_invoice_no = 1;
    await settings.save();
  }

  return settings;
}

async function getBillingSettings() {
  const settings = await ensureBillingSettings();
  return settings.toObject();
}

export async function getSettings() {
  const settings = await getBillingSettings();

  return {
    business_name:
      settings.business_name ?? "Bombay Suiting & Shirting",
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    gstin: settings.gstin ?? "",
    invoice_prefix: settings.invoice_prefix ?? "BSS-",
    next_invoice_no: settings.next_invoice_no ?? 1,
    invoice_footer:
      settings.invoice_footer ?? "Thank you for your business!",
    default_price_type: settings.default_price_type ?? "retail",
    allow_discount: settings.allow_discount ?? true,
    billing_can_discount: settings.billing_can_discount ?? true,
    allow_price_override: settings.allow_price_override ?? false,
    billing_can_override: settings.billing_can_override ?? false,
    allow_negative_stock: settings.allow_negative_stock ?? false,
    low_stock_alerts: settings.low_stock_alerts ?? true,
    max_discount_percent: settings.max_discount_percent ?? 10,
    max_discount_amount: settings.max_discount_amount ?? 0,
    payment_methods: settings.payment_methods?.length
      ? settings.payment_methods
      : ["Cash", "UPI", "Card", "Credit", "Other"],
  };
}

// Atomically reserve the next invoice number.
// The first invoice uses the configured next_invoice_no.
async function generateInvoiceNumber() {
  await ensureBillingSettings();

  const settings = await Settings.findOneAndUpdate(
    {
      key: "billing",
      next_invoice_no: { $gte: 1 },
    },
    {
      $inc: { next_invoice_no: 1 },
    },
    {
      new: false,
      runValidators: true,
    }
  ).lean();

  if (!settings) {
    throw httpError(
      500,
      "Could not reserve invoice number. Check billing settings."
    );
  }

  const number = Number(settings.next_invoice_no);
  const prefix = String(settings.invoice_prefix ?? "BSS-");

  if (!Number.isSafeInteger(number) || number < 1) {
    throw httpError(500, "Invalid invoice number counter");
  }

  return `${prefix}${number}`;
}

// --------------------------------------------------
// GET PRODUCTS
// --------------------------------------------------

export async function getProducts(search = "") {
  const filter = { is_active: true };

  if (typeof search !== "string") {
    throw httpError(400, "Invalid product search");
  }

  if (search.trim()) {
    const escaped = search
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.name = { $regex: escaped, $options: "i" };
  }

  const products = await Product.find(filter)
    .select(
      "name sku color brand unit retail_rate wholesale_rate purchase_rate gst_percent current_stock current_piece_stock min_stock"
    )
    .sort({ name: 1 })
    .limit(500)
    .lean();

  return products.map((product) => ({
    ...product,
    id: String(product._id),
  }));
}

// --------------------------------------------------
// STOCK HELPERS
// --------------------------------------------------

function getStockChanges(items) {
  const stockMap = new Map();

  for (const item of items) {
    const productId = String(item.product_id);
    const stockField =
      item.unit === "Piece" ? "current_piece_stock" : "current_stock";

    const previous = stockMap.get(productId) || {
      productId: item.product_id,
      stockField,
      quantity: 0,
    };

    if (previous.stockField !== stockField) {
      throw httpError(409, "Conflicting stock units for invoice items");
    }

    const quantity = Number(item.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError(400, "Invalid invoice item quantity");
    }

    previous.quantity += quantity;
    stockMap.set(productId, previous);
  }

  return [...stockMap.values()];
}

async function applyStockChanges(items, direction, options = {}) {
  const { allowNegativeStock = false } = options;
  const changes = getStockChanges(items);
  const applied = [];

  try {
    for (const stock of changes) {
      const delta = stock.quantity * direction;
      const filter = { _id: stock.productId };

      if (delta < 0 && !allowNegativeStock) {
        filter[stock.stockField] = {
          $gte: Math.abs(delta),
        };
      }

      const result = await Product.updateOne(filter, {
        $inc: { [stock.stockField]: delta },
      });

      if (result.modifiedCount !== 1) {
        throw httpError(
          409,
          `Insufficient or changed stock for product ${stock.productId}. Please retry.`
        );
      }

      applied.push({
        productId: stock.productId,
        stockField: stock.stockField,
        delta,
      });
    }

    return applied;
  } catch (error) {
    for (const change of applied.reverse()) {
      try {
        await Product.updateOne(
          { _id: change.productId },
          { $inc: { [change.stockField]: -change.delta } }
        );
      } catch (rollbackError) {
        console.error(
          "CRITICAL: Stock rollback failed:",
          rollbackError.message
        );
      }
    }

    throw error;
  }
}

async function restoreInvoiceStock(invoice) {
  return applyStockChanges(invoice.items, 1, {
    allowNegativeStock: true,
  });
}

async function deductInvoiceStock(invoice) {
  const settings = await getBillingSettings();

  return applyStockChanges(invoice.items, -1, {
    allowNegativeStock: settings.allow_negative_stock === true,
  });
}

// --------------------------------------------------
// CREATE INVOICE LOGIC
// --------------------------------------------------

async function executeInvoice(input, user) {
  const settings = await getBillingSettings();
  const priceType = input.price_type || settings.default_price_type;

  if (!["retail", "wholesale"].includes(priceType)) {
    throw httpError(400, "Invalid price type");
  }

  if (!settings.payment_methods?.includes(input.payment_method)) {
    throw httpError(400, "Payment method is not allowed");
  }

  if (
    input.apply_gst !== undefined &&
    typeof input.apply_gst !== "boolean"
  ) {
    throw httpError(400, "apply_gst must be true or false");
  }

  const applyGst = input.apply_gst === true;

  const discountType =
    input.discount_type === "fixed"
      ? "amount"
      : input.discount_type || "none";

  const discountValue = input.discount_value ?? 0;

  if (!Number.isFinite(discountValue) || discountValue < 0) {
    throw httpError(400, "Invalid discount value");
  }

  if (!["none", "percent", "amount"].includes(discountType)) {
    throw httpError(400, "Invalid discount type");
  }

  if (discountType !== "none" && !settings.allow_discount) {
    throw httpError(403, "Discounts are disabled");
  }

  if (
    discountType !== "none" &&
    !["admin", "manager"].includes(user.role) &&
    !settings.billing_can_discount
  ) {
    throw httpError(
      403,
      "You do not have permission to apply a discount"
    );
  }

  if (
    discountType === "percent" &&
    discountValue > settings.max_discount_percent
  ) {
    throw httpError(
      400,
      "Discount percentage exceeds the configured limit"
    );
  }

  if (
    discountType === "amount" &&
    settings.max_discount_amount > 0 &&
    discountValue > settings.max_discount_amount
  ) {
    throw httpError(
      400,
      "Discount amount exceeds the configured limit"
    );
  }

  if (discountType === "none" && discountValue !== 0) {
    throw httpError(
      400,
      "Discount value must be zero when discount type is none"
    );
  }

  if (!input.customer_name?.trim()) {
    throw httpError(400, "Customer name is required");
  }

  if (!input.customer_mobile?.trim()) {
    throw httpError(400, "Customer mobile is required");
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw httpError(400, "At least one invoice item is required");
  }

  const canOverrideRate =
    settings.allow_price_override &&
    (["admin", "manager"].includes(user.role) ||
      settings.billing_can_override);

  const uniqueIds = [
    ...new Set(input.items.map((item) => String(item.product_id))),
  ];

  if (uniqueIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw httpError(400, "Invalid product ID");
  }

  const products = await Product.find({
    _id: { $in: uniqueIds },
    is_active: true,
  });

  const productMap = new Map(
    products.map((product) => [String(product._id), product])
  );

  if (productMap.size !== uniqueIds.length) {
    throw httpError(
      400,
      "One or more products do not exist or are inactive"
    );
  }

  let subtotal = 0;
  const invoiceItems = [];
  const stockItems = [];

  for (const item of input.items) {
    const product = productMap.get(String(item.product_id));

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw httpError(400, `Invalid quantity for ${product.name}`);
    }

    const baseRate =
      priceType === "wholesale"
        ? product.wholesale_rate
        : product.retail_rate;

    const rate = item.rate ?? baseRate;

    if (!Number.isFinite(rate) || rate < 0) {
      throw httpError(400, `Invalid rate for ${product.name}`);
    }

    if (!canOverrideRate && rate !== baseRate) {
      throw httpError(
        403,
        `Rate override is not allowed for ${product.name}`
      );
    }

    const amount = money(rate * item.quantity);
    subtotal += amount;

    const productGstPercent = Number(product.gst_percent) || 0;

    if (
      !Number.isFinite(productGstPercent) ||
      productGstPercent < 0 ||
      productGstPercent > 100
    ) {
      throw httpError(400, `Invalid GST percentage for ${product.name}`);
    }

    invoiceItems.push({
      product_id: product._id,
      product_name: product.name,
      category_name: product.category_name || "",
      sku: product.sku || "",
      unit: product.unit,
      quantity: item.quantity,
      piece_quantity: item.piece_quantity || 0,
      rate,
      purchase_rate: product.purchase_rate,
      original_rate: baseRate,
      amount,
      discount_amount: 0,
      taxable_amount: amount,
      gst_percent: applyGst ? productGstPercent : 0,
      gst_amount: 0,
      price_overridden: rate !== baseRate,
    });

    stockItems.push({
      product_id: product._id,
      unit: product.unit,
      quantity: item.quantity,
    });
  }

  subtotal = money(subtotal);

  let discountAmount = 0;

  if (discountType === "percent") {
    discountAmount = money((subtotal * discountValue) / 100);
  } else if (discountType === "amount") {
    discountAmount = money(discountValue);

    if (discountAmount > subtotal) {
      throw httpError(400, "Discount cannot exceed subtotal");
    }
  }

  let gstAmount = 0;
  let distributedDiscount = 0;

  invoiceItems.forEach((item, index) => {
    let itemDiscount = 0;

    if (subtotal > 0 && discountAmount > 0) {
      if (index === invoiceItems.length - 1) {
        itemDiscount = money(discountAmount - distributedDiscount);
      } else {
        itemDiscount = money((item.amount / subtotal) * discountAmount);
        distributedDiscount = money(distributedDiscount + itemDiscount);
      }
    }

    const taxableAmount = money(
      Math.max(0, item.amount - itemDiscount)
    );

    item.discount_amount = itemDiscount;
    item.taxable_amount = taxableAmount;
    item.gst_amount = applyGst
      ? money((taxableAmount * item.gst_percent) / 100)
      : 0;

    gstAmount = money(gstAmount + item.gst_amount);
  });

  const grandTotal = money(
    Math.max(0, subtotal - discountAmount) + gstAmount
  );

  let stockDebited = false;

  try {
    await applyStockChanges(stockItems, -1, {
      allowNegativeStock: settings.allow_negative_stock === true,
    });

    stockDebited = true;

    const invoiceNumber = await generateInvoiceNumber();
    const customer = await upsertInvoiceCustomer(input, user);

    const invoiceData = {
      invoice_number: invoiceNumber,
      customer_name: customer.name,
      customer_mobile: customer.mobile,
      customer_id: customer._id,
      price_type: priceType,
      payment_method: input.payment_method,
      discount_type: discountType,
      discount_value: discountValue,
      subtotal,
      discount_amount: discountAmount,
      apply_gst: applyGst,
      gst_amount: gstAmount,
      grand_total: grandTotal,
      total: grandTotal,
      items: invoiceItems,
      created_by: mongoose.isValidObjectId(user?.id)
        ? user.id
        : null,
    };

    const [invoice] = await Invoice.create([invoiceData]);

    return invoice;
  } catch (error) {
    if (stockDebited) {
      try {
        await applyStockChanges(stockItems, 1, {
          allowNegativeStock: true,
        });
      } catch (rollbackError) {
        console.error(
          "CRITICAL: Create invoice stock rollback failed:",
          rollbackError.message
        );
      }
    }

    throw error;
  }
}

export async function createInvoice(input, user) {
  return executeInvoice(input, user);
}

// --------------------------------------------------
// GET SINGLE INVOICE
// --------------------------------------------------

export async function getInvoiceById(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid invoice ID");
  }

  const invoice = await Invoice.findById(id).lean();

  if (!invoice) {
    throw httpError(404, "Invoice not found");
  }

  return {
    ...invoice,
    id: String(invoice._id),
  };
}

// --------------------------------------------------
// GET INVOICES, SEARCH AND DATE FILTER
// --------------------------------------------------

export async function getInvoices({ from, to, search = "" } = {}) {
  const filter = {};

  if (from || to) {
    filter.createdAt = {};

    if (from) {
      const start = new Date(from);

      if (Number.isNaN(start.getTime())) {
        throw httpError(400, "Invalid from date");
      }

      start.setHours(0, 0, 0, 0);
      filter.createdAt.$gte = start;
    }

    if (to) {
      const end = new Date(to);

      if (Number.isNaN(end.getTime())) {
        throw httpError(400, "Invalid to date");
      }

      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  if (typeof search !== "string") {
    throw httpError(400, "Invalid search query");
  }

  if (search.trim()) {
    const escaped = search
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = [
      { invoice_number: { $regex: escaped, $options: "i" } },
      { customer_name: { $regex: escaped, $options: "i" } },
      { customer_mobile: { $regex: escaped, $options: "i" } },
    ];
  }

  const invoices = await Invoice.find(filter)
    .select(
      "invoice_number customer_name customer_mobile payment_method status subtotal discount_amount gst_amount grand_total total created_by createdAt updatedAt"
    )
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

  const completedInvoices = invoices.filter(
    (invoice) => invoice.status === "completed"
  );

  const summary = {
    total_invoices: invoices.length,
    completed_invoices: completedInvoices.length,
    total_sales: money(
      completedInvoices.reduce(
        (sum, invoice) => sum + Number(invoice.grand_total ?? invoice.total ?? 0),
        0
      )
    ),
  };

  return {
    invoices: invoices.map((invoice) => ({
      ...invoice,
      id: String(invoice._id),
      created_at: invoice.createdAt,
    })),
    summary,
  };
}

function getRecordedPaymentTotal(payments = []) {
  return money(
    payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    )
  );
}

function paymentDTO(payment) {
  return {
    id: String(payment._id),
    amount: Number(payment.amount),
    paid_at: payment.paid_at,
    recorded_by: payment.recorded_by
      ? String(payment.recorded_by)
      : null,
    idempotency_key: payment.idempotency_key || null,
  };
}

export async function getInvoicePaidAmounts() {
  const invoices = await Invoice.find({ status: "completed" })
    .select("_id payments")
    .lean();

  return Object.fromEntries(
    invoices.map((invoice) => [
      String(invoice._id),
      getRecordedPaymentTotal(invoice.payments),
    ])
  );
}

export async function getInvoicePayments(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid invoice ID");
  }

  const invoice = await Invoice.findById(id)
    .select("invoice_number status grand_total total payments")
    .lean();

  if (!invoice) {
    throw httpError(404, "Invoice not found");
  }

  const paidAmount = getRecordedPaymentTotal(invoice.payments);
  const total = Number(invoice.grand_total ?? invoice.total ?? 0);

  if (!Number.isFinite(total) || total < 0) {
    throw httpError(500, "Invoice has an invalid total");
  }

  return {
    invoice_id: String(invoice._id),
    invoice_number: invoice.invoice_number,
    status: invoice.status,
    total,
    paid_amount: paidAmount,
    pending_amount: money(Math.max(0, total - paidAmount)),
    payments: (invoice.payments || []).map(paymentDTO),
  };
}

export async function recordInvoicePayment(id, input, userId) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid invoice ID");
  }

  if (!mongoose.isValidObjectId(userId)) {
    throw httpError(401, "Authentication required");
  }

  if (
    input.amount !== undefined &&
    (!Number.isFinite(input.amount) || input.amount <= 0)
  ) {
    throw httpError(400, "Payment amount must be a positive monetary value");
  }

  const idempotencyKey = input.idempotency_key;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoice = await Invoice.findById(id)
      .select(
        "invoice_number status grand_total total paid_amount payments"
      )
      .lean();

    if (!invoice) {
      throw httpError(404, "Invoice not found");
    }

    if (invoice.status !== "completed") {
      throw httpError(409, "Payments can only be recorded for completed invoices");
    }

    const duplicate = idempotencyKey
      ? (invoice.payments || []).find(
          (payment) => payment.idempotency_key === idempotencyKey
        )
      : null;

    if (duplicate) {
      const paidAmount = getRecordedPaymentTotal(invoice.payments);
      const total = Number(invoice.grand_total ?? invoice.total ?? 0);

      if (!Number.isFinite(total) || total < 0) {
        throw httpError(500, "Invoice has an invalid total");
      }

      return {
        invoice_id: String(invoice._id),
        invoice_number: invoice.invoice_number,
        total,
        paid_amount: paidAmount,
        pending_amount: money(Math.max(0, total - paidAmount)),
        payment: paymentDTO(duplicate),
        payments: (invoice.payments || []).map(paymentDTO),
        duplicate: true,
      };
    }

    const paidBefore = getRecordedPaymentTotal(invoice.payments);
    const total = Number(invoice.grand_total ?? invoice.total ?? 0);

    if (!Number.isFinite(total) || total < 0) {
      throw httpError(500, "Invoice has an invalid total");
    }

    const amount =
      input.paid_amount !== undefined
        ? money(input.paid_amount - paidBefore)
        : money(input.amount);

    if (input.paid_amount !== undefined && amount < 0) {
      throw httpError(400, "Paid amount cannot be lower than recorded payments");
    }

    if (amount === 0) {
      return {
        invoice_id: String(invoice._id),
        invoice_number: invoice.invoice_number,
        total,
        paid_amount: paidBefore,
        pending_amount: money(Math.max(0, total - paidBefore)),
        payment: null,
        payments: (invoice.payments || []).map(paymentDTO),
        duplicate: true,
      };
    }

    const pendingBefore = money(Math.max(0, total - paidBefore));

    if (amount > pendingBefore) {
      throw httpError(400, "Payment cannot exceed the remaining invoice balance");
    }

    const payment = {
      amount,
      paid_at: new Date(),
      recorded_by: userId,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    };
    const currentPaidField = invoice.paid_amount;
    const filter = {
      _id: invoice._id,
      status: "completed",
      ...(currentPaidField === undefined
        ? { paid_amount: { $exists: false } }
        : { paid_amount: currentPaidField }),
    };

    if (idempotencyKey) {
      filter["payments.idempotency_key"] = { $ne: idempotencyKey };
    }

    const updated = await Invoice.findOneAndUpdate(
      filter,
      {
        $set: { paid_amount: money(paidBefore + amount) },
        $push: { payments: payment },
      },
      { new: true, runValidators: true }
    )
      .select(
        "invoice_number grand_total total paid_amount payments"
      )
      .lean();

    if (updated) {
      const paidAmount = getRecordedPaymentTotal(updated.payments);
      const updatedTotal = Number(
        updated.grand_total ?? updated.total ?? 0
      );
      const updatedPayments = updated.payments || [];
      const recordedPayment = updatedPayments[updatedPayments.length - 1];

      return {
        invoice_id: String(updated._id),
        invoice_number: updated.invoice_number,
        total: updatedTotal,
        paid_amount: paidAmount,
        pending_amount: money(Math.max(0, updatedTotal - paidAmount)),
        payment: paymentDTO(recordedPayment),
        payments: (updated.payments || []).map(paymentDTO),
        duplicate: false,
      };
    }
  }

  throw httpError(
    409,
    "Invoice balance changed while recording payment. Please retry."
  );
}

// --------------------------------------------------
// EDIT INVOICE
// --------------------------------------------------

export async function editInvoice(id, input, user) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid invoice ID");
  }

  const invoice = await Invoice.findById(id);

  if (!invoice) {
    throw httpError(404, "Invoice not found");
  }

  if (invoice.status !== "completed") {
    throw httpError(409, "Only completed invoices can be edited");
  }

  if ((invoice.payments || []).length > 0) {
    throw httpError(
      409,
      "Invoices with recorded payments cannot be edited"
    );
  }

  const originalData = invoice.toObject();

  await restoreInvoiceStock(invoice);

  let replacement = null;

  try {
    replacement = await executeInvoice(input, user);
    const replacementData = replacement.toObject();

    for (const key of [
      "_id",
      "__v",
      "invoice_number",
      "created_by",
      "createdAt",
      "updatedAt",
      "status",
      "cancel_reason",
    ]) {
      delete replacementData[key];
    }

    const updatedInvoice = await Invoice.findOneAndUpdate(
      {
        _id: invoice._id,
        status: "completed",
        $or: [
          { payments: { $exists: false } },
          { payments: { $size: 0 } },
        ],
      },
      { $set: replacementData },
      { new: true, runValidators: true }
    );

    if (!updatedInvoice) {
      throw httpError(
        409,
        "Invoice was changed or has a payment. Please reload and retry."
      );
    }

    await Invoice.deleteOne({ _id: replacement._id });

    return updatedInvoice;
  } catch (error) {
    try {
      if (replacement) {
        await restoreInvoiceStock(replacement);
        await Invoice.deleteOne({ _id: replacement._id });
      }

      const originalInvoice = await Invoice.findById(id);

      if (originalInvoice) {
        if ((originalInvoice.payments || []).length === 0) {
          originalInvoice.set(originalData);
          await originalInvoice.save();
        }

        await deductInvoiceStock(originalInvoice);
      } else {
        await deductInvoiceStock(originalData);
      }
    } catch (rollbackError) {
      console.error(
        "CRITICAL: Invoice edit rollback failed:",
        rollbackError.message
      );
    }

    throw error;
  }
}

// --------------------------------------------------
// CANCEL INVOICE
// --------------------------------------------------

export async function cancelInvoice(id, cancelReason = "", user) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid invoice ID");
  }

  if (typeof cancelReason !== "string") {
    throw httpError(400, "Invalid cancellation reason");
  }

  const invoice = await Invoice.findById(id);

  if (!invoice) {
    throw httpError(404, "Invoice not found");
  }

  if ((invoice.payments || []).length > 0) {
    throw httpError(
      409,
      "Invoices with recorded payments cannot be cancelled"
    );
  }

  if (invoice.status === "cancelled") {
    throw httpError(409, "Invoice is already cancelled");
  }

  if (invoice.status !== "completed") {
    throw httpError(409, "Only completed invoices can be cancelled");
  }

  await restoreInvoiceStock(invoice);

  try {
    const cancelledInvoice = await Invoice.findOneAndUpdate(
      {
        _id: invoice._id,
        status: "completed",
        $or: [
          { payments: { $exists: false } },
          { payments: { $size: 0 } },
        ],
      },
      {
        $set: {
          status: "cancelled",
          cancel_reason: cancelReason.trim(),
        },
      },
      { new: true, runValidators: true }
    );

    if (!cancelledInvoice) {
      throw httpError(
        409,
        "Invoice was paid or changed and cannot be cancelled"
      );
    }

    return cancelledInvoice;
  } catch (error) {
    try {
      await deductInvoiceStock(invoice);
    } catch (rollbackError) {
      console.error(
        "CRITICAL: Invoice cancellation rollback failed:",
        rollbackError.message
      );
    }

    throw error;
  }
}

// --------------------------------------------------
// DELETE INVOICE
// --------------------------------------------------

export async function deleteInvoice(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid invoice ID");
  }

  const invoice = await Invoice.findById(id);

  if (!invoice) {
    throw httpError(404, "Invoice not found");
  }

  const shouldRestoreStock = invoice.status === "completed";

  if (shouldRestoreStock) {
    await restoreInvoiceStock(invoice);
  }

  try {
    const deleteFilter = {
      _id: invoice._id,
      status: invoice.status,
      updatedAt: invoice.updatedAt
        ? invoice.updatedAt
        : { $exists: false },
    };
    const result = await Invoice.deleteOne(deleteFilter);

    if (result.deletedCount !== 1) {
      throw httpError(
        409,
        "Invoice was changed and cannot be deleted. Please reload and retry."
      );
    }

    return {
      id: String(invoice._id),
    };
  } catch (error) {
    if (shouldRestoreStock) {
      try {
        await deductInvoiceStock(invoice);
      } catch (rollbackError) {
        console.error(
          "CRITICAL: Invoice deletion rollback failed:",
          rollbackError.message
        );
      }
    }

    throw error;
  }
}
