import mongoose from "mongoose";
import Customer from "../model/Customer.js";
import Invoice from "../model/Invoice.js";

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeMobile = (value = "") =>
  String(value).trim().replace(/\D/g, "");

const mobileStorageValue = (value = "") =>
  String(value).trim().replace(/\s+/g, "");

const normalizeName = (value = "") => String(value).trim();
const money = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const validateCustomerId = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw createError("Invalid customer ID", 400);
  }
};

export const listCustomers = async (search = "") => {
  const [customers, invoices] = await Promise.all([
    Customer.find({}).sort({ name: 1 }).lean(),
    Invoice.find({
      status: { $in: ["completed", "cancelled"] },
      customer_name: { $exists: true, $ne: "" },
    })
      .select(
        "_id invoice_number customer_name customer_mobile customer_id status grand_total total createdAt created_at"
      )
      .sort({ createdAt: -1, created_at: -1 })
      .lean(),
  ]);

  const customerMap = new Map();
  const customersById = new Map();
  const customersByMobile = new Map();
  const customersByName = new Map();

  for (const customer of customers) {
    const mobile = normalizeMobile(customer.mobile);
    const key = `customer:${customer._id}`;
    const entry = {
      id: String(customer._id),
      _id: customer._id,
      name: customer.name || "",
      mobile: customer.mobile || "",
      invoiceIds: [],
      bills: 0,
      total_sales: 0,
      last_bill: null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };

    customerMap.set(key, entry);
    customersById.set(String(customer._id), entry);
    if (mobile && !customersByMobile.has(mobile)) {
      customersByMobile.set(mobile, entry);
    }

    const normalizedName = normalizeName(customer.name).toLowerCase();
    if (normalizedName && !customersByName.has(normalizedName)) {
      customersByName.set(normalizedName, entry);
    }
  }

  for (const invoice of invoices) {
    const name = normalizeName(invoice.customer_name);
    const mobile = normalizeMobile(invoice.customer_mobile);
    const customerMobile = String(invoice.customer_mobile || "").trim();

    if (!name && !mobile) continue;

    let customer =
      (invoice.customer_id &&
        customersById.get(String(invoice.customer_id))) ||
      (mobile && customersByMobile.get(mobile)) ||
      (!invoice.customer_id &&
        !mobile &&
        customersByName.get(name.toLowerCase()));

    if (!customer) {
      const key = mobile
        ? `mobile:${mobile}`
        : invoice.customer_id
          ? `id:${invoice.customer_id}`
          : `name:${name.toLowerCase()}`;

      customer = customerMap.get(key);
      if (!customer) {
        customer = {
          id: `invoice-customer:${key}`,
          _id: null,
          name,
          mobile: customerMobile,
          invoiceIds: [],
          bills: 0,
          total_sales: 0,
          last_bill: null,
          createdAt: invoice.createdAt ?? invoice.created_at ?? null,
          updatedAt: null,
        };
        customerMap.set(key, customer);
      }
    }

    if (name) customer.name = name;
    if (customerMobile) customer.mobile = customerMobile;

    customer.invoiceIds.push(String(invoice._id));

    if (invoice.status === "completed") {
      customer.bills += 1;
      customer.total_sales += Number(
        invoice.grand_total ?? invoice.total ?? 0
      );

      const billDate = invoice.createdAt ?? invoice.created_at ?? null;

      if (
        billDate &&
        (!customer.last_bill ||
          new Date(billDate) > new Date(customer.last_bill))
      ) {
        customer.last_bill = billDate;
      }
    }
  }

  const query = String(search).trim().toLowerCase();
  const normalizedQuery = normalizeMobile(query);

  return [...customerMap.values()]
    .filter((customer) => {
      if (!query) return true;

      return (
        customer.name.toLowerCase().includes(query) ||
        (normalizedQuery &&
          normalizeMobile(customer.mobile).includes(normalizedQuery)) ||
        customer.mobile.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const listPendingCustomers = async (search = "") => {
  const invoices = await Invoice.find({ status: "completed" })
    .select(
      "_id invoice_number customer_name customer_mobile customer_id grand_total total payments createdAt"
    )
    .sort({ createdAt: -1 })
    .lean();

  const customerMap = new Map();

  for (const invoice of invoices) {
    const name = normalizeName(invoice.customer_name);
    const mobile = String(invoice.customer_mobile || "").trim();
    const normalizedMobile = normalizeMobile(mobile);
    const key = invoice.customer_id
      ? `customer:${invoice.customer_id}`
      : normalizedMobile
        ? `mobile:${normalizedMobile}`
        : `name:${name.toLowerCase()}`;
    const total = Number(invoice.grand_total ?? invoice.total ?? 0);
    const payments = invoice.payments || [];
    const paidAmount = money(
      payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    );

    if (!Number.isFinite(total) || total < 0 || !Number.isFinite(paidAmount)) {
      throw createError(
        `Invoice ${invoice.invoice_number} has an invalid balance`,
        500
      );
    }

    const customer = customerMap.get(key) || {
      id: invoice.customer_id ? String(invoice.customer_id) : key,
      name,
      mobile,
      bills: 0,
      pending_bills: 0,
      total_billed: 0,
      paid_amount: 0,
      pending_amount: 0,
      invoices: [],
    };
    const pendingAmount = money(Math.max(0, total - paidAmount));

    customer.name = name || customer.name;
    customer.mobile = mobile || customer.mobile;
    customer.bills += 1;
    customer.total_billed = money(customer.total_billed + total);
    customer.paid_amount = money(customer.paid_amount + paidAmount);
    customer.pending_amount = money(
      customer.pending_amount + pendingAmount
    );

    if (pendingAmount > 0) customer.pending_bills += 1;

    customer.invoices.push({
      id: String(invoice._id),
      invoice_number: invoice.invoice_number,
      created_at: invoice.createdAt,
      total,
      paid_amount: paidAmount,
      pending_amount: pendingAmount,
    });

    customerMap.set(key, customer);
  }

  const query = String(search).trim().toLowerCase();
  const normalizedQuery = normalizeMobile(query);
  const pendingCustomers = [...customerMap.values()]
    .filter((customer) => customer.pending_amount > 0)
    .filter((customer) => {
      if (!query) return true;

      return (
        customer.name.toLowerCase().includes(query) ||
        customer.mobile.toLowerCase().includes(query) ||
        (normalizedQuery &&
          normalizeMobile(customer.mobile).includes(normalizedQuery)) ||
        customer.invoices.some((invoice) =>
          invoice.invoice_number.toLowerCase().includes(query)
        )
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    summary: {
      customers_with_pending: pendingCustomers.length,
      bills_with_pending: pendingCustomers.reduce(
        (sum, customer) => sum + customer.pending_bills,
        0
      ),
      total_pending_amount: money(
        pendingCustomers.reduce(
          (sum, customer) => sum + customer.pending_amount,
          0
        )
      ),
    },
    data: pendingCustomers,
  };
};

export const getCustomerById = async (id) => {
  validateCustomerId(id);

  const customer = await Customer.findById(id).lean();

  if (!customer) {
    throw createError("Customer not found", 404);
  }

  return customer;
};

export const createCustomer = async (input, userId = null) => {
  const name = normalizeName(input?.name);
  const mobile = mobileStorageValue(input?.mobile);
  const normalizedMobile = normalizeMobile(mobile);

  if (!name) {
    throw createError("Customer name is required", 400);
  }

  if (name.length > 100) {
    throw createError("Name cannot exceed 100 characters", 400);
  }

  if (mobile.length > 15) {
    throw createError("Mobile cannot exceed 15 characters", 400);
  }

  if (normalizedMobile) {
    const existingCustomers = await Customer.find({})
      .select("+normalized_mobile mobile")
      .lean();
    const existing = existingCustomers.find(
      (customer) =>
        normalizeMobile(customer.mobile) === normalizedMobile
    );

    if (existing) {
      throw createError("A customer with this mobile number already exists", 409);
    }
  }

  try {
    return await Customer.create({
      name,
      mobile,
      ...(normalizedMobile ? { normalized_mobile: normalizedMobile } : {}),
      created_by:
        userId && mongoose.isValidObjectId(userId) ? userId : null,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw createError("A customer with this mobile number already exists", 409);
    }
    throw error;
  }
};

export const updateCustomer = async (id, input) => {
  validateCustomerId(id);

  const customer = await Customer.findById(id);

  if (!customer) {
    throw createError("Customer not found", 404);
  }

  if (input?.name !== undefined) {
    const name = normalizeName(input.name);

    if (!name) {
      throw createError("Customer name is required", 400);
    }

    if (name.length > 100) {
      throw createError("Name cannot exceed 100 characters", 400);
    }

    customer.name = name;
  }

  if (input?.mobile !== undefined) {
    const mobile = mobileStorageValue(input.mobile);
    const normalizedMobile = normalizeMobile(mobile);

    if (mobile.length > 15) {
      throw createError("Mobile cannot exceed 15 characters", 400);
    }

    if (normalizedMobile) {
      const existingCustomers = await Customer.find({
        _id: { $ne: customer._id },
      })
        .select("+normalized_mobile mobile")
        .lean();
      const existing = existingCustomers.find(
        (candidate) =>
          normalizeMobile(candidate.mobile) === normalizedMobile
      );

      if (existing) {
        throw createError(
          "Another customer already uses this mobile number",
          409
        );
      }
    }

    customer.mobile = mobile;
    customer.normalized_mobile = normalizedMobile || undefined;
  }

  try {
    await customer.save();
  } catch (error) {
    if (error.code === 11000) {
      throw createError(
        "Another customer already uses this mobile number",
        409
      );
    }
    throw error;
  }

  return customer;
};

export const deleteCustomer = async (id) => {
  validateCustomerId(id);

  const customer = await Customer.findById(id);

  if (!customer) {
    throw createError("Customer not found", 404);
  }

  // Invoice snapshots and payment records are intentionally left untouched.
  await Customer.deleteOne({ _id: customer._id });

  return {
    id: String(customer._id),
    name: customer.name,
    mobile: customer.mobile || "",
  };
};
