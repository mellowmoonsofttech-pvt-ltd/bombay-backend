
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  createCategory,
} from "../services/product.service.js";

export async function listProductsController(req, res, next) {
  try {
    const products = await listProducts(req.query.search || "", true);
    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    next(error);
  }
}

export async function createProductController(req, res, next) {
  try {
    const product = await createProduct(req.validated?.body ?? req.body);
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateProductController(req, res, next) {
  try {
    const product = await updateProduct(
      req.params.id,
      req.validated?.body ?? req.body
    );
    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteProductController(req, res, next) {
  try {
    const result = await deleteProduct(req.params.id);
    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function listCategoriesController(req, res, next) {
  try {
    const categories = await listCategories();
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCategoryController(req, res, next) {
  try {
    const category = await createCategory(req.validated?.body ?? req.body);
    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    next(error);
  }
}
