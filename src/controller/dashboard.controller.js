
import { getDashboardData } from "../services/dashboard.service.js";

export async function dashboardController(req, res, next) {
  try {
    const data = await getDashboardData({
      from: req.query.from,
      to: req.query.to,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}
