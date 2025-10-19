const validBodyRequest = (schema) => (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
        return res.status(400).json({
            success: false,
            status: 400,
            errors: r.error.issues.map((i) => ({
                field: i.path.join('.') || '(root)',
                message: i.message,
                code: i.code,
            })),
        });
    }
    req.body = r.data;
    next();
};
export default validBodyRequest;
