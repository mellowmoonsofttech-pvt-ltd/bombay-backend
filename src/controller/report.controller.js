import {
  getReportData,
  getTotalProfit,
} from "../services/report.service.js";

export async function getTotalProfitController(req, res, next) {
  try {
    const totalProfit = await getTotalProfit({
      from: req.query.from,
      to: req.query.to,
    });

    return res.status(200).json({
      success: true,
      data: { totalProfit },
    });
  } catch (error) {
    return next(error);
  }
}

export async function getReportDataController(req, res, next) {
  try {
    const result = await getReportData({
      from: req.query.from,
      to: req.query.to,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}
