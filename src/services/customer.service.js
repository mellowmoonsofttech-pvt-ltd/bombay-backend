import mongoose from "mongoose";
import Customer from "../model/Customer.js";
import Invoice from "../model/Invoice.js";

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeMobile = (value = "") =>
  String(value).trim().replace(/\s+/g, "");

const normalizeName = (value = "") => String(value).trim();

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

  for (const customer of customers) {
    const mobile = normalizeMobile(customer.mobile);
    const key = mobile
      ? `mobile:${mobile}`
      : `id:${customer._id}`;

    customerMap.set(key, {
      id: String(customer._id),
      _id: customer._id,
      name: customer.name || "",
      mobile,
      invoiceIds: [],
      bills: 0,
      total_sales: 0,
      last_bill: null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    });
  }

  for (const invoice of invoices) {
    const name = normalizeName(invoice.customer_name);
    const mobile = normalizeMobile(invoice.customer_mobile);

    if (!name && !mobile) continue;

    const key = mobile
      ? `mobile:${mobile}`
      : invoice.customer_id
        ? `id:${invoice.customer_id}`
        : `name:${name.toLowerCase()}`;

    let customer = customerMap.get(key);

    if (!customer) {
      customer = {
        id: `invoice-customer:${key}`,
        _id: null,
        name,
        mobile,
        invoiceIds: [],
        bills: 0,
        total_sales: 0,
        last_bill: null,
        createdAt: invoice.createdAt ?? invoice.created_at ?? null,
        updatedAt: null,
      };

      customerMap.set(key, customer);
    }

    if (name) customer.name = name;
    if (mobile) customer.mobile = mobile;

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

  return [...customerMap.values()]
    .filter((customer) => {
      if (!query) return true;

      return (
        customer.name.toLowerCase().includes(query) ||
        customer.mobile.includes(query)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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
  const mobile = normalizeMobile(input?.mobile);

  if (!name) {
    throw createError("Customer name is required", 400);
  }

  if (name.length > 100) {
    throw createError("Name cannot exceed 100 characters", 400);
  }

  if (mobile.length > 15) {
    throw createError("Mobile cannot exceed 15 characters", 400);
  }

  if (mobile) {
    const existing = await Customer.findOne({ mobile }).lean();

    if (existing) {
      throw createError("A customer with this mobile number already exists", 409);
    }
  }

  return Customer.create({
    name,
    mobile,
    created_by:
      userId && mongoose.isValidObjectId(userId) ? userId : null,
  });
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
    const mobile = normalizeMobile(input.mobile);

    if (mobile.length > 15) {
      throw createError("Mobile cannot exceed 15 characters", 400);
    }

    if (mobile) {
      const existing = await Customer.findOne({
        mobile,
        _id: { $ne: customer._id },
      }).lean();

      if (existing) {
        throw createError(
          "Another customer already uses this mobile number",
          409
        );
      }
    }

    customer.mobile = mobile;
  }

  await customer.save();

  return customer;
};

export const deleteCustomer = async (id) => {
  validateCustomerId(id);

  const customer = await Customer.findById(id);

  if (!customer) {
    throw createError("Customer not found", 404);
  }

  // Preserve customer records linked to invoices.
  const linkedInvoice = await Invoice.exists({
    customer_id: customer._id,
  });

  if (linkedInvoice) {
    throw createError(
      "This customer is linked to invoices and cannot be deleted",
      409
    );
  }

  await Customer.deleteOne({ _id: customer._id });

  return {
    id: String(customer._id),
    name: customer.name,
    mobile: customer.mobile || "",
  };
};
