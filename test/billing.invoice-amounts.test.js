import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Invoice from "../src/model/Invoice.js";
import Product from "../src/model/Product.js";
import Settings from "../src/model/Settings.js";
import Customer from "../src/model/Customer.js";
import {
  createInvoice,
  editInvoice,
  getInvoiceById,
  getInvoices,
  recordInvoicePayment,
} from "../src/services/billing.service.js";
import { createInvoiceSchema } from "../src/validators/billing.validator.js";

const originalDescriptors = [];

afterEach(() => {
  for (const [target, key, descriptor] of originalDescriptors.splice(0).reverse()) {
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
    } else {
      delete target[key];
    }
  }
});

function replaceMethod(target, key, value) {
  originalDescriptors.push([
    target,
    key,
    Object.getOwnPropertyDescriptor(target, key),
  ]);
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value,
  });
}

function validInvoicePayload(overrides = {}) {
  return {
    customer_name: "Test Customer",
    customer_mobile: "9876543210",
    price_type: "retail",
    payment_method: "Cash",
    discount_type: "none",
    discount_value: 0,
    apply_gst: false,
    items: [
      {
        product_id: "507f1f77bcf86cd799439011",
        quantity: 2,
        rate: 10,
      },
    ],
    ...overrides,
  };
}

function installBillingMocks() {
  const savedInvoices = [];
  const product = {
    _id: "507f1f77bcf86cd799439011",
    name: "Test Fabric",
    category_name: "Fabric",
    sku: "FAB-1",
    unit: "Meter",
    retail_rate: 10,
    wholesale_rate: 9,
    purchase_rate: 5,
    gst_percent: 5,
  };
  const settings = {
    next_invoice_no: 1,
    invoice_prefix: "BSS-",
    default_price_type: "retail",
    payment_methods: ["Cash", "UPI", "Card", "Bank Transfer"],
    allow_negative_stock: false,
    allow_discount: true,
    billing_can_discount: true,
    allow_price_override: true,
    billing_can_override: true,
    max_discount_percent: 100,
    max_discount_amount: 0,
    toObject() {
      return {
        next_invoice_no: this.next_invoice_no,
        invoice_prefix: this.invoice_prefix,
        default_price_type: this.default_price_type,
        payment_methods: this.payment_methods,
        allow_negative_stock: this.allow_negative_stock,
        allow_discount: this.allow_discount,
        billing_can_discount: this.billing_can_discount,
        allow_price_override: this.allow_price_override,
        billing_can_override: this.billing_can_override,
        max_discount_percent: this.max_discount_percent,
        max_discount_amount: this.max_discount_amount,
      };
    },
  };
  const customer = {
    _id: "507f1f77bcf86cd799439012",
    name: "Test Customer",
    mobile: "9876543210",
    async save() {},
  };

  replaceMethod(Settings, "findOne", async () => settings);
  replaceMethod(Settings, "findOneAndUpdate", () => ({
    lean: async () => ({
      invoice_prefix: "BSS-",
      next_invoice_no: 1,
    }),
  }));
  replaceMethod(Product, "find", async () => [product]);
  replaceMethod(Product, "updateOne", async () => ({ modifiedCount: 1 }));
  replaceMethod(Customer, "findOne", async () => customer);
  replaceMethod(Invoice, "create", async ([data]) => {
    const saved = {
      ...data,
      _id: `507f1f77bcf86cd7994390${savedInvoices.length}`,
      toObject() {
        const { toObject, ...plainData } = this;
        return plainData;
      },
    };
    savedInvoices.push(saved);
    return [saved];
  });

  return { savedInvoices };
}

test("invoice schema defaults charges to absent, accepts valid decimals, and rejects invalid values or unknown fields", () => {
  const defaults = createInvoiceSchema.parse(validInvoicePayload());
  assert.equal(defaults.tailor_amount, undefined);
  assert.equal(defaults.handwork_amount, undefined);

  const valid = createInvoiceSchema.parse(
    validInvoicePayload({ tailor_amount: 12.34, handwork_amount: 0 })
  );
  assert.equal(valid.tailor_amount, 12.34);
  assert.equal(valid.handwork_amount, 0);

  for (const field of ["tailor_amount", "handwork_amount"]) {
    for (const amount of [
      -1,
      "1.25",
      Infinity,
      NaN,
      1.234,
      1.000000001,
      100000001,
    ]) {
      const result = createInvoiceSchema.safeParse(
        validInvoicePayload({ [field]: amount })
      );
      assert.equal(
        result.success,
        false,
        `accepted invalid ${field}: ${amount}`
      );
    }
  }

  const unknownField = createInvoiceSchema.safeParse(
    validInvoicePayload({ unexpected: true })
  );
  assert.equal(unknownField.success, false);
});

