import mongoose from "mongoose";
import Purchase from "../model/Purchase.js";

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function calculatePurchase(input) {
  const items = input.items.map((item) => {
    const taxableAmount = round2(item.quantity * item.unitPrice);
    const gstAmount = round2(taxableAmount * item.gstPercent / 100);

    return {
      ...item,
      taxableAmount,
      gstAmount,
      lineTotal: round2(taxableAmount + gstAmount),
    };
  });

  const taxableAmount = round2(
    items.reduce((sum, item) => sum + item.taxableAmount, 0)
  );

  const gstAmount = round2(
    items.reduce((sum, item) => sum + item.gstAmount, 0)
  );

  const grandTotal = round2(taxableAmount + gstAmount);
  const paidAmount = round2(input.paidAmount);

  if (paidAmount > grandTotal) {
    throw httpError(400, "Paid amount cannot exceed purchase total");
  }

  const pendingAmount = round2(grandTotal - paidAmount);

  const paymentStatus =
    pendingAmount === 0
      ? "Paid"
      : paidAmount > 0
        ? "Partially Paid"
        : "Pending";

  return {
    ...input,
    items,
    taxableAmount,
    gstAmount,
    grandTotal,
    paidAmount,
    pendingAmount,
    paymentStatus,
  };
}

function toPurchaseDTO(purchase) {
  const doc = purchase.toObject ? purchase.toObject() : purchase;

  return {
    id: String(doc._id),
    invoiceNumber: doc.invoiceNumber,
    purchaseDate: doc.purchaseDate,
    supplierName: doc.supplierName,
    supplierGstin: doc.supplierGstin || "",
    items: doc.items.map((item) => ({
      id: String(item._id),
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      gstPercent: item.gstPercent,
      taxableAmount: item.taxableAmount,
      gstAmount: item.gstAmount,
      lineTotal: item.lineTotal,
    })),
    taxableAmount: doc.taxableAmount,
    gstAmount: doc.gstAmount,
    grandTotal: doc.grandTotal,
    paymentMode: doc.paymentMode,
    paidAmount: doc.paidAmount,
    pendingAmount: doc.pendingAmount,
    paymentStatus: doc.paymentStatus,
    notes: doc.notes || "",
    payments: (doc.payments || []).map((payment) => ({
      id: String(payment._id),
      amount: payment.amount,
      mode: payment.mode,
      paidAt: payment.paidAt,
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function getId(user) {
  return mongoose.isValidObjectId(user?.id) ? user.id : null;
}

export async function listPurchases() {
  const bills = await Purchase.find().sort({ createdAt: -1 }).lean();
  return bills.map(toPurchaseDTO);
}

export async function getPurchase(id) {
  const bill = await Purchase.findById(id);

  if (!bill) throw httpError(404, "Purchase bill not found");

  return toPurchaseDTO(bill);
}

export async function createPurchase(input, user) {
  const calculated = calculatePurchase(input);

  const initialPayments =
    calculated.paidAmount > 0
      ? [{
          amount: calculated.paidAmount,
          mode: calculated.paymentMode,
          paidAt: new Date(),
        }]
      : [];

  const bill = await Purchase.create({
    ...calculated,
    payments: initialPayments,
    created_by: getId(user),
  });

  return toPurchaseDTO(bill);
}

export async function updatePurchase(id, input) {
  const bill = await Purchase.findById(id);

  if (!bill) throw httpError(404, "Purchase bill not found");

  const calculated = calculatePurchase(input);

  // Preserve the historical payment records during editing.
  // Editing paidAmount is allowed only when it matches existing records.
  const recordedPayments = round2(
    bill.payments.reduce((sum, payment) => sum + payment.amount, 0)
  );

  if (Math.abs(recordedPayments - calculated.paidAmount) > 0.009) {
    throw httpError(
      400,
      "Paid amount must match recorded payments. Use Record Payment to add a payment."
    );
  }

  bill.set({
    invoiceNumber: calculated.invoiceNumber,
    purchaseDate: calculated.purchaseDate,
    supplierName: calculated.supplierName,
    supplierGstin: calculated.supplierGstin,
    items: calculated.items,
    taxableAmount: calculated.taxableAmount,
    gstAmount: calculated.gstAmount,
    grandTotal: calculated.grandTotal,
    paymentMode: calculated.paymentMode,
    paidAmount: calculated.paidAmount,
    pendingAmount: calculated.pendingAmount,
    paymentStatus: calculated.paymentStatus,
    notes: calculated.notes,
  });

  await bill.save();

  return toPurchaseDTO(bill);
}

export async function deletePurchase(id) {
  const bill = await Purchase.findByIdAndDelete(id);

  if (!bill) throw httpError(404, "Purchase bill not found");

  return { id: String(bill._id) };
}

export async function recordPurchasePayment(id, amount) {
  const bill = await Purchase.findById(id);

  if (!bill) throw httpError(404, "Purchase bill not found");

  const paymentAmount = round2(amount);
  const pending = round2(bill.grandTotal - bill.paidAmount);

  if (paymentAmount > pending) {
    throw httpError(400, "Payment cannot exceed pending balance");
  }

  bill.payments.push({
    amount: paymentAmount,
    mode: bill.paymentMode,
    paidAt: new Date(),
  });

  bill.paidAmount = round2(bill.paidAmount + paymentAmount);
  bill.pendingAmount = round2(bill.grandTotal - bill.paidAmount);

  bill.paymentStatus =
    bill.pendingAmount === 0
      ? "Paid"
      : bill.paidAmount > 0
        ? "Partially Paid"
        : "Pending";

  await bill.save();

  return toPurchaseDTO(bill);
}
