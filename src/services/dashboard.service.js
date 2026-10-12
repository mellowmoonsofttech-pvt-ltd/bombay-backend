import Invoice from "../model/Invoice.js";
import Product from "../model/Product.js";

const BUSINESS_TIME_ZONE = "Asia/Kolkata";

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Parse YYYY-MM-DD as an IST calendar date.
// Explicit timestamps with timezone information are parsed normally.
function parseDate(value, endOfDay = false) {
  if (!value) return null;

  if (typeof value !== "string") {
    throw createError("Dates must be strings.");
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (dateOnlyMatch) {
    const [, yearText, monthText, dayText] = dateOnlyMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    const check = new Date(Date.UTC(year, month - 1, day));

    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    ) {
      throw createError(`Invalid date: ${value}`);
    }

    // IST is UTC+05:30.
    const utcTime = Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    );

    return new Date(utcTime - 330 * 60 * 1000);
  }

  // Require a timezone for timestamp inputs to avoid ambiguity.
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw createError(
      "Timestamp dates must include a timezone, such as Z or +05:30."
    );
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createError(`Invalid date: ${value}`);
  }

  return parsed;
}

function getDateRange(from, to) {
  const now = new Date();

  const start = from
    ? parseDate(from, false)
    : new Date(now);

  const end = to
    ? parseDate(to, true)
    : new Date(now);

  if (!from) {
    // Build today's start in the business timezone.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value])
    );

    const today = `${values.year}-${values.month}-${values.day}`;
    const parsedStart = parseDate(today, false);
    start.setTime(parsedStart.getTime());
  }

  if (!to) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value])
    );

    const today = `${values.year}-${values.month}-${values.day}`;
    const parsedEnd = parseDate(today, true);
    end.setTime(parsedEnd.getTime());
  }

  if (start > end) {
    throw createError("'from' date must be before or equal to 'to' date.");
  }

  return { start, end };
}

function dateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function monthKey(date) {
  return dateKey(date).slice(0, 7);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getBusinessDateKeys(start, end) {
  const keys = [];
  let cursor = start;

  while (cursor <= end && keys.length < 3700) {
    keys.push(dateKey(cursor));
    cursor = addDays(cursor, 24 * 60 * 60 * 1000);
  }

  return keys;
}

export async function getDashboardData({ from, to } = {}) {
  const { start, end } = getDateRange(from, to);

  const [periodInvoices, allTimeCounts, products] = await Promise.all([
    Invoice.find({
      createdAt: { $gte: start, $lte: end },
    })
      .select("invoice_number status grand_total createdAt items")
      .sort({ createdAt: 1 })
      .lean(),

    Invoice.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),

    Product.find({ is_active: true })
      .select(
        "name sku unit current_stock current_piece_stock min_stock"
      )
      .sort({ name: 1 })
      .lean(),
  ]);

  const completed = periodInvoices.filter(
    (invoice) => invoice.status === "completed"
  );

  const cancelled = periodInvoices.filter(
    (invoice) => invoice.status === "cancelled"
  );

  const totalSales = money(
    completed.reduce(
      (sum, invoice) => sum + Number(invoice.grand_total || 0),
      0
    )
  );

  const dailyMap = new Map();
  const monthlyMap = new Map();
  const topProductsMap = new Map();

  // Include every day in the selected range, even if sales are zero.
  const dayKeys = getBusinessDateKeys(start, end);

  for (const day of dayKeys) {
    dailyMap.set(day, 0);

    const month = day.slice(0, 7);
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, 0);
    }
  }

  for (const invoice of completed) {
    const createdAt = new Date(invoice.createdAt);
    const day = dateKey(createdAt);
    const month = monthKey(createdAt);
    const amount = Number(invoice.grand_total || 0);

    dailyMap.set(
      day,
      money((dailyMap.get(day) || 0) + amount)
    );

    monthlyMap.set(
      month,
      money((monthlyMap.get(month) || 0) + amount)
    );

    for (const item of invoice.items || []) {
      const productId = item.product_id
        ? String(item.product_id)
        : `name:${item.product_name || "Unknown product"}`;

      const previous = topProductsMap.get(productId) || {
        product_id: item.product_id ? String(item.product_id) : "",
        product_name: item.product_name || "Unknown product",
        sku: item.sku || "",
        quantity: 0,
        revenue: 0,
      };

      previous.quantity += Number(item.quantity || 0);
      previous.revenue = money(
        previous.revenue + Number(item.amount || 0)
      );

      topProductsMap.set(productId, previous);
    }
  }

  const meterStock = money(
    products
      .filter((product) => product.unit === "Meter")
      .reduce(
        (sum, product) => sum + Number(product.current_stock || 0),
        0
      )
  );

  const pieceStock = money(
    products
      .filter((product) => product.unit === "Piece")
      .reduce(
        (sum, product) =>
          sum + Number(product.current_piece_stock || 0),
        0
      )
  );

  const lowStockProducts = products
    .filter((product) => {
      const quantity =
        product.unit === "Piece"
          ? Number(product.current_piece_stock || 0)
          : Number(product.current_stock || 0);

      return quantity <= Number(product.min_stock || 0);
    })
    .map((product) => ({
      id: String(product._id),
      name: product.name,
      sku: product.sku || "",
      unit: product.unit,
      current_stock:
        product.unit === "Piece"
          ? Number(product.current_piece_stock || 0)
          : Number(product.current_stock || 0),
      min_stock: Number(product.min_stock || 0),
    }));

  const statusCounts = Object.fromEntries(
    allTimeCounts.map((item) => [item._id, item.count])
  );

  const allTimeTotal = Object.values(statusCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    period: {
      from: start.toISOString(),
      to: end.toISOString(),
      timezone: BUSINESS_TIME_ZONE,
    },

    sales: {
      total_sales: totalSales,
      completed_invoices: completed.length,
      cancelled_invoices: cancelled.length,
      total_invoices: periodInvoices.length,
    },

    all_time: {
      total_invoices: allTimeTotal,
      completed_invoices: statusCounts.completed || 0,
      cancelled_invoices: statusCounts.cancelled || 0,
    },

    charts: {
      daily_sales: [...dailyMap.entries()].map(([date, total]) => ({
        date,
        total,
      })),

      monthly_sales: [...monthlyMap.entries()].map(([month, total]) => ({
        month,
        total,
      })),
    },

    top_products: [...topProductsMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),

    stock: {
      total_active_products: products.length,
      meter_stock: meterStock,
      piece_stock: pieceStock,
      low_stock_count: lowStockProducts.length,
      low_stock_products: lowStockProducts,
    },
  };
}
