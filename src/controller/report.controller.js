import { getReportData } from "../services/report.service.js";

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
