
export function validateRequest(schema, source = "body") {
  return (req, res, next) => {
    

    const result = schema.safeParse(req[source]);

    if (!result.success) {
      console.error(
        "VALIDATION FAILED:",
        JSON.stringify(result.error.issues, null, 2)
      );

      return res.status(400).json({
        success: false,
        message: "Invalid request data",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
          code: issue.code
        }))
      });
    }

    req.validated ??= {};
    req.validated[source] = result.data;

    if (source === "body") {
      req.validated.body = result.data;
    }

    
    next();
  };
}
