
import mongoose from "mongoose";
import Product from "../model/Product.js";
import Category from "../model/Category.js";
import Invoice from "../model/Invoice.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanProductInput(input, isNew = false) {
  const data = { ...input };

  for (const key of [
    "sku",
    "brand",
    "color",
    "pattern",
    "hsn_code",
    "description",
  ]) {
    if (data[key] === undefined || data[key] === "") {
      delete data[key];
    }
  }

  if (data.sku) data.sku = data.sku.trim().toUpperCase();

  if (isNew) {
    data.current_stock = data.opening_stock ?? 0;
    data.current_piece_stock = data.unit === "Piece"
      ? data.opening_stock ?? 0
      : 0;
  }

  delete data.opening_stock;
  return data;
}

function toProductDTO(product) {
  const p = product.toObject ? product.toObject() : product;
  const category = p.category_id && typeof p.category_id === "object"
    ? p.category_id
    : null;

  return {
    ...p,
    id: String(p._id),
    category_id: category ? String(category._id) : String(p.category_id ?? ""),
    categories: category
      ? { id: String(category._id), name: category.name }
      : null,
    current_stock: p.current_stock ?? 0,
    current_piece_stock: p.current_piece_stock ?? 0,
    purchase_rate: p.purchase_rate ?? 0,
    wholesale_rate: p.wholesale_rate ?? 0,
    retail_rate: p.retail_rate ?? 0,
    gst_percent: p.gst_percent ?? 5,
    min_stock: p.min_stock ?? 0,
    is_active: p.is_active ?? true,
  };
}

async function validateCategory(categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) {
    throw httpError(400, "Invalid category");
  }

  const category = await Category.findById(categoryId);

  if (!category) throw httpError(400, "Category not found");
  return category;
}

export async function listProducts(search = "", includeInactive = true) {
  const filter = {};

  if (!includeInactive) filter.is_active = true;

  if (search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { sku: { $regex: escaped, $options: "i" } },
      { brand: { $regex: escaped, $options: "i" } },
      { color: { $regex: escaped, $options: "i" } },
    ];
  }

  const products = await Product.find(filter)
    .populate("category_id", "name")
    .sort({ name: 1 })
    .limit(500)
    .lean();

  return products.map(toProductDTO);
}

export async function createProduct(input) {
  await validateCategory(input.category_id);

  const data = cleanProductInput(input, true);

  try {
    const product = await Product.create(data);
    await product.populate("category_id", "name");
    return toProductDTO(product);
  } catch (error) {
    if (error.code === 11000) {
      throw httpError(409, "SKU already exists");
    }
    throw error;
  }
}

export async function updateProduct(id, input) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid product ID");
  }

  await validateCategory(input.category_id);

  const data = cleanProductInput(input);
  // Opening stock is only used during product creation.
  delete data.current_stock;
  delete data.current_piece_stock;

  try {
    const product = await Product.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate("category_id", "name");

    if (!product) throw httpError(404, "Product not found");
    return toProductDTO(product);
  } catch (error) {
    if (error.code === 11000) {
      throw httpError(409, "SKU already exists");
    }
    throw error;
  }
}

export async function deleteProduct(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid product ID");
  }

  const product = await Product.findById(id);
  if (!product) throw httpError(404, "Product not found");

  const hasSales = await Invoice.exists({
    "items.product_id": product._id,
  });

  if (hasSales) {
    throw httpError(409, "Product has sales history. Deactivate it instead.");
  }

  await product.deleteOne();
  return { id };
}

export async function listCategories() {
  const categories = await Category.find().sort({ name: 1 }).lean();

  return categories.map((category) => ({
    ...category,
    id: String(category._id),
  }));
}

export async function createCategory(input) {
  try {
    const category = await Category.create({
      name: input.name.trim(),
    });

    return {
      ...category.toObject(),
      id: String(category._id),
    };
  } catch (error) {
    if (error.code === 11000) {
      throw httpError(409, "Category already exists");
    }
    throw error;
  }
}
