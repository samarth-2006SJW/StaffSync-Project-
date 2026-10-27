const jwt = require("jsonwebtoken");
const User = require("../Models/User");
const { getJwtSecret } = require("../utils/authToken");

const sendUnauthorized = (res, message = "Invalid or expired authentication token") =>
  res.status(401).json({ success: false, message });

const authenticate = async (req, res, next) => {
  const authorization = req.get("authorization");
  const match = typeof authorization === "string"
    ? authorization.match(/^Bearer\s+([^\s]+)$/i)
    : null;

  if (!match) {
    return sendUnauthorized(res, "Authentication token required");
  }

  let payload;

  try {
    payload = jwt.verify(match[1], getJwtSecret(), { algorithms: ["HS256"] });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return sendUnauthorized(res);
    }

    return next(error);
  }

  if (typeof payload.sub !== "string") {
    return sendUnauthorized(res);
  }

  try {
    const user = await User.findById(payload.sub).select(
      "_id name email role department"
    );

    if (!user) {
      return sendUnauthorized(res, "Authenticated user no longer exists");
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return sendUnauthorized(res, "Authentication required");
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to perform this action",
    });
  }

  return next();
};

module.exports = { authenticate, authorizeRoles };
