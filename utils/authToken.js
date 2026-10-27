const jwt = require("jsonwebtoken");

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes");
  }

  return secret;
};

const getJwtExpiry = () => process.env.JWT_EXPIRES_IN || "1h";

const createAccessToken = (userId) =>
  jwt.sign({ sub: String(userId) }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: getJwtExpiry(),
  });

module.exports = { createAccessToken, getJwtSecret };
