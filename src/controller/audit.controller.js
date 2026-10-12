import AuditLog from "../model/audit.model.js";

export const getAuditLogsController = async (req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs.map((log) => ({
        ...log,
        id: String(log._id),
        user_id: log.user_id ? String(log.user_id) : null,
        created_at: log.created_at ?? log.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};