test("invoice schema accepts Walk-in with blank mobile but requires mobile for named customers", () => {
  const walkIn = createInvoiceSchema.safeParse(
    validInvoicePayload({
      customer_name: "Walk-in",
      customer_mobile: "",
    })
  );
  assert.equal(walkIn.success, true);

  const namedWithoutMobile = createInvoiceSchema.safeParse(
    validInvoicePayload({ customer_mobile: "" })
  );
  assert.equal(namedWithoutMobile.success, false);

  const namedWithMobile = createInvoiceSchema.safeParse(
    validInvoicePayload({ customer_mobile: "9876543210" })
  );
  assert.equal(namedWithMobile.success, true);
});

test("invoice model allows blank mobile only for Walk-in customers", () => {
  const invoiceData = {
    invoice_number: "BSS-TEST",
    customer_name: "Walk-in",
    customer_mobile: "",
    price_type: "retail",
    payment_method: "Cash",
    subtotal: 0,
    total: 0,
    grand_total: 0,
    items: [
      {
        product_id: "507f1f77bcf86cd799439011",
        product_name: "Test Fabric",
        unit: "Meter",
        quantity: 1,
        rate: 0,
        amount: 0,
      },
    ],
  };
  const walkIn = new Invoice(invoiceData);
  assert.equal(walkIn.validateSync(), undefined);

  const named = new Invoice({
    ...invoiceData,
    invoice_number: "BSS-TEST-NAMED",
    customer_name: "Named Customer",
  });
  assert.equal(named.validateSync().errors.customer_mobile.kind, "required");
});

test("invoice creation persists default and valid charges and includes them in grand total", async () => {
  const { savedInvoices } = installBillingMocks();

  const defaultInvoice = await createInvoice(validInvoicePayload(), {
    id: null,
    role: "admin",
  });
  assert.equal(savedInvoices[0].tailor_amount, 0);
  assert.equal(savedInvoices[0].handwork_amount, 0);
  assert.equal(savedInvoices[0].grand_total, 20);
  assert.equal(defaultInvoice.tailor_amount, 0);
  assert.equal(defaultInvoice.handwork_amount, 0);

  const createdWithCharges = await createInvoice(
    validInvoicePayload({
      discount_type: "amount",
      discount_value: 2,
      apply_gst: true,
      tailor_amount: 2.25,
      handwork_amount: 0.75,
    }),
    { id: null, role: "admin" }
  );
  assert.equal(savedInvoices[1].tailor_amount, 2.25);
  assert.equal(savedInvoices[1].handwork_amount, 0.75);
  assert.equal(savedInvoices[1].subtotal, 20);
  assert.equal(savedInvoices[1].discount_amount, 2);
  assert.equal(savedInvoices[1].gst_amount, 0.9);
  assert.equal(savedInvoices[1].grand_total, 21.9);
  assert.equal(createdWithCharges.tailor_amount, 2.25);
  assert.equal(createdWithCharges.handwork_amount, 0.75);
});

test("Walk-in invoice stores the supplied name and blank mobile without a customer record", async () => {
  const { savedInvoices } = installBillingMocks();
  let customerLookups = 0;

  replaceMethod(Customer, "findOne", async () => {
    customerLookups += 1;
    return null;
  });
  replaceMethod(Customer, "create", async () => {
    customerLookups += 1;
    throw new Error("Walk-in invoice must not create a customer");
  });

  const invoice = await createInvoice(
    validInvoicePayload({
      customer_name: "Walk-in",
      customer_mobile: "",
      tailor_amount: 3,
      handwork_amount: 2,
    }),
    { id: null, role: "admin" }
  );

  assert.equal(customerLookups, 0);
  assert.equal(savedInvoices[0].customer_name, "Walk-in");
  assert.equal(savedInvoices[0].customer_mobile, "");
  assert.equal(savedInvoices[0].customer_id, null);
  assert.equal(invoice.customer_name, "Walk-in");
  assert.equal(invoice.customer_mobile, "");
});

