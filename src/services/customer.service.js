import mongoose from "mongoose";
import Customer from "../model/Customer.js";
import Invoice from "../model/Invoice.js";


export const listCustomers = async (search = "") => {
  const [customers, invoices] = await Promise.all([
    Customer.find({}).sort({ name: 1 }).lean(),
    Invoice.find({
      status: { $in: ["completed", "cancelled"] },
      customer_name: { $exists: true, $ne: "" },
    })
      .select(
        "_id invoice_number customer_name customer_mobile customer_id status grand_total createdAt created_at"
      )
      .sort({ createdAt: -1, created_at: -1 })
      .lean(),
  ]);

  const customerMap = new Map();

  // Existing customer records first
  for (const customer of customers) {
    const mobile = String(customer.mobile || "").trim();
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

  // Build customers from existing invoices too
  for (const invoice of invoices) {
    const name = String(invoice.customer_name || "").trim();
    const mobile = String(invoice.customer_mobile || "").trim();

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

    // Keep the latest available name and mobile
    if (name) customer.name = name;
    if (mobile) customer.mobile = mobile;

    customer.invoiceIds.push(String(invoice._id));

    if (invoice.status === "completed") {
      customer.bills += 1;
      customer.total_sales += Number(invoice.grand_total ?? 0);

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

  const query = search.trim().toLowerCase();

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