test("invoice edits preserve omitted charges and return the persisted values", async () => {
  const { savedInvoices } = installBillingMocks();
  const original = {
    _id: "507f1f77bcf86cd799439099",
    status: "completed",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    tailor_amount: 4.5,
    handwork_amount: 6,
    items: [
      {
        product_id: "507f1f77bcf86cd799439011",
        unit: "Meter",
        quantity: 2,
      },
    ],
    toObject() {
      return { ...this };
    },
  };
  const updated = {
    ...original,
    ...validInvoicePayload(),
    grand_total: 30.5,
  };
  let persistedUpdates;

  replaceMethod(Invoice, "findById", async () => original);
  replaceMethod(Invoice, "findOneAndUpdate", async (_filter, update) => {
    persistedUpdates = update.$set;
    return { ...updated, ...update.$set };
  });
  replaceMethod(Invoice, "deleteOne", async () => ({ deletedCount: 1 }));

  const explicitUpdate = await editInvoice(
    original._id,
    validInvoicePayload({ tailor_amount: 1.25, handwork_amount: 2.5 }),
    { id: null, role: "admin" }
  );
  const preservedUpdate = await editInvoice(
    original._id,
    validInvoicePayload(),
    { id: null, role: "admin" }
  );

  assert.equal(savedInvoices[0].tailor_amount, 1.25);
  assert.equal(savedInvoices[0].handwork_amount, 2.5);
  assert.equal(savedInvoices[0].grand_total, 23.75);
  assert.equal(explicitUpdate.tailor_amount, 1.25);
  assert.equal(explicitUpdate.handwork_amount, 2.5);
  assert.equal(savedInvoices[1].tailor_amount, 4.5);
  assert.equal(savedInvoices[1].handwork_amount, 6);
  assert.equal(savedInvoices[1].grand_total, 30.5);
  assert.equal(persistedUpdates.tailor_amount, 4.5);
  assert.equal(persistedUpdates.handwork_amount, 6);
  assert.equal(persistedUpdates.grand_total, 30.5);
  assert.equal(preservedUpdate.tailor_amount, 4.5);
  assert.equal(preservedUpdate.handwork_amount, 6);
});

test("payment accepts full payment of saved grand total including invoice charges", async () => {
  const invoiceId = "507f1f77bcf86cd799439099";
  const userId = "507f1f77bcf86cd799439098";
  let paymentUpdate;

  replaceMethod(Invoice, "findById", () => ({
    select() {
      return this;
    },
    lean: async () => ({
      _id: invoiceId,
      invoice_number: "BSS-1",
      status: "completed",
      subtotal: 20,
      tailor_amount: 3,
      handwork_amount: 2,
      grand_total: 25,
      total: 25,
      paid_amount: 0,
      payments: [],
    }),
  }));
  replaceMethod(Invoice, "findOneAndUpdate", (_filter, update) => {
    paymentUpdate = update;
    return {
      select() {
        return this;
      },
      lean: async () => ({
        _id: invoiceId,
        invoice_number: "BSS-1",
        grand_total: 25,
        total: 25,
        paid_amount: 25,
        payments: [
          {
            ...update.$push.payments,
            _id: "507f1f77bcf86cd799439097",
          },
        ],
      }),
    };
  });

  const result = await recordInvoicePayment(
    invoiceId,
    { amount: 25 },
    userId
  );

  assert.equal(paymentUpdate.$set.paid_amount, 25);
  assert.equal(result.total, 25);
  assert.equal(result.paid_amount, 25);
  assert.equal(result.pending_amount, 0);
  assert.equal(result.payment.amount, 25);
});

test("invoice detail and list responses return zero for legacy missing charges", async () => {
  const legacyInvoice = {
    _id: "507f1f77bcf86cd799439099",
    invoice_number: "BSS-1",
    customer_name: "Walk-in",
    customer_mobile: "",
    status: "completed",
    subtotal: 20,
    grand_total: 20,
    total: 20,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  let listProjection = "";
  replaceMethod(Invoice, "findById", () => ({
    lean: async () => legacyInvoice,
  }));
  replaceMethod(Invoice, "find", () => ({
    select(fields) {
      listProjection = fields;
      return this;
    },
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    lean: async () => [legacyInvoice],
  }));

  const detail = await getInvoiceById(legacyInvoice._id);
  const list = await getInvoices();

  assert.equal(detail.tailor_amount, 0);
  assert.equal(detail.handwork_amount, 0);
  assert.equal(detail.customer_name, "Walk-in");
  assert.equal(detail.customer_mobile, "");
  assert.equal(list.invoices[0].tailor_amount, 0);
  assert.equal(list.invoices[0].handwork_amount, 0);
  assert.equal(list.invoices[0].customer_name, "Walk-in");
  assert.equal(list.invoices[0].customer_mobile, "");
  assert.match(listProjection, /tailor_amount/);
  assert.match(listProjection, /handwork_amount/);
});
